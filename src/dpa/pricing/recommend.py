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


PRICE_GRID_STEPS = 41


def _expected_revenue(price: float, current_price: float, forecast_units: float, elasticity: float) -> float:
    return float(price * forecast_units * (price / current_price) ** elasticity)


def _confidence(n_weeks: int, ci_lower: float, ci_upper: float) -> str:
    width = ci_upper - ci_lower if np.isfinite(ci_lower) and np.isfinite(ci_upper) else np.inf
    if n_weeks >= 40 and width < 1.0:
        return "High"
    if n_weeks >= 20 and width < 2.0:
        return "Medium"
    return "Low"


def generate_recommendation(
    product_row: dict[str, Any],
    elasticity: float,
    forecast_units: float,
    current_price: float,
    min_price: float,
    max_price: float,
    possibly_unavailable: bool = False,
    demand_falling: bool = False,
    ci_lower: float | None = None,
    ci_upper: float | None = None,
    n_weeks: int = 0,
) -> dict[str, Any]:
    """Search for the revenue-maximising price inside the README guardrails, or hold.

    ``expected_units(p) = forecast_units * (p / current_price) ** elasticity`` and the
    best candidate is only adopted when its revenue gain is positive for every
    elasticity inside the 90% interval, so a change is never driven by one point estimate.
    """
    config = read_pipeline_config()
    max_change_pct = float(config.get("guardrails", {}).get("max_price_change_pct", 0.10))
    lo = elasticity if ci_lower is None or not np.isfinite(ci_lower) else ci_lower
    hi = elasticity if ci_upper is None or not np.isfinite(ci_upper) else ci_upper

    def hold(reason: str, binding: str = "none") -> dict[str, Any]:
        return {
            "Stock_Code": product_row.get("Stock_Code"),
            "current_price": float(current_price),
            "recommended_price": float(current_price),
            "percent_change": 0.0,
            "reason": reason,
            "expected_units": float(forecast_units),
            "revenue_gain": 0.0,
            "revenue_gain_low": 0.0,
            "revenue_gain_high": 0.0,
            "binding_guardrail": binding,
            "confidence": _confidence(n_weeks, lo, hi),
            "hold": True,
        }

    if not np.isfinite(elasticity):
        return hold("Hold price: no identified elasticity.")
    if not np.isfinite(current_price) or current_price <= 0 or not np.isfinite(forecast_units) or forecast_units < 0:
        return hold("Hold price: no usable current price or forecast.")
    if possibly_unavailable:
        return hold("Hold price: product flagged as possibly unavailable.")

    min_allowed = max(min_price, current_price * (1.0 - max_change_pct))
    max_allowed = min(max_price, current_price * (1.0 + max_change_pct))
    if demand_falling:
        max_allowed = min(max_allowed, current_price)
    if min_allowed > max_allowed:
        return hold("Hold price: guardrails leave no admissible price range.")

    grid = {round_price_to_retail_endings(p) for p in np.linspace(min_allowed, max_allowed, PRICE_GRID_STEPS)}
    candidates = sorted(p for p in grid if min_allowed - 1e-9 <= p <= max_allowed + 1e-9 and p != current_price)
    if not candidates:
        return hold("Hold price: no retail-ending price lies inside the guardrails.")

    baseline = _expected_revenue(current_price, current_price, forecast_units, elasticity)
    best = max(candidates, key=lambda p: _expected_revenue(p, current_price, forecast_units, elasticity))
    gain = _expected_revenue(best, current_price, forecast_units, elasticity) - baseline
    gain_a = _expected_revenue(best, current_price, forecast_units, lo) - _expected_revenue(current_price, current_price, forecast_units, lo)
    gain_b = _expected_revenue(best, current_price, forecast_units, hi) - _expected_revenue(current_price, current_price, forecast_units, hi)
    low_gain, high_gain = min(gain_a, gain_b, gain), max(gain_a, gain_b, gain)
    if gain <= 0 or low_gain <= 0:
        return hold("Hold price: no price change has a revenue gain that holds across the elasticity interval.")

    change = (best - current_price) / current_price
    if abs(abs(change) - max_change_pct) < 0.02:
        binding = "max_price_change"
    elif best >= max_price - 1e-9 or best <= min_price + 1e-9:
        binding = "observed_price_range"
    else:
        binding = "none"
    direction = "Raise" if change > 0 else "Lower"
    reason = (
        f"{direction} price {change:+.1%}: forecast {forecast_units:.0f} units, elasticity {elasticity:.2f} "
        f"(90% CI {lo:.2f} to {hi:.2f}); estimated revenue change {gain:+.2f} "
        f"(range {low_gain:+.2f} to {high_gain:+.2f}) under the model, not a measured result."
    )
    return {
        "Stock_Code": product_row.get("Stock_Code"),
        "current_price": float(current_price),
        "recommended_price": float(best),
        "percent_change": float(change),
        "reason": reason,
        "expected_units": float(forecast_units * (best / current_price) ** elasticity),
        "revenue_gain": float(gain),
        "revenue_gain_low": float(low_gain),
        "revenue_gain_high": float(high_gain),
        "binding_guardrail": binding,
        "confidence": _confidence(n_weeks, lo, hi),
        "hold": False,
    }


def build_recommendations(features: pd.DataFrame, predictions: pd.DataFrame, elasticity: pd.DataFrame) -> pd.DataFrame:
    """Recommend or hold every product using forecast, identified elasticity and guardrails.

    ``features`` needs Stock_Code, week_start, small_order_list_price, possibly_unavailable and
    rolling_mean_8_units; ``predictions`` needs Stock_Code, week_start and lightgbm (the latest
    forecast week per product is used as the demand forecast at the current price).
    """
    frame = features.copy()
    frame["week_start"] = pd.to_datetime(frame["week_start"])
    priced = frame.dropna(subset=["small_order_list_price"]).sort_values(["Stock_Code", "week_start"])
    history = priced.groupby("Stock_Code")["small_order_list_price"].agg(min_price="min", max_price="max")
    current = priced.drop_duplicates("Stock_Code", keep="last")[["Stock_Code", "small_order_list_price"]].rename(
        columns={"small_order_list_price": "current_price"}
    )
    preds = predictions.copy()
    preds["week_start"] = pd.to_datetime(preds["week_start"])
    last_forecast = preds.sort_values(["Stock_Code", "week_start"]).drop_duplicates("Stock_Code", keep="last")
    last_forecast = last_forecast[["Stock_Code", "week_start", "lightgbm"]].merge(
        frame[["Stock_Code", "week_start", "possibly_unavailable", "rolling_mean_8_units"]],
        on=["Stock_Code", "week_start"],
        how="left",
    )
    products = frame[["Stock_Code"]].drop_duplicates().sort_values("Stock_Code")
    table = (
        products.merge(current, on="Stock_Code", how="left")
        .merge(history.reset_index(), on="Stock_Code", how="left")
        .merge(last_forecast, on="Stock_Code", how="left")
        .merge(elasticity, on="Stock_Code", how="left")
    )

    rows = []
    for record in table.to_dict("records"):
        if pd.isna(record["current_price"]):
            rows.append(_no_data_hold(record, "Hold price: no observed small-order price is available for this product."))
            continue
        if pd.isna(record["lightgbm"]):
            rows.append(_no_data_hold(record, "Hold price: no forecast is available for this product."))
            continue
        if not bool(record.get("identified", False)):
            rows.append(_no_data_hold(record, "Hold price: elasticity not identified."))
            continue
        rolling = record.get("rolling_mean_8_units")
        falling = bool(pd.notna(rolling) and record["lightgbm"] < rolling)
        rows.append(
            generate_recommendation(
                {"Stock_Code": record["Stock_Code"]},
                elasticity=float(record["elasticity"]),
                forecast_units=float(record["lightgbm"]),
                current_price=float(record["current_price"]),
                min_price=float(record["min_price"]),
                max_price=float(record["max_price"]),
                possibly_unavailable=bool(record.get("possibly_unavailable") is True),
                demand_falling=falling,
                ci_lower=float(record["ci_lower"]),
                ci_upper=float(record["ci_upper"]),
                n_weeks=int(record["n_weeks"]),
            )
        )
    return pd.DataFrame(rows).reset_index(drop=True)


def _no_data_hold(record: dict[str, Any], reason: str) -> dict[str, Any]:
    price = record.get("current_price")
    return {
        "Stock_Code": record["Stock_Code"],
        "current_price": price,
        "recommended_price": price,
        "percent_change": 0.0,
        "reason": reason,
        "expected_units": record.get("lightgbm"),
        "revenue_gain": 0.0,
        "revenue_gain_low": 0.0,
        "revenue_gain_high": 0.0,
        "binding_guardrail": "none",
        "confidence": "Low",
        "hold": True,
    }


def evaluate_price_response(features: pd.DataFrame, elasticity: pd.DataFrame, since: str) -> dict[str, float]:
    """Held-out check: do elasticities fitted before ``since`` predict demand after real price changes?

    For each identified product week on/after ``since`` whose list price moved by at least the
    observed-markdown threshold, compare the predicted log change in demand (elasticity times
    the log price change) with the actual change versus its trailing 4-week mean.
    """
    threshold = float(read_pipeline_config()["guardrails"]["observed_markdown_threshold_pct"])
    frame = features.copy()
    frame["week_start"] = pd.to_datetime(frame["week_start"])
    frame = frame[frame["week_start"] >= pd.Timestamp(since)]
    frame = frame[frame["price_change_pct"].abs() >= threshold]
    frame = frame.merge(elasticity.loc[elasticity["identified"], ["Stock_Code", "elasticity"]], on="Stock_Code")
    frame = frame.dropna(subset=["rolling_mean_4_units", "units", "price_change_pct"])
    frame = frame[frame["price_change_pct"] > -1]
    if frame.empty:
        return {"n_price_changes": 0, "sign_agreement": float("nan"), "rank_correlation": float("nan")}
    predicted = frame["elasticity"] * np.log1p(frame["price_change_pct"])
    actual = np.log1p(frame["units"]) - np.log1p(frame["rolling_mean_4_units"])
    return {
        "n_price_changes": int(len(frame)),
        "sign_agreement": float((np.sign(predicted) == np.sign(actual)).mean()),
        "rank_correlation": float(pd.Series(predicted.values).corr(pd.Series(actual.values), method="spearman")),
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


def run_pricing(features: pd.DataFrame, predictions: pd.DataFrame, config: dict[str, Any]) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, float]]:
    """Estimate elasticities, build recommendations and run the held-out price-response check."""
    from dpa.analysis.elasticity import estimate_elasticity

    usable = features[~features["possibly_unavailable"].astype(bool)]
    columns = ["Stock_Code", "small_order_list_price", "units", "week_start"]
    elasticity = estimate_elasticity(usable[columns])
    recommendations = build_recommendations(features, predictions, elasticity)
    test_start = config["periods"]["test_start"]
    pre_test = usable[pd.to_datetime(usable["week_start"]) < pd.Timestamp(test_start)]
    check = evaluate_price_response(features, estimate_elasticity(pre_test[columns]), test_start)
    return elasticity, recommendations, check


def main() -> None:
    """Persist elasticities and recommendations from the gold feature and forecast tables."""
    root = Path(__file__).resolve().parents[3]
    config = read_pipeline_config()
    gold = root / config["paths"]["gold_dir"]
    for required in ("product_week_features.parquet", "forecast_predictions.parquet"):
        if not (gold / required).exists():
            raise FileNotFoundError(f"{required} is missing; run the features and train targets first: {gold}")
    features = pd.read_parquet(gold / "product_week_features.parquet")
    predictions = pd.read_parquet(gold / "forecast_predictions.parquet")
    elasticity, recommendations, check = run_pricing(features, predictions, config)
    output = gold / "pricing"
    output.mkdir(parents=True, exist_ok=True)
    elasticity.to_parquet(output / "elasticity.parquet", index=False)
    recommendations.to_parquet(output / "recommendations.parquet", index=False)
    print(f"{len(recommendations):,} products: {int((~recommendations['hold']).sum()):,} recommendations, "
          f"{int(recommendations['hold'].sum()):,} holds. Held-out price-response check: {check}")
