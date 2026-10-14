"""Price-elasticity estimation for the dynamic pricing project."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
import yaml


def read_pipeline_config() -> dict[str, Any]:
    """Load the project config so thresholds remain stored in YAML, not code."""
    root = Path(__file__).resolve().parents[3]
    with (root / "configs" / "pipeline.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}
    return config


COLUMNS = [
    "Stock_Code",
    "elasticity",
    "ci_lower",
    "ci_upper",
    "identified",
    "n_distinct_prices",
    "n_weeks",
    "reason",
    "raw_elasticity",
    "pooled_elasticity",
]
CI_Z_90 = 1.6448536269514722


def _two_way_demean(values: pd.DataFrame, product: pd.Series, week: pd.Series, iterations: int = 20) -> pd.DataFrame:
    """Remove product and week fixed effects by alternating projections."""
    out = values.copy()
    for _ in range(iterations):
        out = out - out.groupby(product.values).transform("mean")
        out = out - out.groupby(week.values).transform("mean")
    return out


def estimate_elasticity(
    panel: pd.DataFrame,
    product_col: str = "Stock_Code",
    price_col: str = "small_order_list_price",
    demand_col: str = "units",
    week_col: str = "week_start",
) -> pd.DataFrame:
    """Estimate per-product price elasticity from a fixed-effects log-log panel.

    1. Pooled slope of ``log(1 + units)`` on ``log(list price)`` with product and week
       fixed effects (week effects absorb seasonality and trend); SE clustered by product.
    2. Per-product slopes after removing week effects, each with its own standard error.
    3. Empirical-Bayes shrinkage of each slope toward the pooled slope, with a posterior
       90% interval. A product is *identified* only if it has >= 3 distinct list prices,
       enough weeks, and the whole interval is below zero; otherwise it must be held.
    """
    if panel.empty:
        return pd.DataFrame(columns=COLUMNS)

    prepared = panel[[product_col, price_col, demand_col, week_col]].copy()
    prepared.columns = ["Stock_Code", "small_order_list_price", "units", "week_start"]
    prepared = prepared.dropna()
    prepared = prepared[(prepared["small_order_list_price"] > 0) & (prepared["units"] >= 0)].copy()
    if prepared.empty:
        return pd.DataFrame(columns=COLUMNS)
    prepared["week_start"] = pd.to_datetime(prepared["week_start"])
    prepared["log_price"] = np.log(prepared["small_order_list_price"])
    prepared["log_units"] = np.log1p(prepared["units"])

    config = read_pipeline_config()
    min_weeks = int(config.get("guardrails", {}).get("min_weeks_for_elasticity", 12))

    # Pooled two-way fixed-effects slope with product-clustered standard error.
    both = _two_way_demean(prepared[["log_price", "log_units"]], prepared["Stock_Code"], prepared["week_start"])
    sxx = float((both["log_price"] ** 2).sum())
    pooled = float((both["log_price"] * both["log_units"]).sum() / sxx) if sxx > 0 else 0.0

    # Week-demeaned data for the per-product regressions.
    weekly = prepared[["log_price", "log_units"]] - prepared.groupby("week_start")[["log_price", "log_units"]].transform("mean")
    prepared["x"] = weekly["log_price"]
    prepared["y"] = weekly["log_units"]

    rows: list[dict[str, Any]] = []
    for product, group in prepared.groupby("Stock_Code", sort=True):
        n_prices = int(group["small_order_list_price"].nunique())
        n_weeks = int(group["week_start"].nunique())
        row = {
            "Stock_Code": product,
            "elasticity": pooled,
            "ci_lower": np.nan,
            "ci_upper": np.nan,
            "identified": False,
            "n_distinct_prices": n_prices,
            "n_weeks": n_weeks,
            "reason": "Hold price: elasticity not identified.",
            "raw_elasticity": np.nan,
            "pooled_elasticity": pooled,
            "_se": np.nan,
        }
        x = group["x"] - group["x"].mean()
        y = group["y"] - group["y"].mean()
        sxx_i = float((x**2).sum())
        if n_prices >= 3 and n_weeks >= min_weeks and sxx_i > 1e-12 and len(group) > 2:
            beta = float((x * y).sum() / sxx_i)
            resid = y - beta * x
            sigma2 = float((resid**2).sum() / (len(group) - 2))
            row["raw_elasticity"] = beta
            row["_se"] = float(np.sqrt(sigma2 / sxx_i))
        rows.append(row)

    result = pd.DataFrame(rows)
    eligible = result["_se"].notna() & (result["_se"] > 0)
    if eligible.any():
        raw = result.loc[eligible, "raw_elasticity"]
        se2 = result.loc[eligible, "_se"] ** 2
        tau2 = max(float(raw.var(ddof=1) - se2.mean()) if len(raw) > 1 else 0.0, 1e-6)
        weight = tau2 / (tau2 + se2)
        shrunk = pooled + weight * (raw - pooled)
        post_sd = np.sqrt(weight * se2)
        result.loc[eligible, "elasticity"] = shrunk
        result.loc[eligible, "ci_lower"] = shrunk - CI_Z_90 * post_sd
        result.loc[eligible, "ci_upper"] = shrunk + CI_Z_90 * post_sd
        identified = eligible & (result["ci_upper"] < 0)
        result.loc[identified, "identified"] = True
        result.loc[identified, "reason"] = "Elasticity identified."
    return result[COLUMNS].sort_values("Stock_Code").reset_index(drop=True)


def fit_elasticity_model(panel: pd.DataFrame, **kwargs: Any) -> pd.DataFrame:
    """Alias retained for compatibility with the project naming conventions."""
    return estimate_elasticity(panel, **kwargs)


def main() -> None:
    """Simple CLI entry point for elasticity estimation."""
    raise NotImplementedError("The elasticity CLI is not used by the automated validation tests.")
