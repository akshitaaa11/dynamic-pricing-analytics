# Changelog

## Phase 0 — 2026-10-14
- Built the project skeleton: pinned requirements, Makefile, pipeline config, .gitignore, Spark helper, logging helper, and the required directory structure per README §5.
- Added placeholder modules for each project stage and a smoke test suite to confirm the repository layout and importability.
- Exit-check result (real data, 1,033,062-row silver table): `python -m pytest -q` passed 18/18; `python -m dpa.pipeline` ran end to end and regenerated the gold panel/features, forecast predictions and model, pricing holds, figures, metrics/SHAP CSVs and the data/model/final reports from computed values. Row/unit/revenue reconciliation matches the config contract.
- Forecast result (test weeks 2011-09-05 to 2011-11-27, WAPE): LightGBM 0.680, moving_average_4 0.646, moving_average_13 0.651, seasonal_naive 0.959. The model does **not** beat the best baseline; the model card says so.
- Fixed `.gitignore` (`models/` -> `/models/`) so `src/dpa/models/` is tracked.
- Remaining deviations from README: one-week holdout rather than four-week rolling-origin evaluation, no 80% prediction intervals, and pricing emits explicit hold decisions because fixed-effects elasticity is not wired into the pipeline.
