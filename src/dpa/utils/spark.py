"""Spark session helpers."""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

from pyspark.sql import SparkSession


def get_spark_session(app_name: str = "dynamic-pricing-analytics", master: Optional[str] = None) -> SparkSession:
    """Create or reuse a Spark session for the project.

    Args:
        app_name: Application name reported in Spark UI.
        master: Optional Spark master URL; defaults to the local environment.

    Returns:
        A configured SparkSession instance.
    """
    os.environ["SPARK_LOCAL_HOSTNAME"] = "localhost"
    os.environ["SPARK_LOCAL_IP"] = "127.0.0.1"
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

    builder = SparkSession.builder.appName(app_name)
    if master:
        builder = builder.master(master)

    spark = (
        builder
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.adaptive.enabled", "true")
        .config("spark.driver.host", "127.0.0.1")
        .config("spark.driver.bindAddress", "127.0.0.1")
        .getOrCreate()
    )
    logging.getLogger(__name__).info("Spark session created for %s", app_name)
    return spark
