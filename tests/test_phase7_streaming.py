"""Phase 7 tests for the replay producer and streaming aggregation job."""

from __future__ import annotations

import json
from datetime import datetime

from dpa.streaming.replay import write_replay_event_files
from dpa.streaming.stream_job import aggregate_event_directory
from dpa.utils.spark import get_spark_session


def test_replay_writes_json_events(tmp_path) -> None:
    """The replay producer should write actual event files in a JSON stream format."""
    spark = get_spark_session(app_name="phase7-test-replay")
    rows = [
        (
            "INV-1001",
            "85123A",
            "WHITE HANGING HEART T-LIGHT HOLDER",
            5,
            datetime(2011, 9, 1, 9, 30),
            2.95,
            12345,
            "United Kingdom",
        ),
        (
            "INV-1002",
            "85123A",
            "WHITE HANGING HEART T-LIGHT HOLDER",
            4,
            datetime(2011, 9, 1, 11, 0),
            3.05,
            54321,
            "United Kingdom",
        ),
    ]
    schema = [
        "Invoice_No",
        "Stock_Code",
        "Description",
        "Quantity",
        "Invoice_DateTime",
        "Unit_Price",
        "Customer_ID",
        "Country",
    ]
    df = spark.createDataFrame(rows, schema=schema)
    out_dir = tmp_path / "stream" / "in"
    file_paths = write_replay_event_files(df, out_dir=out_dir, replay_start=datetime(2021, 1, 1))

    assert file_paths
    json_files = sorted(out_dir.glob("*.json"))
    assert json_files
    payload = json.loads(json_files[0].read_text(encoding="utf-8"))
    assert payload[0]["product_id"] == "85123A"
    assert payload[0]["quantity"] in {4, 5}
    spark.stop()


def test_stream_aggregation_has_window_metrics(tmp_path) -> None:
    """The streaming aggregation should summarize demand in hourly, daily and weekly windows."""
    spark = get_spark_session(app_name="phase7-test-stream")
    stream_dir = tmp_path / "stream" / "in"
    stream_dir.mkdir(parents=True, exist_ok=True)
    event_path = stream_dir / "events.json"
    payload = [
        {
            "event_id": "evt-1",
            "event_time": "2011-09-01T09:00:00",
            "product_id": "85123A",
            "invoice_no": "INV-1",
            "quantity": 3,
            "unit_price": 2.95,
            "country": "United Kingdom",
            "customer_id": 12345,
            "source": "historical_replay",
        },
        {
            "event_id": "evt-2",
            "event_time": "2011-09-01T10:00:00",
            "product_id": "85123A",
            "invoice_no": "INV-2",
            "quantity": 5,
            "unit_price": 3.05,
            "country": "United Kingdom",
            "customer_id": 54321,
            "source": "historical_replay",
        },
        {
            "event_id": "evt-3",
            "event_time": "2011-09-02T09:00:00",
            "product_id": "23456",
            "invoice_no": "INV-3",
            "quantity": 7,
            "unit_price": 4.25,
            "country": "United Kingdom",
            "customer_id": 55555,
            "source": "historical_replay",
        },
    ]
    event_path.write_text(json.dumps(payload), encoding="utf-8")

    df = aggregate_event_directory(stream_dir, watermark_minutes=120, window_hours=(1, 24, 168))
    rows_out = df.orderBy("product_id", "window_start").collect()

    assert rows_out
    assert {"product_id", "window_start", "window_end", "window_hours", "demand_units"}.issubset(df.columns)
    assert any(r["product_id"] == "85123A" for r in rows_out)
    spark.stop()
