"""Forecast accuracy metrics computed from predictions."""

from __future__ import annotations

import numpy as np


def calculate_metrics(actual, predicted) -> dict[str, float]:
    """Return WAPE, MAE and bias (mean of predicted minus actual)."""
    actual_arr = np.asarray(actual, dtype=float)
    predicted_arr = np.asarray(predicted, dtype=float)
    if actual_arr.shape != predicted_arr.shape:
        raise ValueError("actual and predicted must have matching shapes")
    if actual_arr.size == 0:
        raise ValueError("cannot compute metrics on empty input")
    errors = predicted_arr - actual_arr
    total = float(np.abs(actual_arr).sum())
    return {
        "wape": float(np.abs(errors).sum() / total) if total > 0 else float("nan"),
        "mae": float(np.abs(errors).mean()),
        "bias": float(errors.mean()),
    }
