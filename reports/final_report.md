# Final project report

## Summary
This project implements a Spark-based dynamic pricing analytics workflow for the UCI Online Retail II dataset. It follows the phase plan in README §16, keeps thresholds and dates in `configs/pipeline.yaml`, and uses only observed data plus documented proxies.

## Phase 8 status

The packaging/rebuild work is in progress. The complete test suite passed with 17 tests. The end-to-end rebuild generated product-week and feature Parquet outputs, then was stopped before model training and report generation completed. Therefore the Phase 8 clean-rebuild exit check has **not passed**, and this report does not claim that all outputs were reproduced.

Run `make all` to continue the build and generate the model evaluation, pricing output, figures, and computed report cards.

## Data constraints respected
- No invented inventory, competitor, promotion, or cost data
- No hard-coded totals in code or dashboard output
- Use of only the documented proxies described by the README
- Strict time-based split with no leakage from the target week or later

## Validation
The test command `python -m pytest -q` passed: 17 tests passed. This verifies the automated tests, but does not substitute for the incomplete end-to-end rebuild.

## Deliverables
- `README.md`: project specification and build order
- `configs/pipeline.yaml`: configuration for thresholds, dates, and guardrails
- `src/dpa`: Spark ETL, feature engineering, modeling, pricing, and streaming code
- `dashboard/app.py`: Streamlit dashboard
- `reports/data_card.md`: dataset description and limitations
- `reports/model_card.md`: forecasting model summary
- `CHANGELOG.md`: phase-by-phase progress log
