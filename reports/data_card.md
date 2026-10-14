# Data card

## Dataset and lineage

The source is the UCI Online Retail II dataset described in [README §2](../README.md#2-the-dataset-what-we-actually-have). This rebuild starts from the configured cleaned silver Parquet table. No external market, inventory, competitor, promotion, or cost data is merged into the retailer dataset.

| Measurement | Recomputed value |
|---|---:|
| Clean transaction rows | 1,033,062 |
| Sale rows | 1,015,088 |
| Gross sale units | 11,221,957 |
| Gross sale revenue | £19,700,954.46 |
| Cancellation value | £-719,692.94 |
| Product-week rows | 322,722 |
| Zero-filled product-week rows | 127,655 |
| Possibly-unavailable proxy rows | 54,928 |
| Feature rows | 322,722 |

## Derived-table lineage

- Product-week panel: `data/gold/product_week_panel.parquet`
- Feature table: `data/gold/product_week_features.parquet`
- Forecast holdout predictions: `data/gold/forecast_predictions.parquet`
- Figures: `reports/figures/`

## Limitations

The availability indicator is a **proxy** inferred from observed sales gaps; it is not inventory data. Competitor prices, promotions, and costs are unavailable. Observed markdowns are not labelled as promotions. Revenue is not profit. The silver source does not retain rejected raw rows, so this rebuild cannot regenerate historical rejection counts or row-level exclusion reasons from silver alone.

Pricing output currently contains 4,717 explicit hold decisions. The feature table retains observed weekly small-order prices, but this build does not produce the README's validated fixed-effects elasticity estimate and uncertainty range. No suggested price changes are manufactured.

