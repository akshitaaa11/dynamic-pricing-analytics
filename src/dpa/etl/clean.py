"""Apply configured Spark cleaning rules and persist silver/rejected Parquet."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

from dpa.utils.spark import get_spark_session
from dpa.utils.parquet import write_spark_parquet


def read_config() -> tuple[Path, dict[str, Any]]:
    """Return project root and pipeline configuration."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        return root, yaml.safe_load(handle) or {}


def _reject_rows(
    frame: DataFrame,
    condition: F.Column,
    reason: str,
    rejected: list[DataFrame],
) -> DataFrame:
    """Append rejected rows with a reason and return the rows not rejected."""
    rejected.append(frame.filter(condition).withColumn("Reason", F.lit(reason)))
    return frame.filter(~F.coalesce(condition, F.lit(False)))


def clean_transactions(bronze: DataFrame, config: dict[str, Any]) -> tuple[DataFrame, DataFrame]:
    """Normalize the source schema, apply configured exclusions, and retain an audit log."""
    renames = {
        "Invoice": "Invoice_No",
        "StockCode": "Stock_Code",
        "InvoiceDate": "Invoice_DateTime",
        "Price": "Unit_Price",
        "Customer ID": "Customer_ID",
    }
    frame = bronze
    for source_name, target_name in renames.items():
        if source_name in frame.columns:
            frame = frame.withColumnRenamed(source_name, target_name)

    required = {
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
    }
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Bronze data is missing required columns: {missing}")

    frame = (
        frame.withColumn("Invoice_No", F.trim(F.col("Invoice_No").cast("string")))
        .withColumn("Stock_Code", F.upper(F.trim(F.col("Stock_Code").cast("string"))))
        .withColumn("Description", F.trim(F.col("Description").cast("string")))
        .withColumn("Country", F.trim(F.col("Country").cast("string")))
        .withColumn("Quantity", F.col("Quantity").cast("long"))
        .withColumn("Invoice_DateTime", F.to_timestamp(F.col("Invoice_DateTime")))
        .withColumn("Unit_Price", F.col("Unit_Price").cast("double"))
    )
    rejected: list[DataFrame] = []

    invalid_key = (
        F.col("Invoice_No").isNull()
        | (F.col("Invoice_No") == "")
        | F.col("Stock_Code").isNull()
        | (F.col("Stock_Code") == "")
        | F.col("Invoice_DateTime").isNull()
        | F.col("Quantity").isNull()
        | F.col("Unit_Price").isNull()
    )
    frame = _reject_rows(frame, invalid_key, "invalid_required_field", rejected)

    key_columns = [
        "Invoice_No",
        "Stock_Code",
        "Description",
        "Quantity",
        "Invoice_DateTime",
        "Unit_Price",
        "Customer_ID",
        "Country",
    ]
    duplicate_window = Window.partitionBy(*key_columns).orderBy("Source_Sheet", "Source_Row")
    frame = frame.withColumn("_duplicate_rank", F.row_number().over(duplicate_window))
    frame = frame.withColumn(
        "_source_sheets",
        F.collect_set("Source_Sheet").over(Window.partitionBy(*key_columns)),
    )
    cross_sheet_duplicate = (F.size(F.col("_source_sheets")) > 1) & (F.col("_duplicate_rank") > 1)
    frame = _reject_rows(
        frame,
        cross_sheet_duplicate,
        "cross_sheet_duplicate",
        rejected,
    ).drop("_duplicate_rank", "_source_sheets")

    cleaning = config.get("cleaning", {})
    code = F.col("Stock_Code")
    non_merchandise = code.isin(*cleaning.get("non_merchandise_codes", []))
    for prefix in cleaning.get("non_merchandise_prefixes", []):
        non_merchandise = non_merchandise | code.startswith(prefix)
    frame = _reject_rows(frame, non_merchandise, "non_merchandise", rejected)

    frame = _reject_rows(
        frame,
        F.col("Unit_Price") <= 0,
        "non_positive_price",
        rejected,
    )
    cancellation = F.col("Invoice_No").startswith("C")
    frame = _reject_rows(
        frame,
        (F.col("Quantity") < 0) & ~cancellation,
        "negative_quantity_on_sale",
        rejected,
    )
    frame = _reject_rows(
        frame,
        F.col("Invoice_No").isNull() | F.col("Stock_Code").isNull(),
        "null_key",
        rejected,
    )

    line_window = Window.partitionBy(
        "Invoice_No",
        "Stock_Code",
        "Description",
        "Quantity",
        "Invoice_DateTime",
        "Unit_Price",
        "Customer_ID",
        "Country",
    )
    clean = (
        frame.withColumn(
            "Possible_Duplicate_Flag",
            F.count("*").over(line_window) > 1,
        )
        .select(
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
        )
    )
    if rejected:
        rejected_frame = rejected[0]
        for next_frame in rejected[1:]:
            rejected_frame = rejected_frame.unionByName(next_frame, allowMissingColumns=True)
        rejected_frame = rejected_frame.drop("_duplicate_rank", "_source_sheets")
    else:
        rejected_frame = frame.limit(0).withColumn("Reason", F.lit(None).cast("string"))
    return clean, rejected_frame


def main() -> None:
    """Clean the configured bronze table into silver Parquet and an exclusion log."""
    root, config = read_config()
    bronze_path = root / config["paths"]["bronze_dir"] / "transactions_raw.parquet"
    if not bronze_path.exists():
        raise FileNotFoundError(f"Bronze data is missing; run the ingest target first: {bronze_path}")

    silver_dir = root / config["paths"]["silver_dir"]
    spark = get_spark_session(app_name="dynamic-pricing-clean")
    try:
        bronze = spark.read.parquet(str(bronze_path))
        clean, rejected = clean_transactions(bronze, config)
        write_spark_parquet(clean, silver_dir / "transactions_clean.parquet")
        write_spark_parquet(rejected, silver_dir / "rejected.parquet")
        print(
            f"Wrote {clean.count():,} clean rows and {rejected.count():,} rejected rows "
            f"under {silver_dir}"
        )
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
