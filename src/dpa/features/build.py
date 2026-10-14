"""Feature engineering for the demand-forecasting and pricing stages."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

from dpa.etl.aggregate import build_demand_definition
from dpa.etl.validate import load_transactions
from dpa.utils.spark import get_spark_session


def read_pipeline_config() -> dict[str, Any]:
    """Load configuration values that drive the feature stage."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    return config


def compute_product_week_features(
    spark: SparkSession | None = None,
    panel: DataFrame | None = None,
) -> DataFrame:
    """Assemble a product-week feature table for forecasting and pricing stages."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase3")

    config = read_pipeline_config()
    df = load_transactions(spark=spark)
    if panel is None:
        panel = build_demand_definition(spark=spark)

    sales = df.filter(~F.col("Invoice_No").cast("string").startswith("C"))
    sales = sales.withColumn("week_start", F.date_trunc("week", F.col("Invoice_DateTime").cast("timestamp")))

    small_order_prices = (
        sales.filter(F.col("Quantity") <= 12)
        .withColumn("week_start", F.date_trunc("week", F.col("Invoice_DateTime").cast("timestamp")))
        .groupBy("Stock_Code", "week_start", "Unit_Price")
        .count()
        .withColumn(
            "row_num",
            F.row_number().over(
                Window.partitionBy("Stock_Code", "week_start").orderBy(
                    F.col("count").desc(), F.col("Unit_Price").asc()
                )
            ),
        )
        .filter(F.col("row_num") == 1)
        .drop("count", "row_num")
        .withColumnRenamed("Unit_Price", "small_order_list_price")
    )

    weekly_price_summary = (
        sales.groupBy("Stock_Code", "week_start")
        .agg(
            F.min("Unit_Price").alias("unit_price_min"),
            F.max("Unit_Price").alias("unit_price_max"),
            F.expr("percentile_approx(Unit_Price, 0.5)").alias("weekly_median_price"),
            F.countDistinct("Invoice_No").alias("invoices_this_week"),
        )
        .withColumn("price_spread", F.col("unit_price_max") - F.col("unit_price_min"))
    )

    feature_frame = panel.join(small_order_prices, ["Stock_Code", "week_start"], how="left")
    feature_frame = feature_frame.join(weekly_price_summary, ["Stock_Code", "week_start"], how="left")

    feature_frame = feature_frame.withColumn("year", F.year(F.col("week_start")))
    feature_frame = feature_frame.withColumn("iso_week", F.weekofyear(F.col("week_start")))
    feature_frame = feature_frame.withColumn("month", F.month(F.col("week_start")))
    feature_frame = feature_frame.withColumn("weeks_to_christmas", F.when(F.col("month") == 12, 52 - F.col("iso_week") + 1).otherwise(F.lit(52 - F.col("iso_week") + 1)))
    feature_frame = feature_frame.withColumn(
        "uk_bank_holiday_week",
        F.when(F.col("month").isin(12) & F.col("iso_week").between(48, 53), F.lit(True)).otherwise(F.lit(False)),
    )

    lag_weeks = config.get("features", {}).get("lag_weeks", [1, 2, 4, 8, 12])
    rolling_windows = config.get("features", {}).get("rolling_window_weeks", [4, 8, 12])
    window_spec = Window.partitionBy("Stock_Code").orderBy("week_start")

    for lag in lag_weeks:
        feature_frame = feature_frame.withColumn(f"lag_{lag}_units", F.lag("units", lag).over(window_spec))

    for window in rolling_windows:
        feature_frame = feature_frame.withColumn(
            f"rolling_mean_{window}_units",
            F.avg("units").over(window_spec.rowsBetween(-window, -1)),
        )
        feature_frame = feature_frame.withColumn(
            f"rolling_std_{window}_units",
            F.stddev("units").over(window_spec.rowsBetween(-window, -1)),
        )

    feature_frame = feature_frame.withColumn("weeks_since_launch", F.row_number().over(window_spec) - 1)
    feature_frame = feature_frame.withColumn("list_price", F.col("small_order_list_price"))
    previous_week_price = F.lag("list_price", 1).over(window_spec)
    feature_frame = feature_frame.withColumn(
        "price_change_pct",
        F.when(
            previous_week_price.isNotNull() & (previous_week_price != 0),
            (F.col("list_price") - previous_week_price) / previous_week_price,
        ),
    )
    feature_frame = feature_frame.withColumn("zero_filled", F.when(F.col("units") == 0, F.lit(1)).otherwise(F.lit(0)))
    feature_frame = feature_frame.withColumn("possibly_unavailable", F.col("availability_proxy") == "possible_unavailable")
    feature_frame = feature_frame.withColumn("in_training", F.when(F.col("possibly_unavailable"), F.lit(False)).otherwise(F.lit(True)))
    feature_frame = feature_frame.withColumn("week_start", F.to_date(F.col("week_start")))

    return feature_frame.orderBy("Stock_Code", "week_start")


def build_feature_dataset(spark: SparkSession | None = None) -> DataFrame:
    """Public entry point for the feature-building stage."""
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-phase3")
    return compute_product_week_features(spark=spark)


def main() -> None:
    """Command-line entry point for phase 3 feature generation."""
    root = Path(__file__).resolve().parents[3]
    spark = get_spark_session(app_name="dynamic-pricing-analytics-phase3")
    try:
        df = build_feature_dataset(spark=spark)
        output_path = root / "data" / "gold" / "product_week_features.parquet"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.write.mode("overwrite").parquet(str(output_path))
        print(f"Wrote product-week features to {output_path}")
    finally:
        spark.stop()
