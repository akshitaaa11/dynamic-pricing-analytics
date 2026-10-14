"""Structured Streaming demand-monitoring job."""

from __future__ import annotations

from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

from dpa.utils.spark import get_spark_session


def aggregate_event_directory(
    stream_dir: str | Path,
    watermark_minutes: int = 120,
    window_hours: tuple[int, ...] = (1, 24, 168),
    spark: SparkSession | None = None,
) -> DataFrame:
    """Aggregate JSON replay events into rolling product demand metrics.

    The function returns a table with one row per product/window. This is enough to
    drive a live dashboard without requiring Kafka.
    """
    if spark is None:
        spark = get_spark_session(app_name="dynamic-pricing-analytics-stream")

    source = Path(stream_dir)
    if not source.exists():
        return spark.createDataFrame([], schema="product_id STRING, window_start TIMESTAMP, window_end TIMESTAMP, window_hours INT, demand_units DOUBLE")

    json_files = sorted(source.glob("*.json"))
    if not json_files:
        return spark.createDataFrame([], schema="product_id STRING, window_start TIMESTAMP, window_end TIMESTAMP, window_hours INT, demand_units DOUBLE")

    df = spark.read.option("multiline", "false").json([str(path) for path in json_files])
    df = df.withColumn("event_time", F.to_timestamp(F.col("event_time")))
    df = df.withColumn("product_id", F.col("product_id").cast("string"))
    df = df.withColumn("quantity", F.col("quantity").cast("double"))
    df = df.withColumn("event_time", F.col("event_time").cast("timestamp"))
    df = df.withWatermark("event_time", f"{watermark_minutes} minutes")

    rows = []
    for hours in window_hours:
        window = df.groupBy(
            F.col("product_id"),
            F.window(F.col("event_time"), f"{hours} hours").alias("event_window"),
        ).agg(F.sum("quantity").alias("demand_units"))
        window = window.withColumn("window_start", F.col("event_window").start)
        window = window.withColumn("window_end", F.col("event_window").end)
        window = window.withColumn("window_hours", F.lit(hours))
        rows.append(window.select("product_id", "window_start", "window_end", "window_hours", "demand_units"))

    if not rows:
        return spark.createDataFrame([], schema="product_id STRING, window_start TIMESTAMP, window_end TIMESTAMP, window_hours INT, demand_units DOUBLE")

    combined = rows[0]
    for next_df in rows[1:]:
        combined = combined.unionByName(next_df)
    return combined.orderBy("product_id", "window_start", "window_hours")


def main() -> None:
    """Process the historical replay and summarize live demand trends."""
    spark = get_spark_session(app_name="dynamic-pricing-analytics-stream")
    try:
        stream_dir = Path(__file__).resolve().parents[3] / "data" / "stream" / "in"
        dataset = aggregate_event_directory(stream_dir, spark=spark)
        dataset.show(20, truncate=False)
    finally:
        spark.stop()
