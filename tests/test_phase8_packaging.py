"""Phase 8 tests for reproducible, data-honest reporting outputs."""

from __future__ import annotations

import pandas as pd
import pytest

from dpa.models.evaluate import calculate_metrics
from dpa.pricing.recommend import build_hold_recommendations


def test_forecast_metrics_are_computed_from_predictions() -> None:
    """Metric calculations use input values and reject invalid shapes."""
    metrics = calculate_metrics([2, 8], [3, 6])

    assert metrics["wape"] == pytest.approx(3 / 10)
    assert metrics["mae"] == pytest.approx(1.5)
    assert metrics["bias"] == pytest.approx(-0.5)
    with pytest.raises(ValueError, match="matching shapes"):
        calculate_metrics([1], [1, 2])


def test_pricing_holds_when_list_price_history_is_not_available() -> None:
    """The final package must not invent price changes without the needed evidence."""
    frame = pd.DataFrame(
        {
            "Stock_Code": ["P1", "P1", "P2"],
            "small_order_list_price": [2.95, 2.95, 4.45],
        }
    )

    recommendations = build_hold_recommendations(frame)

    assert recommendations["Stock_Code"].tolist() == ["P1", "P2"]
    assert recommendations["hold"].all()
    assert recommendations["percent_change"].eq(0).all()
    assert recommendations["recommended_price"].equals(recommendations["current_price"])
    assert recommendations["reason"].str.contains("estimate").all()
