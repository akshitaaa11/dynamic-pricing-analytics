"""Export gold tables as static JavaScript data files for the website dashboard (site/)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

from dpa.pricing.recommend import run_pricing


def _clean(value: Any) -> Any:
    if isinstance(value, (np.floating, float)):
        return None if not np.isfinite(value) else round(float(value), 4)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if value is pd.NaT or value is None:
        return None
    return value


def _write(path: Path, key: str, payload: dict[str, Any]) -> None:
    text = json.dumps(payload, separators=(",", ":"), default=_clean, allow_nan=False)
    path.write_text(f"window.DPA=window.DPA||{{}};window.DPA.{key}={text};\n", encoding="utf-8")


def _records(frame: pd.DataFrame) -> list[list[Any]]:
    frame = frame.astype(object).where(frame.notna(), None)
    return [[_clean(v) for v in row] for row in frame.itertuples(index=False, name=None)]


def export_site_data(root: Path | None = None) -> dict[str, int]:
    root = root or Path(__file__).resolve().parents[2]
    config = yaml.safe_load((root / "configs" / "pipeline.yaml").read_text(encoding="utf-8"))
    gold = root / config["paths"]["gold_dir"]
    reports = root / config["paths"]["reports_dir"]
    out = root / "site" / "data"
    out.mkdir(parents=True, exist_ok=True)

    features = pd.read_parquet(gold / "product_week_features.parquet")
    features["week_start"] = pd.to_datetime(features["week_start"])
    predictions = pd.read_parquet(gold / "forecast_predictions.parquet")
    predictions["week_start"] = pd.to_datetime(predictions["week_start"])
    metrics = pd.read_csv(reports / "model_metrics.csv")
    shap = pd.read_csv(reports / "global_shap_importance.csv")
    features["revenue_proxy"] = features["units"].fillna(0) * features["small_order_list_price"].fillna(0)

    weeks = sorted(features["week_start"].unique())
    week_labels = [str(pd.Timestamp(w).date()) for w in weeks]
    week_index = {w: i for i, w in enumerate(weeks)}

    # ---- overview / demand ----
    weekly = features.groupby("week_start").agg(units=("units", "sum"), revenue=("revenue_proxy", "sum"),
                                                products=("Stock_Code", "nunique")).reset_index()
    monthly = features.assign(month=features["week_start"].dt.to_period("M").astype(str)).groupby("month").agg(
        units=("units", "sum"), revenue=("revenue_proxy", "sum")).reset_index()
    seasonality = features.groupby(features["week_start"].dt.month)["units"].sum()
    by_product = features.groupby("Stock_Code").agg(
        units=("units", "sum"), revenue=("revenue_proxy", "sum"), avg_price=("small_order_list_price", "mean"),
        weeks=("units", "size"), zero_weeks=("zero_filled", "sum")).reset_index().sort_values("units", ascending=False)
    cum = by_product["units"].cumsum() / by_product["units"].sum()
    n = len(by_product)
    tiers = [("Top 10% of products", 0.0, 0.10), ("Next 20%", 0.10, 0.30), ("Next 30%", 0.30, 0.60), ("Bottom 40%", 0.60, 1.0)]
    tier_share = [(label, float(by_product["units"].iloc[int(n * lo):int(n * hi)].sum() / by_product["units"].sum()))
                  for label, lo, hi in tiers]
    pareto = [[round(i / n, 4), round(float(cum.iloc[i]), 4)] for i in range(0, n, max(1, n // 100))] + [[1, 1]]
    zero_by_month = features.assign(month=features["week_start"].dt.to_period("M").astype(str)).groupby("month").agg(
        zero=("zero_filled", "mean"), unavailable=("possibly_unavailable", "mean")).reset_index()
    test_start = pd.Timestamp(config["periods"]["test_start"])
    last8, prev8 = weekly.iloc[-9:-1], weekly.iloc[-17:-9]  # exclude the final partial week

    def delta(col: str) -> float:
        return float(last8[col].sum() / prev8[col].sum() - 1) if prev8[col].sum() else 0.0

    _write(out / "overview.js", "overview", {
        "weeks": week_labels,
        "weekly": {"units": weekly["units"].round(0).tolist(), "revenue": weekly["revenue"].round(0).tolist(),
                   "products": weekly["products"].tolist()},
        "monthly": {"labels": monthly["month"].tolist(), "units": monthly["units"].round(0).tolist(),
                    "revenue": monthly["revenue"].round(0).tolist()},
        "seasonality": [float(seasonality.get(m, 0)) for m in range(1, 13)],
        "tiers": tier_share,
        "pareto": pareto,
        "zero_by_month": {"labels": zero_by_month["month"].tolist(), "zero": zero_by_month["zero"].round(4).tolist(),
                          "unavailable": zero_by_month["unavailable"].round(4).tolist()},
        "top_products": _records(by_product.head(10)[["Stock_Code", "units", "revenue", "avg_price"]]),
        "kpis": {
            "units": float(features["units"].sum()), "revenue": float(features["revenue_proxy"].sum()),
            "products": int(features["Stock_Code"].nunique()), "weeks": len(weeks),
            "units_delta": delta("units"), "revenue_delta": delta("revenue"),
            "avg_weekly_units": float(weekly["units"].iloc[1:-1].mean()),
        },
        "range": [week_labels[0], week_labels[-1]],
        "test_start": str(test_start.date()),
    })

    # ---- forecast ----
    agg = predictions.groupby("week_start")[["units", "lightgbm", "seasonal_naive", "moving_average_4", "moving_average_13"]].sum().reset_index()
    pre = weekly[weekly["week_start"] < test_start].tail(26)
    by_fold = predictions.groupby("fold").apply(
        lambda g: pd.Series({
            "from": str(g["week_start"].min().date()), "to": str(g["week_start"].max().date()),
            "lightgbm_wape": float((g["lightgbm"] - g["units"]).abs().sum() / g["units"].sum()),
            "ma4_wape": float((g["moving_average_4"] - g["units"]).abs().sum() / g["units"].sum()),
        }), include_groups=False).reset_index()
    top_test = predictions.groupby("Stock_Code")["units"].sum().sort_values(ascending=False).head(400).index
    prod_pred = predictions[predictions["Stock_Code"].isin(top_test)].sort_values(["Stock_Code", "week_start"])
    explorer = {
        code: [[week_index[w], int(u), round(float(p), 1), round(float(lo), 1), round(float(hi), 1), round(float(m4), 1)]
               for w, u, p, lo, hi, m4 in zip(g["week_start"], g["units"], g["lightgbm"], g["lower_80"], g["upper_80"], g["moving_average_4"])]
        for code, g in prod_pred.groupby("Stock_Code")
    }
    _write(out / "forecast.js", "forecast", {
        "metrics": json.loads(metrics.to_json(orient="records")),
        "shap": json.loads(shap.to_json(orient="records")),
        "aggregate": {"weeks": [str(pd.Timestamp(w).date()) for w in agg["week_start"]],
                      **{c: agg[c].round(0).tolist() for c in ["units", "lightgbm", "seasonal_naive", "moving_average_4", "moving_average_13"]}},
        "context": {"weeks": [str(pd.Timestamp(w).date()) for w in pre["week_start"]], "units": pre["units"].round(0).tolist()},
        "by_fold": json.loads(by_fold.to_json(orient="records")),
        "products": explorer,
        "periods": config["periods"],
    })

    # ---- pricing ----
    elasticity, recommendations, check = run_pricing(features, predictions, config)
    (reports / "pricing_check.json").write_text(json.dumps(check, indent=2, default=_clean), encoding="utf-8")
    priced = features.dropna(subset=["small_order_list_price"]).groupby("Stock_Code")["small_order_list_price"].agg(["min", "max"])
    table = recommendations.merge(elasticity.drop(columns=["reason"]), on="Stock_Code", how="left").merge(
        priced, left_on="Stock_Code", right_index=True, how="left")
    cols = ["Stock_Code", "current_price", "recommended_price", "percent_change", "hold", "confidence", "reason",
            "expected_units", "revenue_gain", "revenue_gain_low", "revenue_gain_high", "binding_guardrail",
            "elasticity", "ci_lower", "ci_upper", "identified", "n_weeks", "min", "max"]
    table["hold"] = table["hold"].astype(bool)
    table["identified"] = table["identified"].fillna(False).astype(bool)
    changes = table.loc[~table["hold"], "percent_change"]
    hold_reasons = table.loc[table["hold"], "reason"].str.replace(r"^Hold price: ", "", regex=True).str.rstrip(".")
    hold_reasons = hold_reasons.where(~hold_reasons.str.contains("revenue gain"), "No gain that holds across the elasticity interval")
    hold_reasons = hold_reasons.where(~hold_reasons.str.contains("flagged as possibly unavailable"), "Flagged as possibly unavailable")
    _write(out / "pricing.js", "pricing", {
        "columns": cols,
        "rows": _records(table[cols]),
        "summary": {
            "products": int(len(table)), "recommended": int((~table["hold"]).sum()), "held": int(table["hold"].sum()),
            "identified": int(table["identified"].sum()),
            "median_change": float(changes.median()) if len(changes) else 0.0,
            "pooled_elasticity": float(elasticity["pooled_elasticity"].iloc[0]),
            "revenue_gain_total": float(table.loc[~table["hold"], "revenue_gain"].sum()),
            "revenue_gain_low_total": float(table.loc[~table["hold"], "revenue_gain_low"].sum()),
        },
        "hold_reasons": hold_reasons.value_counts().to_dict(),
        "check": check,
        "guardrails": config["guardrails"],
    })

    # ---- per-product series (units + list price) for the explorer ----
    series: dict[str, Any] = {}
    elast_map = elasticity.set_index("Stock_Code")
    for code, g in features.sort_values("week_start").groupby("Stock_Code"):
        idx = g["week_start"].map(week_index)
        start = int(idx.min())
        units = [None] * (int(idx.max()) - start + 1)
        price = [None] * len(units)
        for i, u, p in zip(idx, g["units"], g["small_order_list_price"]):
            units[int(i) - start] = int(u)
            price[int(i) - start] = None if pd.isna(p) else round(float(p), 2)
        series[code] = [start, units, price]
    descriptions = pd.read_parquet(root / config["paths"]["silver_dir"] / "transactions_clean.parquet", columns=["Stock_Code", "Description"])
    descriptions["Stock_Code"] = descriptions["Stock_Code"].astype(str)
    descriptions["Description"] = descriptions["Description"].astype(str)
    names = descriptions.dropna().groupby("Stock_Code")["Description"].agg(lambda s: s.value_counts().index[0])
    by_product["name"] = by_product["Stock_Code"].map(names)
    _write(out / "products.js", "products", {
        "columns": ["code", "name", "units", "revenue", "avg_price", "weeks", "zero_weeks"],
        "rows": _records(by_product[["Stock_Code", "name", "units", "revenue", "avg_price", "weeks", "zero_weeks"]]),
        "series": series,
    })

    # ---- data card ----
    quality = config["quality"]
    recomputed: dict[str, str] = {}
    card = (reports / "data_card.md")
    if card.exists():
        for line in card.read_text(encoding="utf-8").splitlines():
            parts = [c.strip() for c in line.strip("|").split("|")]
            if line.startswith("|") and len(parts) == 2 and parts[0] not in ("Measurement", "---", ":---"):
                recomputed[parts[0]] = parts[1]
    _write(out / "data.js", "data", {
        "quality": quality, "recomputed": recomputed, "periods": config["periods"],
        "panel": {"rows": int(len(features)), "zero_filled": int(features["zero_filled"].sum()),
                  "possibly_unavailable": int(features["possibly_unavailable"].sum()),
                  "products": int(features["Stock_Code"].nunique())},
        "guardrails": config["guardrails"],
    })
    return {p.name: p.stat().st_size for p in out.glob("*.js")}


def main() -> None:
    for name, size in export_site_data().items():
        print(f"site/data/{name}: {size / 1024:,.0f} KB")


if __name__ == "__main__":
    main()
