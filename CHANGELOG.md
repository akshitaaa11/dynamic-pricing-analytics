# Changelog

## Phase 0 — 2026-10-14
- Built the project skeleton: pinned requirements, Makefile, pipeline config, .gitignore, Spark helper, logging helper, and the required directory structure per README §5.
- Added placeholder modules for each project stage and a smoke test suite to confirm the repository layout and importability.
- Exit-check result: `python -c "import pyspark"` succeeded, and the equivalent test target `python -m pytest -q` passed with 2 tests passing.
- Deviation from README: the Windows environment here does not provide a `make` binary, so the same test target was executed through `pytest` rather than `make test`. The `Makefile` target is still present for the project specification and will run once GNU Make is available.

## Phase 1 — 2026-10-14
- Loaded the validated silver dataset from `data/silver/transactions_clean.parquet`, added schema and reconciliation checks, and documented the config-driven path handling.
- Added `src/dpa/etl/validate.py` to validate the dataset contract and calculate the exact reconciliation totals expected by README §12.
- Exit-check result: `python -m pytest -q` passed with 4 tests passing; the silver dataset matched the expected row count, sale rows, gross units, gross revenue, and cancellation value.
- Deviation from README: negative `Quantity` values are allowed only for cancellation invoices (`C...`), matching the real return-pattern in the dataset. This preserves the contract described in the README while keeping cancellation rows valid.

## Phase 2 — 2026-10-14
- Implemented the demand-definition logic in `src/dpa/etl/aggregate.py`, including cancellation matching, immediate-cancel flags, spike capping, zero-filled product-week panels, and an availability proxy that labels possible stockouts.
- Added targeted tests for the product-week panel shape and null-contract checks.
- Exit-check result: `python -m pytest -q tests/test_phase2_demand_definition.py` passed with 2 tests passing.
- Deviation from README: the project uses the configured `max_order_cap_units` guardrail and a pragmatic one-day cancellation match window for the live dataset. This keeps the demand series consistent without inventing data.

## Phase 3 — 2026-10-14
- Added the feature-engineering layer in `src/dpa/features/build.py`, including calendar features, demand lags, rolling statistics, list-price and markdown proxies, and availability/in-training flags.
- Added Phase 3 validation tests in `tests/test_phase3_feature_engineering.py` covering required columns and the no-leakage rule for target-week information.
- Exit-check result: `python -m pytest -q tests/test_phase3_feature_engineering.py` passed with 2 tests passing after installing Java 17 and setting `JAVA_HOME` for Spark.
- Deviation from README: this implementation keeps the feature stage strictly data-driven and config-backed, without making up missing external drivers such as competitor pricing or stock levels; unavailable factors are left as missing/undefined rather than synthetic values.

## Phase 4 — 2026-10-14
- Implemented the baseline forecasting utilities in `src/dpa/models/baselines.py`: seasonal-naive and trailing moving-average forecasts, plus a helper that combines them into a baseline comparison table and selects the best baseline by WAPE.
- Added `tests/test_phase4_baselines.py` to validate the expected columns, numeric outputs, and fallback behaviour when a product has too little history for a true seasonal prior-year lookup.
- Exit-check result: `python -m pytest -q tests/test_phase4_baselines.py` passed with 2 tests passing.
- Deviation from README: the seasonal-naive fallback uses the most recent available prior value when a full prior-year observation is unavailable, which keeps the baseline numeric without inventing any data.

## Phase 5 — 2026-10-14
- Implemented the elasticity and pricing logic in `src/dpa/analysis/elasticity.py` and `src/dpa/pricing/recommend.py`, using the README’s fixed-effects log-log structure, a pooled-to-product shrinkage estimate, and config-driven guardrails for recommended price changes.
- Added `tests/test_phase5_pricing.py` to validate the elasticity output contract and the guardrail behaviour for hold/no-change recommendations.
- Exit-check result: `python -m pytest -q tests/test_phase5_pricing.py` passed with 2 tests passing.
- Deviation from README: SciPy was upgraded to `1.13.1` to resolve an incompatibility with the pinned `statsmodels==0.14.4` dependency; this keeps the stack consistent and reproducible without changing the project design.

## Phase 6 — 2026-10-14
- Implemented the dashboard scaffold at `dashboard/app.py`, including features to load the product-week table, compute KPI cards, show a weekly trend, and plot price-vs-demand charts using Streamlit + Plotly.
- Added `tests/test_phase6_dashboard.py` to confirm the dashboard module imports cleanly and exposes the expected helper functions.
- Exit-check result: `python -m pytest -q tests/test_phase6_dashboard.py` passed with 1 test passing.
- Deviation from README: the dashboard remains a lightweight Streamlit scaffold rather than a full multi-page production app, because the README’s later phases for data and reporting are still to be implemented; the current version intentionally uses the feature dataset directly and keeps the design constrained to observed data and documented proxies.

## Phase 7 — 2026-10-14
- Implemented the replay producer in `src/dpa/streaming/replay.py` and the file-based structured streaming aggregation in `src/dpa/streaming/stream_job.py`.
- The replay job writes JSON event files in time order, and the stream job aggregates hourly/daily/weekly demand windows per product from those replay files.
- Added `tests/test_phase7_streaming.py` to validate event-file creation and window aggregation behaviour.
- Exit-check result: `python -m pytest -q tests/test_phase7_streaming.py` passed with 2 tests passing, and the full project suite also passed with 15 tests passing (`python -m pytest -q`).
- Deviation from README: the demo uses a historical replay file source instead of Kafka to keep the project runnable on a laptop without extra infrastructure. The stream remains intentionally lightweight and is labelled as a replay of historical data, per the README’s design.

## Phase 8 — 2026-10-14
- Added a reproducible build entry point, Spark-to-local-Parquet output helper for Windows, native LightGBM evaluation, hold-only pricing output when validated elasticity is unavailable, generated report/figure code, and Phase 8 packaging tests.
- Exit-check result: `python -m pytest -q` passed with 17 tests. The end-to-end rebuild generated the panel and feature Parquet outputs, but it was stopped during model training at the user's request. Forecast predictions, pricing outputs, report figures/cards from computed results, and the fresh-rebuild exit check are not verified.
- Deviation from README: the current model build evaluates one-week holdout predictions and does not implement the requested four-week rolling-origin evaluation or 80% prediction intervals. The pricing build emits explicit hold decisions because validated fixed-effects elasticity estimates are not wired into the end-to-end pipeline. Phase 8 is therefore in progress, not passed.
- Fixed `.gitignore` (`models/` -> `/models/`) so `src/dpa/models/` (baselines, evaluate, forecast) is actually tracked; added a model training test. The real-data rebuild is still pending because the dataset is unavailable in the build environment.
