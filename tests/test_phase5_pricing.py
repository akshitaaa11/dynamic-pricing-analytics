"""Phase 5 tests for elasticity and pricing logic."""

from __future__ import annotations

import pandas as pd

from dpa.analysis.elasticity import estimate_elasticity
from dpa.pricing.recommend import generate_recommendation


def test_elasticity_estimation_returns_identified_summary() -> None:
    """Estimate elasticities for products with enough price variation to be identified."""
    panel = pd.DataFrame(
        {
            "Stock_Code": ["A"] * 12 + ["B"] * 12,
            "small_order_list_price": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 14.5, 13.5, 12.5, 11.5, 10.5, 9.5] * 2,
            "units": [120, 118, 110, 104, 96, 90, 92, 98, 104, 112, 116, 122] * 2,
            "week_start": pd.date_range("2021-01-04", periods=24, freq="W-MON"),
        }
    )

    elasticity = estimate_elasticity(panel)

    assert {"Stock_Code", "elasticity", "ci_lower", "ci_upper", "identified", "n_distinct_prices", "n_weeks", "reason"}.issubset(elasticity.columns)
    assert len(elasticity) == 2
    assert elasticity["identified"].sum() >= 1


def test_pricing_recommendation_honors_guardrails() -> None:
    """A recommendation should be held when guardrails or availability constraints are violated."""
    product = {"Stock_Code": "A"}
    recommendation = generate_recommendation(
        product,
        elasticity=-1.5,
        forecast_units=100.0,
        current_price=10.0,
        min_price=9.0,
        max_price=11.0,
        possibly_unavailable=True,
    )

    assert recommendation["hold"] is True
    assert recommendation["recommended_price"] == 10.0
    assert "Hold price" in recommendation["reason"]
