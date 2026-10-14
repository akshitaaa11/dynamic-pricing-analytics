# Model card

## Objective

The intended model forecasts weekly product demand for the historical retailer dataset. Its output is for analysis and decision support, not a measured future outcome.

## Target and data

The target is units in the Spark-built product-week panel. The availability indicator is a **proxy** from observed sales gaps, not inventory data. Competitor prices, promotion labels, and costs are unavailable.

## Evaluation status

The project defines a chronological train/validation/test split in `configs/pipeline.yaml` and includes seasonal-naive and moving-average baselines. A LightGBM comparison and global feature-attribution export are implemented in the rebuild pipeline.

**The end-to-end rebuild was stopped before model training completed. No test-set WAPE, MAE, bias, rolling-origin backtest, interval coverage, or SHAP result is reported in this card.** Run `make all` to generate those measurements and replace this status with the computed results.

## Limitations

The project has not completed a four-week rolling-origin evaluation or quantified prediction-interval coverage. The dataset describes a mostly wholesale giftware retailer in 2009–2011; results should not be generalized without further evaluation. Price variation is observational, not randomized.
