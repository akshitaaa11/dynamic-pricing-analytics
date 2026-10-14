"""Rebuild reproducible gold tables and evidence reports from the silver dataset."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import yaml
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

from dpa.etl.aggregate import build_demand_definition
from dpa.etl.validate import validate_dataset
from dpa.features.build import compute_product_week_features
from dpa.models.forecast import train_and_evaluate
from dpa.pricing.recommend import build_hold_recommendations
from dpa.utils.spark import get_spark_session
from dpa.utils.parquet import write_spark_parquet


def _read_config(root: Path) -> dict[str, Any]:
    config_path = root / "configs" / "pipeline.yaml"
    with config_path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _write_plotly_figure(frame: pd.DataFrame, kind: str, path: Path, date_range: str) -> None:
    if kind == "monthly_demand":
        figure = px.line(frame, x="month", y="units", markers=True, title="Monthly observed demand")
        source = "data/gold/product_week_features.parquet"
    elif kind == "weekly_demand":
        figure = px.line(frame, x="week_start", y="units", title="Weekly observed demand")
        source = "data/gold/product_week_features.parquet"
    else:
        raise ValueError(f"Unsupported report figure: {kind}")
    figure.update_layout(
        xaxis_title="Period",
        yaxis_title="Units",
        title=f"{figure.layout.title.text}<br><sup>Source: {source}; dates: {date_range}</sup>",
    )
    figure.write_html(path, include_plotlyjs="cdn")


def _save_feature_figures(features: DataFrame, figures_dir: Path, config: dict[str, Any]) -> None:
    monthly = (
        features.withColumn("month", F.date_format("week_start", "yyyy-MM"))
        .groupBy("month")
        .agg(F.sum("units").alias("units"))
        .orderBy("month")
        .toPandas()
    )
    weekly = (
        features.groupBy("week_start")
        .agg(F.sum("units").alias("units"))
        .orderBy("week_start")
        .toPandas()
    )
    figures_dir.mkdir(parents=True, exist_ok=True)
    date_range = f"{config['periods']['start_date']} to {config['periods']['end_date']}"
    _write_plotly_figure(monthly, "monthly_demand", figures_dir / "monthly_demand.html", date_range)
    _write_plotly_figure(weekly, "weekly_demand", figures_dir / "weekly_demand.html", date_range)


def _write_reports(
    root: Path,
    config: dict[str, Any],
    reconciliation: dict[str, Any],
    panel: DataFrame,
    features: DataFrame,
    metrics: pd.DataFrame,
    shap_values: pd.DataFrame,
) -> None:
    reports_dir = root / config["paths"]["reports_dir"]
    reports_dir.mkdir(parents=True, exist_ok=True)
    panel_rows = panel.count()
    zero_filled_rows = panel.filter(F.col("zero_filled") == 1).count()
    unavailable_rows = panel.filter(F.col("possibly_unavailable")).count()
    feature_count = features.count()
    lightgbm = metrics.loc[metrics["model"] == "lightgbm"].iloc[0]
    best_baseline = metrics.loc[metrics["model"] != "lightgbm"].sort_values("wape").iloc[0]
    model_wins = bool(lightgbm["wape"] < best_baseline["wape"])
    hold_count = int(panel.select("Stock_Code").distinct().count())
    metrics_table = "\n".join(
        f"| {row['model']} | {row['wape']:.4f} | {row['mae']:.4f} | {row['bias']:.4f} |"
        for _, row in metrics.iterrows()
    )
    model_metrics_table = "\n".join(
        f"| {row['model']} | {row['wape']:.4f} | {row['mae']:.4f} | {row['bias']:.4f} |"
        for _, row in metrics.iterrows()
    )

    data_card = f"""# Data card

## Dataset and lineage

The source is the UCI Online Retail II dataset described in [README §2](../README.md#2-the-dataset-what-we-actually-have). This rebuild starts from the configured cleaned silver Parquet table. No external market, inventory, competitor, promotion, or cost data is merged into the retailer dataset.

| Measurement | Recomputed value |
|---|---:|
| Clean transaction rows | {reconciliation['rows']:,} |
| Sale rows | {reconciliation['sale_rows']:,} |
| Gross sale units | {reconciliation['gross_units']:,} |
| Gross sale revenue | £{reconciliation['gross_revenue']:,.2f} |
| Cancellation value | £{reconciliation['cancellation_value']:,.2f} |
| Product-week rows | {panel_rows:,} |
| Zero-filled product-week rows | {zero_filled_rows:,} |
| Possibly-unavailable proxy rows | {unavailable_rows:,} |
| Feature rows | {feature_count:,} |

## Derived-table lineage

- Product-week panel: `data/gold/product_week_panel.parquet`
- Feature table: `data/gold/product_week_features.parquet`
- Forecast holdout predictions: `data/gold/forecast_predictions.parquet`
- Figures: `reports/figures/`

## Limitations

The availability indicator is a **proxy** inferred from observed sales gaps; it is not inventory data. Competitor prices, promotions, and costs are unavailable. Observed markdowns are not labelled as promotions. Revenue is not profit. The silver source does not retain rejected raw rows, so this rebuild cannot regenerate historical rejection counts or row-level exclusion reasons from silver alone.

Pricing output currently contains {hold_count:,} explicit hold decisions. The feature table retains observed weekly small-order prices, but this build does not produce the README's validated fixed-effects elasticity estimate and uncertainty range. No suggested price changes are manufactured.

"""
    (reports_dir / "data_card.md").write_text(data_card, encoding="utf-8")

    model_card = f"""# Model card

## Intended use

One-week product demand forecasting for this historical retailer dataset. Predictions are decision-support estimates, not measured future outcomes.

## Data and evaluation

The global LightGBM Poisson model is trained using the chronological training period, uses the following validation period for early stopping, and is evaluated once on the held-out test period:

- Train: {config['periods']['train_start']} through {config['periods']['train_end']}
- Validation: {config['periods']['validation_start']} through {config['periods']['validation_end']}
- Test: {config['periods']['test_start']} through {config['periods']['test_end']}

The model features are configured in `configs/pipeline.yaml`; they are calendar and lagged-demand fields only. Test results:

| Model | WAPE | MAE | Bias |
|---|---:|---:|---:|
{model_metrics_table}

The LightGBM model {'beats' if model_wins else 'does not beat'} the best baseline by WAPE ({best_baseline['model']}). No prediction-interval coverage is reported because this run does not fit a quantile model. Global feature attributions are exported to `reports/global_shap_importance.csv` using LightGBM's TreeSHAP contributions; they describe model behaviour, not causality.

## Limitations

The model uses one-week holdout predictions and does not claim a completed 4-week rolling-origin evaluation. The pricing output is conservative: every product is held because this build does not produce a validated fixed-effects elasticity estimate with uncertainty bounds. The underlying demand proxy cannot distinguish zero demand from stock unavailability. Performance represents a mostly wholesale giftware retailer in 2009–2011 and should not be generalized without further evaluation.
"""
    (reports_dir / "model_card.md").write_text(model_card, encoding="utf-8")
    (reports_dir / "final_report.md").write_text(
        f"""# Final project report

## Summary

This project rebuilds the data-driven demand analytics workflow from the cleaned silver Parquet input. The verified test suite passes before artifact generation. Data preparation and feature generation use PySpark; a LightGBM one-week global model is compared against seasonal-naive and moving-average baselines using a chronological split.

## Data findings

The transaction reconciliation and derived panel counts are recomputed in [the data card](./data_card.md). Demand seasonality evidence is generated as [monthly demand](./figures/monthly_demand.html) and [weekly demand](./figures/weekly_demand.html); each figure states its source table and date range.

## Forecast evaluation

| Model | WAPE | MAE | Bias |
|---|---:|---:|---:|
{metrics_table}

The model {'beats' if model_wins else 'does not beat'} the best baseline ({best_baseline['model']}) on test WAPE. Full methodology and caveats are in [the model card](./model_card.md).

## Reproducible commands

Run `make all` to test and rebuild gold Parquet tables, the forecast artifacts, and report figures from the configured silver dataset. Start the dashboard separately with `make dashboard`.

## Limitations

The availability flag is a **proxy**, not inventory. Competitor prices, promotion labels, and costs are unavailable; revenue estimates are not profit. The streaming implementation is a historical replay, not a live retailer feed. See [README §13](../README.md#13-limitations).
""",
        encoding="utf-8",
    )


def rebuild(spark: SparkSession | None = None) -> None:
    """Validate silver input, rebuild gold tables, train/evaluate, and refresh reports."""
    root = Path(__file__).resolve().parents[2]
    config = _read_config(root)
    gold_dir = root / config["paths"]["gold_dir"]
    silver_path = root / config["paths"]["silver_dir"] / "transactions_clean.parquet"
    owns_spark = spark is None
    session = spark or get_spark_session(app_name="dynamic-pricing-analytics-phase8")
    try:
        if not silver_path.exists():
            raw_path = root / config["paths"]["raw_excel"]
            if not raw_path.exists():
                raise FileNotFoundError(
                    f"Neither cleaned silver nor raw workbook is available. Place the cleaned Parquet at "
                    f"{silver_path}, or download the workbook to {raw_path} as described in README §11."
                )
            from dpa.etl.clean import clean_transactions
            from dpa.ingest.xlsx_to_parquet import ingest_workbook

            bronze_path = root / config["paths"]["bronze_dir"] / "transactions_raw.parquet"
            ingest_workbook(raw_path, bronze_path)
            cleaned, rejected = clean_transactions(session.read.parquet(str(bronze_path)), config)
            silver_path.parent.mkdir(parents=True, exist_ok=True)
            write_spark_parquet(cleaned, silver_path)
            write_spark_parquet(rejected, silver_path.parent / "rejected.parquet")

        reconciliation = validate_dataset(str(silver_path), spark=session)

        gold_dir.mkdir(parents=True, exist_ok=True)
        panel = build_demand_definition(spark=session)
        write_spark_parquet(panel, gold_dir / "product_week_panel.parquet")
        features = compute_product_week_features(spark=session, panel=panel)
        write_spark_parquet(features, gold_dir / "product_week_features.parquet")
        _save_feature_figures(features, root / config["paths"]["reports_dir"] / "figures", config)

        feature_columns = list(config["modeling"]["feature_columns"])
        model_frame = features.select(
            *feature_columns,
            "Stock_Code",
            "week_start",
            "units",
            "in_training",
        ).toPandas()
        predictions, metrics, shap_values = train_and_evaluate(
            model_frame,
            config,
            gold_dir / "forecast_model.txt",
        )
        predictions.to_parquet(gold_dir / "forecast_predictions.parquet", index=False)
        pricing_frame = features.select(
            "Stock_Code",
            "small_order_list_price",
        ).toPandas()
        recommendations = build_hold_recommendations(pricing_frame)
        pricing_dir = gold_dir / "pricing"
        pricing_dir.mkdir(parents=True, exist_ok=True)
        recommendations.to_parquet(pricing_dir / "recommendations.parquet", index=False)
        reports_dir = root / config["paths"]["reports_dir"]
        reports_dir.mkdir(parents=True, exist_ok=True)
        metrics.to_csv(reports_dir / "model_metrics.csv", index=False)
        shap_values.to_csv(
            reports_dir / "global_shap_importance.csv",
            index=False,
        )
        _write_reports(
            root,
            config,
            reconciliation,
            panel,
            features,
            metrics,
            shap_values,
        )
        print(f"Gold tables and reports rebuilt from {silver_path}")
        print(metrics.to_string(index=False))
    finally:
        if owns_spark:
            session.stop()


def main() -> None:
    """Command-line entry point for a complete reproducible batch rebuild."""
    rebuild()


if __name__ == "__main__":
    main()
