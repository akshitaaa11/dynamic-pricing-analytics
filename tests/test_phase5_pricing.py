"""Phase 5 tests for elasticity and pricing logic."""

from __future__ import annotations

import numpy as np
import pandas as pd

from dpa.analysis.elasticity import estimate_elasticity
from dpa.pricing.recommend import generate_recommendation


def test_elasticity_estimation_returns_identified_summary() -> None:
    """Estimate elasticities for products with enough price variation to be identified."""
    rng = np.random.default_rng(1)
    weeks = pd.date_range("2021-01-04", periods=30, freq="W-MON")
    frames = []
    for code, true_elasticity in {"A": -1.5, "B": -0.8, "C": -1.2, "D": -1.0}.items():
        price = 10 * np.exp(rng.normal(0, 0.15, len(weeks)))
        units = 200 * (price / 10) ** true_elasticity * np.exp(rng.normal(0, 0.05, len(weeks)))
        frames.append(pd.DataFrame({"Stock_Code": code, "small_order_list_price": price, "units": units.round(), "week_start": weeks}))
    panel = pd.concat(frames, ignore_index=True)
    # One product with a constant price can never be identified.
    panel = pd.concat([panel, pd.DataFrame({"Stock_Code": "E", "small_order_list_price": 5.0, "units": 40.0, "week_start": weeks})])

    elasticity = estimate_elasticity(panel)

    assert {"Stock_Code", "elasticity", "ci_lower", "ci_upper", "identified", "n_distinct_prices", "n_weeks", "reason"}.issubset(elasticity.columns)
    assert len(elasticity) == 5
    identified = elasticity.set_index("Stock_Code")["identified"]
    assert identified[["A", "B", "C", "D"]].all()
    assert not identified["E"]
    estimates = elasticity.set_index("Stock_Code")["elasticity"]
    assert estimates["A"] < estimates["B"]  # recovers the ordering of the true elasticities
    assert (elasticity.loc[elasticity["identified"], "ci_upper"] < 0).all()


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
