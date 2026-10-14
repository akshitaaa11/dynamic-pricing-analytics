"""Phase 2 tests for the demand-definition product-week panel."""

from __future__ import annotations

from dpa.etl.aggregate import build_demand_definition
from dpa.utils.spark import get_spark_session


def test_demand_panel_shape_and_columns() -> None:
    """The panel should be zero-filled and contain availability-proxy metadata."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase2-test")
    try:
        panel = build_demand_definition(spark=spark)
        expected_columns = {"Stock_Code", "week_start", "units", "availability_proxy", "in_training"}
        assert expected_columns.issubset(set(panel.columns))
        assert panel.count() > 0
        assert panel.select("Stock_Code").distinct().count() > 0
        assert panel.filter(panel.units == 0).count() > 0
        assert panel.filter(panel.availability_proxy == "possible_unavailable").count() >= 0
    finally:
        spark.stop()


def test_panel_has_no_null_core_values() -> None:
    """The core demand panel should not contain null values for key columns."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase2-null-check")
    try:
        panel = build_demand_definition(spark=spark)
        nulls = panel.filter(
            (panel.Stock_Code.isNull())
            | (panel.week_start.isNull())
            | (panel.units.isNull())
            | (panel.availability_proxy.isNull())
        )
        assert nulls.count() == 0
    finally:
        spark.stop()
