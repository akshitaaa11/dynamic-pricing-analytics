"""Phase 6 tests for the Streamlit dashboard scaffolding."""

from __future__ import annotations

import importlib.util
from pathlib import Path

APP_PATH = Path(__file__).resolve().parents[1] / "dashboard" / "app.py"


def test_dashboard_module_imports() -> None:
    """The dashboard module should import cleanly without needing execution of the full app."""
    spec = importlib.util.spec_from_file_location("dynamic_pricing_dashboard", APP_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert module is not None
    spec.loader.exec_module(module)
    assert hasattr(module, "load_feature_table")
    assert hasattr(module, "build_summary_kpis")
    assert hasattr(module, "weekly_trend")
