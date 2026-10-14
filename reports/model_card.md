# Model card

## Intended use

One-week product demand forecasting for this historical retailer dataset. Predictions are decision-support estimates, not measured future outcomes.

## Data and evaluation

The global LightGBM Poisson model is trained using the chronological training period, uses the following validation period for early stopping, and is evaluated once on the held-out test period:

- Train: 2009-12-07 through 2011-06-05
- Validation: 2011-06-06 through 2011-09-04
- Test: 2011-09-05 through 2011-11-27

The model features are configured in `configs/pipeline.yaml`; they are calendar and lagged-demand fields only. Test results:

| Model | WAPE | MAE | Bias |
|---|---:|---:|---:|
| lightgbm | 0.6797 | 33.5916 | -1.6123 |
| seasonal_naive | 0.9591 | 47.3972 | 9.3923 |
| moving_average_4 | 0.6457 | 31.9104 | -5.1386 |
| moving_average_13 | 0.6515 | 32.1952 | -9.6642 |

The LightGBM model does not beat the best baseline by WAPE (moving_average_4). No prediction-interval coverage is reported because this run does not fit a quantile model. Global feature attributions are exported to `reports/global_shap_importance.csv` using LightGBM's TreeSHAP contributions; they describe model behaviour, not causality.

## Limitations

The model uses one-week holdout predictions and does not claim a completed 4-week rolling-origin evaluation. The pricing output is conservative: every product is held because this build does not produce a validated fixed-effects elasticity estimate with uncertainty bounds. The underlying demand proxy cannot distinguish zero demand from stock unavailability. Performance represents a mostly wholesale giftware retailer in 2009–2011 and should not be generalized without further evaluation.
