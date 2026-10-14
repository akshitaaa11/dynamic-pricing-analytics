# Final project report

## Summary
This project implements a Spark-based dynamic pricing analytics workflow for the UCI Online Retail II dataset. It follows the phase plan in README §16, keeps thresholds and dates in `configs/pipeline.yaml`, and uses only observed data plus documented proxies.

## Phase 8 status

The Phase 8 exit check (`make all` from the documented raw/silver input) has **not passed yet**. What changed in this revision:

- **Root-cause fix:** `src/dpa/models/` (baselines, evaluate, forecast) was never committed because the `models/` rule in `.gitignore` matched it. A fresh checkout therefore could not import `dpa.pipeline`. The rule is now root-anchored (`/models/`) and the package is committed.
- New tests cover the baselines, metrics, and an end-to-end model training/evaluation run on synthetic data.
- **Not done:** the end-to-end rebuild on the real dataset. `data/silver/transactions_clean.parquet` and `data/raw/online_retail_II.xlsx` are not in the repository, and the UCI download host was blocked from the build sandbox. Six data-dependent tests (phases 1-3) fail only for that reason; the other 13 tests pass. No metrics are reported here because none were computed from real data.

To finish: place the workbook at `data/raw/online_retail_II.xlsx` (or the cleaned silver Parquet), then run `make all`. That regenerates the gold tables, forecast metrics, pricing holds, figures and the data/model cards, and overwrites this report with computed values.

## Data constraints respected
- No invented inventory, competitor, promotion, or cost data
- No hard-coded totals in code or dashboard output
- Use of only the documented proxies described by the README
- Strict time-based split with no leakage from the target week or later

## Validation
`python -m pytest -q` without the dataset: 13 passed, 6 failed (missing data files). This does not substitute for the end-to-end rebuild.

## Deliverables
- `README.md`: project specification and build order
- `configs/pipeline.yaml`: configuration for thresholds, dates, and guardrails
- `src/dpa`: Spark ETL, feature engineering, modeling, pricing, and streaming code
- `dashboard/app.py`: Streamlit dashboard
- `reports/data_card.md`: dataset description and limitations
- `reports/model_card.md`: forecasting model summary
- `CHANGELOG.md`: phase-by-phase progress log
