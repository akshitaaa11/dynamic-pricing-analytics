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
    """Fit on train, early-stop on validation, then score the test period by rolling origin.

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
    best_rounds = max(int(booster.best_iteration), 1)
    if model_path is not None:
        Path(model_path).parent.mkdir(parents=True, exist_ok=True)
        booster.save_model(str(model_path))

    # Rolling-origin evaluation: the test period is split into blocks of
    # ``forecast_horizon_weeks``. Before each block the models are refit on every
    # eligible row strictly before the block, so no block ever sees its own target.
    horizon = int(config["guardrails"]["forecast_horizon_weeks"])
    confidence = float(config["guardrails"]["demand_interval_confidence"])
    low_q, high_q = (1 - confidence) / 2, 1 - (1 - confidence) / 2
    eligible = data[data["in_training"].astype(bool)]
    test_weeks = sorted(test["week_start"].unique())
    fold_of_week = {week: index // horizon for index, week in enumerate(test_weeks)}
    test["fold"] = test["week_start"].map(fold_of_week)
    test["lightgbm"] = np.nan
    test["lower_80"] = np.nan
    test["upper_80"] = np.nan
    base = {k: v for k, v in booster_params.items() if k != "objective"}
    for fold, block in test.groupby("fold"):
        fold_start = block["week_start"].min()
        history = eligible[eligible["week_start"] < fold_start]
        history_set = lgb.Dataset(history[features].astype(float), label=history["units"].astype(float))
        block_x = block[features].astype(float)
        mean_model = lgb.train(booster_params, history_set, num_boost_round=best_rounds)
        test.loc[block.index, "lightgbm"] = np.clip(mean_model.predict(block_x), 0, None)
        for column, quantile in (("lower_80", low_q), ("upper_80", high_q)):
            quantile_set = lgb.Dataset(history[features].astype(float), label=history["units"].astype(float))
            quantile_model = lgb.train(
                {**base, "objective": "quantile", "alpha": quantile}, quantile_set, num_boost_round=best_rounds
            )
            test.loc[block.index, column] = np.clip(quantile_model.predict(block_x), 0, None)
    test["lower_80"] = np.minimum(test["lower_80"], test["lightgbm"])
    test["upper_80"] = np.maximum(test["upper_80"], test["lightgbm"])

    rows = []
    for model in ["lightgbm", *BASELINE_COLUMNS]:
        rows.append({"model": model, **calculate_metrics(test["units"], test[model])})
    metrics = pd.DataFrame(rows)
    inside = (test["units"] >= test["lower_80"]) & (test["units"] <= test["upper_80"])
    metrics["coverage_80"] = np.nan
    metrics["mean_interval_width"] = np.nan
    metrics.loc[metrics["model"] == "lightgbm", "coverage_80"] = float(inside.mean())
    metrics.loc[metrics["model"] == "lightgbm", "mean_interval_width"] = float((test["upper_80"] - test["lower_80"]).mean())
    metrics["folds"] = len(fold_of_week) and (max(fold_of_week.values()) + 1)

    test_x = test[features].astype(float)
    contributions = booster.predict(test_x, num_iteration=booster.best_iteration, pred_contrib=True)[:, :-1]
    shap_values = (
        pd.DataFrame({"feature": features, "mean_abs_shap": np.abs(contributions).mean(axis=0)})
        .sort_values("mean_abs_shap", ascending=False)
        .reset_index(drop=True)
    )
    predictions = test[
        ["Stock_Code", "week_start", "units", "fold", "lightgbm", "lower_80", "upper_80", *BASELINE_COLUMNS]
    ].reset_index(drop=True)
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
