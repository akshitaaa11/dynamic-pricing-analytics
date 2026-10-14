"""Phase 0 smoke tests for project skeleton setup."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))


def test_project_layout_exists() -> None:
    """The required project skeleton should be present."""
    required_paths = [
        ROOT / "Makefile",
        ROOT / "requirements.txt",
        ROOT / "configs" / "pipeline.yaml",
        ROOT / ".gitignore",
        ROOT / "src" / "dpa" / "utils" / "spark.py",
        ROOT / "dashboard" / "app.py",
    ]
    for path in required_paths:
        assert path.exists(), f"Missing required project path: {path}"


def test_spark_helper_imports() -> None:
    """The Spark session helper should be importable."""
    from dpa.utils.spark import get_spark_session

    assert callable(get_spark_session)
