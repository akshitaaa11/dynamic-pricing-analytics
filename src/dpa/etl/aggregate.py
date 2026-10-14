"""Demand-definition logic and product-week aggregation for the pricing project."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

from dpa.etl.validate import load_transactions
from dpa.utils.spark import get_spark_session


def read_pipeline_config() -> dict[str, Any]:
    """Read the project-wide config values that define guardrails and periods."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    return config


def is_cancellation(invoice_number: str) -> bool:
    """Return True when the invoice number indicates a cancellation or return."""
    return invoice_number.startswith("C")


def flag_immediately_cancelled(df: DataFrame) -> DataFrame:
    """Mark sales that were matched to a cancellation within a one-day window."""
    sales = df.filter(~F.col("Invoice_No").cast("string").startswith("C"))
    cancellations = df.filter(F.col("Invoice_No").cast("string").startswith("C"))

    sales_with_key = sales.withColumn("match_quantity", F.abs(F.col("Quantity")))
    cancellations_with_key = cancellations.withColumn("match_quantity", F.abs(F.col("Quantity")))

    joined = (
        cancellations_with_key.alias("c")
        .join(
            sales_with_key.alias("s"),
            on=["Customer_ID", "Stock_Code", "match_quantity"],
            how="left",
        )
        .filter(
            (F.col("c.Invoice_No") != F.col("s.Invoice_No"))
            & (
                F.abs(
                    F.unix_timestamp(F.col("c.Invoice_DateTime"))
                    - F.unix_timestamp(F.col("s.Invoice_DateTime"))
                )
                <= 86_400
            )
        )
    )

    matched_sales = (
        joined.select(F.col("s.Invoice_No").alias("invoice_no"))
        .groupBy("invoice_no")
        .agg(F.count("*").alias("match_count"))
    )

    return (
        sales.join(matched_sales, sales["Invoice_No"] == matched_sales["invoice_no"], how="left")
        .withColumn("immediately_cancelled", F.coalesce(F.col("match_count") > 0, F.lit(False)))
        .drop("match_count", "invoice_no")
    )


def cap_spike_quantities(df: DataFrame, config: dict[str, Any] | None = None) -> DataFrame:
    """Reduce extreme one-off order quantities using a config-driven guardrail."""
    config = config or read_pipeline_config()
    cap = int(config.get("guardrails", {}).get("max_order_cap_units", 10_000))
    return df.withColumn(
        "Quantity",
        F.when(F.abs(F.col("Quantity")) > cap, F.lit(cap) * F.signum(F.col("Quantity"))).otherwise(F.col("Quantity")),
    )


def build_product_week_panel(df: DataFrame, spark: SparkSession | None = None) -> DataFrame:
    """Build a product-week demand panel with zero-filled weeks and an availability proxy."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase2")

    config = read_pipeline_config()
    gap_weeks = int(config["guardrails"]["availability_gap_weeks"])

    demand = flag_immediately_cancelled(df)
    demand = demand.filter(~F.col("immediately_cancelled"))
    demand = cap_spike_quantities(demand, config)

    demand = demand.withColumn("week_start", F.date_trunc("week", F.col("Invoice_DateTime").cast("timestamp")))
    product_week = (
        demand.groupBy("Stock_Code", "week_start")
        .agg(F.sum("Quantity").cast("long").alias("observed_units"))
    )

    product_week_bounds = (
        product_week.groupBy("Stock_Code")
        .agg(
            F.min("week_start").alias("first_week"),
            F.max("week_start").alias("last_week"),
        )
        .withColumn(
            "week_start",
            F.explode(F.sequence(F.col("first_week"), F.col("last_week"), F.expr("interval 7 days"))),
        )
        .select("Stock_Code", "week_start")
    )

    panel = product_week_bounds.join(product_week, ["Stock_Code", "week_start"], how="left")
    panel = panel.withColumn("observed_units", F.col("observed_units").cast("long"))
    panel = panel.withColumn("units", F.coalesce(F.col("observed_units"), F.lit(0).cast("long")))
    panel = panel.withColumn("zero_filled", F.when(F.col("observed_units").isNull(), F.lit(1)).otherwise(F.lit(0)))

    window = Window.partitionBy("Stock_Code").orderBy("week_start")
    panel = panel.withColumn("previous_units", F.lag("units").over(window))
    panel = panel.withColumn("zero_run_start", F.when((F.col("units") == 0) & (F.col("previous_units") > 0), 1).otherwise(0))
    panel = panel.withColumn("zero_run_id", F.sum("zero_run_start").over(window))
    panel = panel.withColumn(
        "zero_run_length",
        F.count("*").over(Window.partitionBy("Stock_Code", "zero_run_id").orderBy("week_start")),
    )
    panel = panel.withColumn(
        "availability_proxy",
        F.when((F.col("units") == 0) & (F.col("zero_run_length") >= gap_weeks), "possible_unavailable")
        .otherwise("available"),
    )
    panel = panel.withColumn("possibly_unavailable", F.col("availability_proxy") == "possible_unavailable")
    panel = panel.withColumn("in_training", F.when(F.col("possibly_unavailable"), F.lit(False)).otherwise(F.lit(True)))
    panel = panel.drop("previous_units", "zero_run_start", "zero_run_id", "zero_run_length", "observed_units")
    return panel


def build_demand_definition(spark: SparkSession | None = None) -> DataFrame:
    """Return the demand-definition product-week panel with all phase-2 transformations applied."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase2")
    df = load_transactions(spark=spark)
    return build_product_week_panel(df, spark=spark)


def main() -> None:
    """Command-line entry point for the phase 2 demand-definition stage."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase2")
    try:
        panel = build_demand_definition(spark=spark)
        panel.show(10, truncate=False)
    finally:
        spark.stop()
