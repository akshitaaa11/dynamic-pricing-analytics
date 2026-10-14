"""Phase 4 tests for baseline forecasting utilities."""

from __future__ import annotations

import pandas as pd

from dpa.models.baselines import generate_baseline_table, moving_average_forecast, seasonal_naive_forecast


def test_baseline_forecasts_have_expected_columns() -> None:
    """Each baseline model should emit a product-week forecast output with the right columns."""
    panel = pd.DataFrame(
        {
            "Stock_Code": ["A", "A", "A", "B", "B", "B"],
            "week_start": pd.to_datetime([
                "2021-01-04",
                "2021-01-11",
                "2021-01-18",
                "2021-01-04",
                "2021-01-11",
                "2021-01-18",
            ]),
            "units": [10, 12, 15, 5, 9, 20],
        }
    )

    seasonal = seasonal_naive_forecast(panel)
    moving = moving_average_forecast(panel, window=4)
    combined = generate_baseline_table(panel)

    assert {"Stock_Code", "week_start", "seasonal_naive"}.issubset(seasonal.columns)
    assert {"Stock_Code", "week_start", "moving_average_4"}.issubset(moving.columns)
    assert {"Stock_Code", "week_start", "seasonal_naive", "moving_average_4", "moving_average_13"}.issubset(combined.columns)
    assert len(seasonal) == len(panel)
    assert len(moving) == len(panel)
    assert len(combined) == len(panel)


def test_baseline_forecasts_are_numeric_and_ordered() -> None:
    """Baseline outputs should remain numeric and sorted by product and week."""
    panel = pd.DataFrame(
        {
            "Stock_Code": ["A", "A", "B", "B"],
            "week_start": pd.to_datetime(["2021-01-04", "2021-01-11", "2021-01-04", "2021-01-11"]),
            "units": [8.0, 12.0, 4.0, 7.0],
        }
    )

    seasonal = seasonal_naive_forecast(panel)
    moving = moving_average_forecast(panel, window=4)

    assert seasonal["seasonal_naive"].notna().all()
    assert moving["moving_average_4"].notna().all()
    assert list(seasonal["Stock_Code"]) == ["A", "A", "B", "B"] or list(seasonal["Stock_Code"]) == ["B", "B", "A", "A"]
