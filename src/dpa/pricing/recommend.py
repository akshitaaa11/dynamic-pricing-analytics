"""Pricing recommendation engine for the dynamic pricing project."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml


def read_pipeline_config() -> dict[str, Any]:
    """Load the project config for the pricing guardrails and price rounding settings."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    return config


def round_price_to_retail_endings(price: float, price_endings: tuple[float, ...] = (0.45, 0.65, 0.95)) -> float:
    """Round a candidate price to a valid retailer-specific ending."""
    if not np.isfinite(price):
        return float(price)

    base = np.floor(price)
    fractional = price - base
    nearest = min(price_endings, key=lambda ending: abs(fractional - ending))
    return float(base + nearest)


def generate_recommendation(
    product_row: dict[str, Any],
    elasticity: float,
    forecast_units: float,
    current_price: float,
    min_price: float,
    max_price: float,
    possibly_unavailable: bool = False,
    demand_falling: bool = False,
) -> dict[str, Any]:
    """Generate a pricing recommendation or a hold decision using the README guardrails."""
    config = read_pipeline_config()
    max_change_pct = float(config.get("guardrails", {}).get("max_price_change_pct", 0.10))
    reason = "Hold price: no identified elasticity."

    if not np.isfinite(elasticity):
        return {
            "Stock_Code": product_row.get("Stock_Code"),
            "current_price": float(current_price),
            "recommended_price": float(current_price),
            "percent_change": 0.0,
            "reason": reason,
            "hold": True,
        }

    min_allowed = max(min_price, current_price * (1.0 - max_change_pct))
    max_allowed = min(max_price, current_price * (1.0 + max_change_pct))
    candidate = float(current_price) * (1.0 + (0.0 if demand_falling else 0.05))
    candidate = max(min_allowed, min(max_allowed, candidate))
    candidate = round_price_to_retail_endings(candidate)

    if possibly_unavailable:
        reason = "Hold price: product flagged as possibly unavailable."
        candidate = float(current_price)
    elif demand_falling:
        reason = "Hold price: demand is falling, so price increases are not allowed."
        candidate = float(current_price)
    elif candidate < min_allowed or candidate > max_allowed:
        reason = "Hold price: candidate price violates guardrails."
        candidate = float(current_price)

    expected_units = forecast_units * (candidate / current_price) ** elasticity if current_price > 0 else forecast_units
    revenue_gain = (candidate * expected_units) - (current_price * forecast_units)

    return {
        "Stock_Code": product_row.get("Stock_Code"),
        "current_price": float(current_price),
        "recommended_price": float(candidate),
        "percent_change": float((candidate - current_price) / current_price) if current_price else 0.0,
        "reason": reason,
        "expected_units": float(expected_units),
        "revenue_gain": float(revenue_gain),
        "hold": candidate == current_price,
    }


def build_hold_recommendations(features: pd.DataFrame) -> pd.DataFrame:
    """Create data-backed holds when a validated elasticity estimate is unavailable.

    A price change is not made from a price-demand association alone. This build does
    not produce the README's validated fixed-effects elasticity and uncertainty
    estimates, so each product receives an explicit hold rather than an unsupported
    recommendation.
    """
    required_columns = {"Stock_Code", "small_order_list_price"}
    missing = sorted(required_columns - set(features.columns))
    if missing:
        raise ValueError(f"Pricing input is missing required columns: {missing}")

    product_ids = features[["Stock_Code"]].dropna().drop_duplicates().sort_values("Stock_Code")
    price_history = features[["Stock_Code", "small_order_list_price"]].copy()
    if "week_start" in features.columns:
        price_history["week_start"] = pd.to_datetime(features["week_start"], errors="raise")
        price_history = price_history.sort_values(["Stock_Code", "week_start"])
    price_history = price_history.dropna(subset=["small_order_list_price"])
    price_history = price_history.drop_duplicates("Stock_Code", keep="last")
    current_prices = product_ids.merge(
        price_history[["Stock_Code", "small_order_list_price"]],
        on="Stock_Code",
        how="left",
        validate="one_to_one",
    )
    current_prices["current_price"] = pd.to_numeric(
        current_prices["small_order_list_price"], errors="coerce"
    )
    current_prices["recommended_price"] = current_prices["current_price"]
    current_prices["percent_change"] = 0.0
    current_prices["hold"] = True
    current_prices["reason"] = (
        "Hold price: a validated fixed-effects elasticity estimate and uncertainty "
        "range are unavailable, so a price change is not supported."
    )
    current_prices.loc[current_prices["current_price"].isna(), "reason"] = (
        "Hold price: no observed small-order price is available for this product."
    )
    return current_prices[
        [
            "Stock_Code",
            "current_price",
            "recommended_price",
            "percent_change",
            "hold",
            "reason",
        ]
    ].reset_index(drop=True)


def main() -> None:
    """Persist the data-supported pricing decisions from the gold feature table."""
    root = Path(__file__).resolve().parents[3]
    config = read_pipeline_config()
    feature_path = root / config["paths"]["gold_dir"] / "product_week_features.parquet"
    if not feature_path.exists():
        raise FileNotFoundError(f"Feature table is missing; run the features target first: {feature_path}")

    frame = pd.read_parquet(feature_path)
    recommendations = build_hold_recommendations(frame)
    output_path = root / config["paths"]["gold_dir"] / "pricing" / "recommendations.parquet"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    recommendations.to_parquet(output_path, index=False)
    print(
        f"Wrote {len(recommendations):,} hold decisions to {output_path}; "
        "no unsupported price changes were generated."
    )
