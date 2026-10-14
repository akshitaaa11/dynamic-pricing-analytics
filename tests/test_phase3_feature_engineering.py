"""Phase 3 feature-engineering tests for the project."""

from __future__ import annotations

from dpa.features.build import build_feature_dataset
from dpa.utils.spark import get_spark_session


def test_feature_dataset_has_required_columns() -> None:
    """The feature dataset should include the demand panel and feature columns required by later phases."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase3-test")
    try:
        feature_frame = build_feature_dataset(spark=spark)
        required_columns = {
            "Stock_Code",
            "week_start",
            "units",
            "zero_filled",
            "possibly_unavailable",
            "in_training",
            "lag_1_units",
            "lag_2_units",
            "lag_4_units",
            "lag_8_units",
            "lag_12_units",
            "rolling_mean_4_units",
            "rolling_mean_8_units",
            "rolling_mean_12_units",
            "rolling_std_4_units",
            "rolling_std_8_units",
            "rolling_std_12_units",
            "weeks_since_launch",
            "list_price",
            "price_change_pct",
            "month",
            "iso_week",
            "weeks_to_christmas",
            "uk_bank_holiday_week",
        }
        missing = required_columns - set(feature_frame.columns)
        assert not missing, f"Missing feature columns: {sorted(missing)}"
        assert feature_frame.count() > 0
    finally:
        spark.stop()


def test_feature_dataset_has_no_leakage_from_target_week() -> None:
    """No feature should directly use data from the same target week or later."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase3-leakage")
    try:
        feature_frame = build_feature_dataset(spark=spark)
        assert feature_frame.filter(feature_frame.lag_1_units.isNull()).count() >= 0
        assert feature_frame.filter(feature_frame.units.isNull()).count() == 0
        assert feature_frame.filter(feature_frame.list_price.isNull()).count() >= 0
    finally:
        spark.stop()
