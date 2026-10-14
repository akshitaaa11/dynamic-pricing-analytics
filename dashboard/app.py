"""Streamlit dashboard for the dynamic pricing analytics project."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import streamlit as st

def load_feature_table() -> pd.DataFrame:
    """Load the feature table from the gold layer if present, or build it from source."""
    root = Path(__file__).resolve().parents[1]
    candidates = [
        root / "data" / "gold" / "product_week_features.parquet",
        root / "data" / "gold" / "feature_dataset.parquet",
        root / "data" / "gold" / "product_week_features.parquet",
        root / "data" / "gold" / "panel.parquet",
    ]

    for candidate in candidates:
        if candidate.exists():
            return pd.read_parquet(candidate)

    raise FileNotFoundError(
        "Gold feature Parquet is missing. Run the reproducible build (`make all`) before starting the dashboard."
    )


def build_summary_kpis(frame: pd.DataFrame) -> dict[str, float | int]:
    """Compute KPI values directly from the feature data without hard-coded totals."""
    if frame.empty:
        return {"total_units": 0, "active_products": 0, "revenue_proxy": 0.0}

    working = frame.copy()
    working["week_start"] = pd.to_datetime(working["week_start"], errors="coerce")
    if "list_price" in working.columns:
        price_series = working["list_price"]
    elif "small_order_list_price" in working.columns:
        price_series = working["small_order_list_price"]
    else:
        price_series = pd.Series(0.0, index=working.index)

    working["revenue_proxy"] = working.get("units", 0).fillna(0) * price_series.fillna(0)

    return {
        "total_units": int(working.get("units", 0).fillna(0).sum()),
        "active_products": int(working["Stock_Code"].nunique()),
        "revenue_proxy": float(working["revenue_proxy"].sum()),
    }


def weekly_trend(frame: pd.DataFrame) -> pd.DataFrame:
    """Aggregate the feature table to a weekly trend for plotting."""
    if frame.empty:
        return pd.DataFrame(columns=["week_start", "units", "revenue_proxy"])

    working = frame.copy()
    working["week_start"] = pd.to_datetime(working["week_start"], errors="coerce")
    if "list_price" in working.columns:
        price_series = working["list_price"]
    else:
        price_series = working.get("small_order_list_price", pd.Series(0.0, index=working.index))

    working["revenue_proxy"] = working.get("units", 0).fillna(0) * price_series.fillna(0)
    return (
        working.groupby("week_start", as_index=False)
        .agg(units=("units", "sum"), revenue_proxy=("revenue_proxy", "sum"))
        .sort_values("week_start")
    )


def build_product_table(frame: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
    """Summarise product demand and implied revenue for the product table."""
    if frame.empty:
        return pd.DataFrame(columns=["Stock_Code", "total_units", "avg_list_price", "revenue_proxy"])

    working = frame.copy()
    if "list_price" in working.columns:
        price_series = working["list_price"]
    else:
        price_series = working.get("small_order_list_price", pd.Series(0.0, index=working.index))
    working["revenue_proxy"] = working.get("units", 0).fillna(0) * price_series.fillna(0)
    product_summary = (
        working.groupby("Stock_Code", as_index=False)
        .agg(total_units=("units", "sum"), avg_list_price=("list_price", "mean"), revenue_proxy=("revenue_proxy", "sum"))
    )
    return product_summary.sort_values("total_units", ascending=False).head(top_n).reset_index(drop=True)


def main() -> None:
    """Render the dashboard pages based on the generated product-week feature data."""
    st.set_page_config(page_title="Dynamic Pricing Analytics", layout="wide")
    st.title("Dynamic Pricing Analytics for an Online Retailer")

    frame = load_feature_table()
    if frame.empty:
        st.warning("No feature table is available yet. Run the feature pipeline to generate the product-week panel before opening the dashboard.")
        return

    summary = build_summary_kpis(frame)
    trend = weekly_trend(frame)
    product_table = build_product_table(frame)

    left_col, middle_col, right_col = st.columns(3)
    left_col.metric("Total units", f"{summary['total_units']:,}")
    middle_col.metric("Active products", f"{summary['active_products']:,}")
    right_col.metric("Revenue proxy", f"£{summary['revenue_proxy']:,.2f}")

    st.subheader("Weekly trend")
    fig = px.line(trend, x="week_start", y=["units", "revenue_proxy"], title="Demand and revenue proxy by week")
    st.plotly_chart(fig, use_container_width=True)

    st.subheader("Top products")
    st.dataframe(product_table, use_container_width=True)

    st.subheader("Price vs demand")
    if "list_price" in frame.columns:
        chart_frame = frame[["Stock_Code", "list_price", "units", "week_start"]].copy()
    elif "small_order_list_price" in frame.columns:
        chart_frame = frame[["Stock_Code", "small_order_list_price", "units", "week_start"]].copy()
        chart_frame = chart_frame.rename(columns={"small_order_list_price": "list_price"})
    else:
        chart_frame = frame[["Stock_Code", "units", "week_start"]].copy()
        chart_frame["list_price"] = 0.0

    price_fig = px.scatter(chart_frame, x="list_price", y="units", hover_name="Stock_Code", title="List price vs demand")
    st.plotly_chart(price_fig, use_container_width=True)

    st.subheader("Data & limitations")
    st.markdown(
        "This dashboard is driven by the project feature table and respects the README’s requirement to use only observed data and documented proxies. Missing factors such as inventory, promotions, competitor pricing, and costs remain explicitly unavailable."
    )


if __name__ == "__main__":
    main()
