# Final project report

## Summary

This project rebuilds the data-driven demand analytics workflow from the cleaned silver Parquet input. The verified test suite passes before artifact generation. Data preparation and feature generation use PySpark; a LightGBM one-week global model is compared against seasonal-naive and moving-average baselines using a chronological split.

## Data findings

The transaction reconciliation and derived panel counts are recomputed in [the data card](./data_card.md). Demand seasonality evidence is generated as [monthly demand](./figures/monthly_demand.html) and [weekly demand](./figures/weekly_demand.html); each figure states its source table and date range.

## Forecast evaluation

| Model | WAPE | MAE | Bias |
|---|---:|---:|---:|
| lightgbm | 0.6648 | 32.8565 | -1.6233 |
| seasonal_naive | 0.9591 | 47.3972 | 9.3923 |
| moving_average_4 | 0.6457 | 31.9104 | -5.1386 |
| moving_average_13 | 0.6515 | 32.1952 | -9.6642 |

The model does not beat the best baseline (moving_average_4) on test WAPE. Full methodology and caveats are in [the model card](./model_card.md).

## Reproducible commands

Run `make all` to test and rebuild gold Parquet tables, the forecast artifacts, and report figures from the configured silver dataset. Start the dashboard separately with `make dashboard`.

## Limitations

The availability flag is a **proxy**, not inventory. Competitor prices, promotion labels, and costs are unavailable; revenue estimates are not profit. The streaming implementation is a historical replay, not a live retailer feed. See [README §13](../README.md#13-limitations).
