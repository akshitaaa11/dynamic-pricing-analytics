"""Replay historical sales into streaming events."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

from pyspark.sql import DataFrame


def write_replay_event_files(
    dataframe: DataFrame,
    out_dir: str | Path,
    replay_start: datetime | None = None,
    time_compression_seconds: int = 10,
    batch_size: int = 1000,
) -> list[Path]:
    """Write historical rows to JSON replay files in event time order.

    The replay keeps the original ordering but compresses wall-clock time to a fixed
    interval between events so the stream can be used in a demo dashboard without
    requiring a live upstream feed.
    """
    rows = dataframe.orderBy("Invoice_DateTime").collect()
    if not rows:
        return []

    start_time = replay_start or rows[0]["Invoice_DateTime"]
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    files: list[Path] = []
    for start_index in range(0, len(rows), batch_size):
        batch = rows[start_index : start_index + batch_size]
        payload = []
        for offset, row in enumerate(batch):
            event_time = start_time + timedelta(seconds=(start_index + offset) * time_compression_seconds)
            payload.append(
                {
                    "event_id": f"replay-{start_index + offset + 1}",
                    "event_time": event_time.isoformat(),
                    "product_id": str(row["Stock_Code"]),
                    "invoice_no": str(row["Invoice_No"]),
                    "description": row["Description"],
                    "quantity": int(row["Quantity"]),
                    "unit_price": float(row["Unit_Price"]),
                    "customer_id": row["Customer_ID"],
                    "country": row["Country"],
                    "source": "historical_replay",
                }
            )

        file_path = out_path / f"replay_{start_index // batch_size:04d}.json"
        file_path.write_text(json.dumps(payload), encoding="utf-8")
        files.append(file_path)

    return files


def main() -> None:
    """Command-line entry point for the replay producer."""
    from dpa.utils.spark import get_spark_session
    from dpa.etl.validate import load_transactions

    spark = get_spark_session(app_name="dynamic-pricing-analytics-replay")
    try:
        df = load_transactions(spark=spark)
        source_dir = Path(__file__).resolve().parents[3] / "data" / "stream" / "in"
        files = write_replay_event_files(df, out_dir=source_dir, replay_start=datetime(2011, 9, 1, 0, 0, 0))
        print(f"Wrote {len(files)} replay file(s) to {source_dir}")
    finally:
        spark.stop()
