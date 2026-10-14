"""Phase 1 validation tests for the silver-layer dataset."""

from __future__ import annotations

from pathlib import Path

from dpa.etl.validate import load_transactions, resolve_dataset_path, validate_dataset
from dpa.utils.spark import get_spark_session


def test_dataset_path_exists() -> None:
    """The configured silver-layer parquet dataset should be present."""
    dataset_path = Path(resolve_dataset_path())
    assert dataset_path.exists(), f"Missing silver dataset at {dataset_path}"


def test_dataset_contract_passes() -> None:
    """The cleaned dataset should match the project reconciliation and schema checks."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase1-test")
    try:
        df = load_transactions(spark=spark)
        required_columns = [
            "Invoice_No",
            "Stock_Code",
            "Description",
            "Quantity",
            "Invoice_DateTime",
            "Unit_Price",
            "Customer_ID",
            "Country",
            "Source_Sheet",
            "Source_Row",
            "Possible_Duplicate_Flag",
        ]
        assert set(required_columns).issubset(df.columns)

        metrics = validate_dataset(spark=spark)
        assert metrics["rows"] == 1_033_062
        assert metrics["sale_rows"] == 1_015_088
        assert metrics["gross_units"] == 11_221_957
        assert abs(metrics["gross_revenue"] - 19_700_954.44) <= 1.0
        assert abs(metrics["cancellation_value"] + 719_692.94) <= 1.0
    finally:
        spark.stop()
