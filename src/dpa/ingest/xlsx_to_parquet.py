"""Ingest both UCI workbook sheets into traceable bronze Parquet."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import yaml


def read_config() -> tuple[Path, dict[str, Any]]:
    """Return project root and pipeline configuration."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        return root, yaml.safe_load(handle) or {}


def ingest_workbook(
    workbook_path: str | Path,
    bronze_path: str | Path,
) -> int:
    """Read workbook sheets without transforming values and write traceable bronze rows."""
    workbook = Path(workbook_path)
    if not workbook.is_file():
        raise FileNotFoundError(f"Raw workbook does not exist: {workbook}")

    excel_file = pd.ExcelFile(workbook, engine="calamine")
    sheets: list[pd.DataFrame] = []
    for sheet_name in excel_file.sheet_names:
        sheet = pd.read_excel(excel_file, sheet_name=sheet_name)
        sheet["Source_Sheet"] = sheet_name
        sheet["Source_Row"] = range(2, len(sheet) + 2)
        sheets.append(sheet)
    if not sheets:
        raise ValueError(f"No worksheets were found in {workbook}.")

    raw_frame = pd.concat(sheets, ignore_index=True)
    output = Path(bronze_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_frame.to_parquet(output, index=False)
    return len(raw_frame)


def main() -> None:
    """Convert the configured raw workbook into the configured bronze Parquet table."""
    root, config = read_config()
    raw_path = root / config["paths"]["raw_excel"]
    bronze_path = root / config["paths"]["bronze_dir"] / "transactions_raw.parquet"
    row_count = ingest_workbook(raw_path, bronze_path)
    print(f"Ingested {row_count:,} rows from {raw_path} to {bronze_path}")


if __name__ == "__main__":
    main()
