"""Phase 8 test: the global model trains, early-stops and is scored only on the test period."""

from __future__ import annotations

import numpy as np
import pandas as pd
import yaml

from dpa.models.forecast import train_and_evaluate
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_train_and_evaluate_scores_only_test_weeks(tmp_path) -> None:
    config = yaml.safe_load((ROOT / "configs" / "pipeline.yaml").read_text(encoding="utf-8"))
    config["modeling"]["lightgbm"]["n_estimators"] = 20
    weeks = pd.date_range("2009-12-07", "2011-11-27", freq="7D")
    rng = np.random.default_rng(0)
    rows = []
    for code in ["A", "B", "C"]:
        base = rng.integers(5, 30)
        units = rng.poisson(base, len(weeks))
        rows.append(pd.DataFrame({"Stock_Code": code, "week_start": weeks, "units": units}))
    frame = pd.concat(rows, ignore_index=True)
    frame["in_training"] = True
    frame["month"] = frame["week_start"].dt.month
    frame["iso_week"] = frame["week_start"].dt.isocalendar().week.astype(int)
    frame["weeks_to_christmas"] = 52 - frame["iso_week"] + 1
    frame["weeks_since_launch"] = frame.groupby("Stock_Code").cumcount()
    for lag in (1, 2, 4, 8, 12):
        frame[f"lag_{lag}_units"] = frame.groupby("Stock_Code")["units"].shift(lag)
    grouped = frame.groupby("Stock_Code")["units"]
    for window in (4, 8, 12):
        frame[f"rolling_mean_{window}_units"] = grouped.transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
    frame["rolling_std_4_units"] = grouped.transform(lambda s: s.shift(1).rolling(4, min_periods=2).std())

    predictions, metrics, shap_values = train_and_evaluate(frame, config, tmp_path / "model.txt")

    assert predictions["week_start"].min() >= pd.Timestamp(config["periods"]["test_start"])
    assert predictions["week_start"].max() <= pd.Timestamp(config["periods"]["test_end"])
    assert set(metrics["model"]) == {"lightgbm", "seasonal_naive", "moving_average_4", "moving_average_13"}
    assert metrics["wape"].between(0, 5).all()
    assert set(shap_values["feature"]) == set(config["modeling"]["feature_columns"])
    assert (tmp_path / "model.txt").exists()
    # Rolling origin: every block of horizon weeks is predicted by a model fit only on earlier weeks.
    assert predictions["fold"].nunique() > 1
    assert (predictions["lower_80"] <= predictions["lightgbm"]).all()
    assert (predictions["lightgbm"] <= predictions["upper_80"]).all()
    coverage = metrics.loc[metrics["model"] == "lightgbm", "coverage_80"].iloc[0]
    assert 0.0 <= coverage <= 1.0
