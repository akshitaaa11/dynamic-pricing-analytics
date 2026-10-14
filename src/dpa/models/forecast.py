"""Global LightGBM demand model evaluated against baselines on a chronological split."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
import yaml

from dpa.models.baselines import generate_baseline_table
from dpa.models.evaluate import calculate_metrics

BASELINE_COLUMNS = ["seasonal_naive", "moving_average_4", "moving_average_13"]


def _between(frame: pd.DataFrame, start: str, end: str) -> pd.Series:
    """Weeks whose start date lies in [start, end]; configured dates are week starts."""
    return (frame["week_start"] >= pd.Timestamp(start)) & (frame["week_start"] <= pd.Timestamp(end))


def train_and_evaluate(
    frame: pd.DataFrame,
    config: dict[str, Any],
    model_path: str | Path | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Fit on train, early-stop on validation, score once on test.

    Returns (test predictions, metrics per model, global SHAP importance).
    """
    modeling = config["modeling"]
    periods = config["periods"]
    features = list(modeling["feature_columns"])
    params = dict(modeling["lightgbm"])
    seed = int(modeling.get("random_seed", 42))

    data = frame.copy()
    data["week_start"] = pd.to_datetime(data["week_start"])
    data = data.sort_values(["Stock_Code", "week_start"]).reset_index(drop=True)
    data = data.merge(generate_baseline_table(data), on=["Stock_Code", "week_start"], how="left")

    train = data[_between(data, periods["train_start"], periods["train_end"]) & data["in_training"].astype(bool)]
    valid = data[_between(data, periods["validation_start"], periods["validation_end"]) & data["in_training"].astype(bool)]
    test = data[_between(data, periods["test_start"], periods["test_end"])].copy()
    if train.empty or valid.empty or test.empty:
        raise ValueError("train, validation and test periods must each contain rows")

    early_stopping = int(params.pop("early_stopping_rounds", 30))
    n_estimators = int(params.pop("n_estimators", 300))
    booster_params = {
        **params,
        "verbosity": -1,
        "seed": seed,
        "deterministic": True,
        "force_row_wise": True,
    }
    train_set = lgb.Dataset(train[features].astype(float), label=train["units"].astype(float))
    valid_set = lgb.Dataset(valid[features].astype(float), label=valid["units"].astype(float), reference=train_set)
    booster = lgb.train(
        booster_params,
        train_set,
        num_boost_round=n_estimators,
        valid_sets=[valid_set],
        callbacks=[lgb.early_stopping(early_stopping, verbose=False)],
    )
    if model_path is not None:
        Path(model_path).parent.mkdir(parents=True, exist_ok=True)
        booster.save_model(str(model_path))

    test_x = test[features].astype(float)
    test["lightgbm"] = np.clip(booster.predict(test_x, num_iteration=booster.best_iteration), 0, None)

    rows = []
    for model in ["lightgbm", *BASELINE_COLUMNS]:
        rows.append({"model": model, **calculate_metrics(test["units"], test[model])})
    metrics = pd.DataFrame(rows)

    contributions = booster.predict(test_x, num_iteration=booster.best_iteration, pred_contrib=True)[:, :-1]
    shap_values = (
        pd.DataFrame({"feature": features, "mean_abs_shap": np.abs(contributions).mean(axis=0)})
        .sort_values("mean_abs_shap", ascending=False)
        .reset_index(drop=True)
    )
    predictions = test[["Stock_Code", "week_start", "units", "lightgbm", *BASELINE_COLUMNS]].reset_index(drop=True)
    return predictions, metrics, shap_values


def main() -> None:
    """Train from the gold feature table (Parquet) and print test metrics."""
    root = Path(__file__).resolve().parents[3]
    config = yaml.safe_load((root / "configs" / "pipeline.yaml").read_text(encoding="utf-8"))
    gold = root / config["paths"]["gold_dir"]
    columns = [*config["modeling"]["feature_columns"], "Stock_Code", "week_start", "units", "in_training"]
    frame = pd.read_parquet(gold / "product_week_features.parquet", columns=columns)
    predictions, metrics, shap_values = train_and_evaluate(frame, config, gold / "forecast_model.txt")
    predictions.to_parquet(gold / "forecast_predictions.parquet", index=False)
    reports = root / config["paths"]["reports_dir"]
    metrics.to_csv(reports / "model_metrics.csv", index=False)
    shap_values.to_csv(reports / "global_shap_importance.csv", index=False)
    print(metrics.to_string(index=False))


if __name__ == "__main__":
    main()
