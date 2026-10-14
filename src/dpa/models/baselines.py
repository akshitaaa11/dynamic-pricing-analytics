"""Leakage-free baseline demand forecasts."""

from __future__ import annotations

import pandas as pd

SEASONAL_LAG_WEEKS = 52


def _ordered(panel: pd.DataFrame) -> pd.DataFrame:
    frame = panel[["Stock_Code", "week_start", "units"]].copy()
    frame["week_start"] = pd.to_datetime(frame["week_start"])
    return frame.sort_values(["Stock_Code", "week_start"]).reset_index(drop=True)


def seasonal_naive_forecast(panel: pd.DataFrame) -> pd.DataFrame:
    """Forecast each week with the same week one year earlier.

    Weeks without a year of history fall back to the previous week's units, then to zero.
    """
    frame = _ordered(panel)
    by_product = frame.groupby("Stock_Code")["units"]
    seasonal = by_product.shift(SEASONAL_LAG_WEEKS)
    frame["seasonal_naive"] = seasonal.fillna(by_product.shift(1)).fillna(0.0).astype(float)
    return frame.drop(columns="units")


def moving_average_forecast(panel: pd.DataFrame, window: int = 4) -> pd.DataFrame:
    """Forecast each week with the mean of the preceding ``window`` weeks (never the week itself)."""
    frame = _ordered(panel)
    column = f"moving_average_{window}"
    frame[column] = (
        frame.groupby("Stock_Code")["units"]
        .transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
        .fillna(0.0)
        .astype(float)
    )
    return frame.drop(columns="units")


def generate_baseline_table(panel: pd.DataFrame) -> pd.DataFrame:
    """Combine every baseline into one product-week table."""
    keys = ["Stock_Code", "week_start"]
    table = seasonal_naive_forecast(panel)
    for window in (4, 13):
        table = table.merge(moving_average_forecast(panel, window=window), on=keys, how="left")
    return table
