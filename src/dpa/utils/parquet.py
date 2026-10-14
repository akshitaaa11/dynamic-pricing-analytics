"""Local Parquet output helpers for Spark dataframes on Windows."""

from __future__ import annotations

from pathlib import Path
import shutil

from pyspark.sql import DataFrame


def write_spark_parquet(frame: DataFrame, path: str | Path) -> None:
    """Persist Spark-computed rows with PyArrow to avoid Windows winutils dependency.

    Transformations remain in Spark. PyArrow writes the local filesystem file because
    Hadoop's Windows output committer requires an external winutils.exe binary.
    """
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_dir():
        shutil.rmtree(destination)
    elif destination.exists():
        destination.unlink()
    frame.toPandas().to_parquet(destination, index=False)
