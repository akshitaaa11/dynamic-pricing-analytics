"""Data load and validation for the cleaned retail transaction dataset."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

from dpa.utils.spark import get_spark_session

REQUIRED_COLUMNS = [
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


def resolve_dataset_path() -> str:
    """Return the configured path to the cleaned silver parquet file."""
    project_root = Path(__file__).resolve().parents[3]
    with (project_root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    silver_dir = project_root / config.get("paths", {}).get("silver_dir", "data/silver")
    return str(silver_dir / "transactions_clean.parquet")


def load_transactions(path: str | None = None, spark: SparkSession | None = None) -> DataFrame:
    """Load the cleaned dataset from the configured silver path."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase1")
    dataset_path = path or resolve_dataset_path()
    return spark.read.parquet(dataset_path)


def validate_schema(df: DataFrame) -> None:
    """Check the dataset matches the required silver-layer schema contract."""
    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    null_keys = df.filter(F.col("Invoice_No").isNull() | F.col("Stock_Code").isNull())
    if null_keys.limit(1).count() > 0:
        raise ValueError("Dataset contains null key values in Invoice_No or Stock_Code.")

    if df.filter(F.col("Unit_Price") <= 0).limit(1).count() > 0:
        raise ValueError("Negative or zero Unit_Price values are present.")

    invalid_negative_quantity_rows = df.filter(
        (~F.col("Invoice_No").cast("string").startswith("C")) & (F.col("Quantity") < 0)
    )
    if invalid_negative_quantity_rows.limit(1).count() > 0:
        raise ValueError("Negative quantities are present on non-cancellation records.")


def compute_reconciliation(df: DataFrame) -> dict[str, Any]:
    """Compute the row-count and value totals required by the project validation contract."""
    sales = df.filter(~F.col("Invoice_No").cast("string").startswith("C"))
    cancellations = df.filter(F.col("Invoice_No").cast("string").startswith("C"))

    gross_units = int(sales.agg(F.sum("Quantity").alias("total")).first()["total"] or 0)
    gross_revenue = float(
        sales.withColumn("line_value", F.col("Quantity") * F.col("Unit_Price")).agg(F.sum("line_value")).first()[0]
        or 0.0
    )
    cancellation_value = float(
        cancellations.withColumn("line_value", F.col("Quantity") * F.col("Unit_Price")).agg(F.sum("line_value")).first()[0]
        or 0.0
    )

    return {
        "rows": int(df.count()),
        "sale_rows": int(sales.count()),
        "gross_units": gross_units,
        "gross_revenue": gross_revenue,
        "cancellation_value": cancellation_value,
    }


def validate_dataset(path: str | None = None, spark: SparkSession | None = None) -> dict[str, Any]:
    """Load the silver dataset and validate it against the project contract."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase1")
    df = load_transactions(path=path, spark=spark)
    validate_schema(df)
    metrics = compute_reconciliation(df)

    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    quality = config.get("quality", {})
    expected = {
        "rows": int(quality["expected_clean_rows"]),
        "sale_rows": int(quality["expected_sale_rows"]),
        "gross_units": int(quality["expected_gross_units"]),
        "gross_revenue": float(quality["expected_gross_revenue"]),
        "cancellation_value": float(quality["expected_cancellation_value"]),
    }

    for name, expected_value in expected.items():
        actual_value = metrics[name]
        if name == "gross_revenue":
            if abs(actual_value - expected_value) > 1.0:
                raise AssertionError(f"{name} mismatch: {actual_value} != {expected_value}")
        elif name == "cancellation_value":
            if abs(actual_value - expected_value) > 1.0:
                raise AssertionError(f"{name} mismatch: {actual_value} != {expected_value}")
        elif actual_value != expected_value:
            raise AssertionError(f"{name} mismatch: {actual_value} != {expected_value}")

    return metrics


def main() -> None:
    """Command-line entry point for phase 1 validation."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase1")
    try:
        metrics = validate_dataset(spark=spark)
        print(metrics)
    finally:
        spark.stop()
