# Model card

## Intended use

One-week product demand forecasting for this historical retailer dataset. Predictions are decision-support estimates, not measured future outcomes.

## Data and evaluation

The global LightGBM Poisson model is trained using the chronological training period, uses the following validation period for early stopping, and is evaluated on the held-out test period by rolling origin: the test period is cut into 3 blocks of 4 weeks, and before each block the models are refit on every eligible row strictly before it:

- Train: 2009-12-07 through 2011-06-05
- Validation: 2011-06-06 through 2011-09-04
- Test: 2011-09-05 through 2011-11-27

The model features are configured in `configs/pipeline.yaml`; they are calendar and lagged-demand fields only. Test results:

| Model | WAPE | MAE | Bias |
|---|---:|---:|---:|
| lightgbm | 0.6648 | 32.8565 | -1.6233 |
| seasonal_naive | 0.9591 | 47.3972 | 9.3923 |
| moving_average_4 | 0.6457 | 31.9104 | -5.1386 |
| moving_average_13 | 0.6515 | 32.1952 | -9.6642 |

The LightGBM model does not beat the best baseline by WAPE (moving_average_4). The 80% prediction interval comes from separate LightGBM quantile models (10th and 90th percentile) and covered 77.7% of test product-weeks (target 80%; mean width 87.2 units). Global feature attributions are exported to `reports/global_shap_importance.csv` using LightGBM's TreeSHAP contributions; they describe model behaviour, not causality.

## Limitations

Forecasts are one-week-ahead from observed lags, refit every 4 weeks; a separate direct 4-week-ahead model is not evaluated. Of 4,717 products, 2,077 have an identified elasticity (at least 3 distinct list prices, enough weeks, and a 90% interval entirely below zero; pooled fixed-effects slope -0.956). 139 receive a price change (median -5.0%, range -10.0% to +10.0%) and 4,578 are held, each with a reason in `data/gold/pricing/recommendations.parquet`. Revenue changes are estimates under the model, not measured results. Held-out check on 2,936 real test-period price changes (elasticities fitted before 2011-09-05): predicted and actual demand moved in the same direction 63.6% of the time (rank correlation 0.346). The underlying demand proxy cannot distinguish zero demand from stock unavailability. Performance represents a mostly wholesale giftware retailer in 2009–2011 and should not be generalized without further evaluation.
