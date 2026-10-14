# Dynamic Pricing Analytics for an Online Retailer

A Big Data Analytics (BDA) project. It takes **real retail transaction data**, cleans and aggregates it with **Apache Spark (PySpark)**, studies what drives demand, **forecasts weekly product demand** with machine learning, and turns the forecast into **explainable price recommendations** shown on a dashboard. A Spark **Structured Streaming** job replays sales as live events, updating demand metrics and flagging products whose prices should be reviewed.

> **Ground rule for this project:** every number on the dashboard comes either from the real dataset, from a documented public source, or from a model whose accuracy we measured. We never invent inventory, competitor, cost or promotion values. Factors we don't have are shown as "not available", never filled in with made-up values.

---

## Table of contents

1. [What the system does](#1-what-the-system-does)
2. [The dataset (what we actually have)](#2-the-dataset-what-we-actually-have)
3. [Factors we do not have, and how we handle them](#3-factors-we-do-not-have-and-how-we-handle-them)
4. [Architecture](#4-architecture)
5. [Repository layout](#5-repository-layout)
6. [Pipeline, stage by stage](#6-pipeline-stage-by-stage)
7. [Demand forecasting model](#7-demand-forecasting-model)
8. [Pricing method](#8-pricing-method)
9. [Real-time component](#9-real-time-component)
10. [Dashboard](#10-dashboard)
11. [Setup and running](#11-setup-and-running)
12. [Testing and validation](#12-testing-and-validation)
13. [Limitations](#13-limitations)
14. [Why we rebuilt from scratch (problems in v1)](#14-why-we-rebuilt-from-scratch-problems-in-v1)
15. [Team work split](#15-team-work-split)
16. [Build phases](#16-build-phases)
17. [Sources](#17-sources)

---

## 1. What the system does

| # | Deliverable | What "done" looks like |
|---|-------------|------------------------|
| 1 | **Processed dataset** | Spark-cleaned Parquet tables (transaction → product-week → features) built from the raw source by a script anyone can re-run. Every exclusion is logged with a reason, and totals reconcile to the reference figures in §12. |
| 2 | **Demand analysis** | Seasonality, product popularity, customer segments, country mix, and how much demand changes when price changes, with evidence attached to each finding. |
| 3 | **Demand forecast** | A global ML model that predicts next-week (and 4-week) unit demand per product. Evaluated on held-out future weeks and compared with simple baselines. |
| 4 | **Price recommendation** | A defined, reproducible method: forecast + estimated price elasticity + guardrails, giving a recommended price, a reason, and a confidence level for each product. |
| 5 | **Dashboard** | Sales trends, forecast vs actual, recommended vs current price, *why* each price is recommended, model accuracy, and a data-limitations page. |
| 6 | **Big Data processing** | PySpark for all cleaning, aggregation and feature work, Spark MLlib/pandas-on-Spark for modelling at scale, and Spark Structured Streaming for the real-time demo. |

Example of what one product card on the dashboard should show (layout only; these are **not** real outputs):

```
WHITE HANGING HEART T-LIGHT HOLDER (85123A)
Current price  £2.95     Forecast next 4 weeks  ~ N units (80% interval a–b)
Suggested      £X.XX     Demand trend  Rising / Stable / Falling
Why: forecast above 12-week average; elasticity −1.4 (CI −2.0 to −0.8);
     change capped at ±10% and kept inside the historically observed price range.
Confidence: Medium (34 weeks of price variation, forecast WAPE 38% for this product group)
```

---

## 2. The dataset (what we actually have)

**Source:** [UCI Machine Learning Repository: Online Retail II](https://archive.ics.uci.edu/dataset/502/online+retail+ii) (`online_retail_II.xlsx`, two sheets: *Year 2009-2010* and *Year 2010-2011*). It records every transaction of a **UK-based, non-store online retailer** that mainly sells **all-occasion giftware**. **Many of its customers are wholesalers.** That last fact shapes the whole project (see §8).

The team's earlier cleaning work produced `Dynamic_Pricing_Processed_Data final.xlsx`. In v2 we **do not use it as the pipeline input**. We keep it under `data/reference/` only to check that our Spark cleaning reproduces the same totals.

### Profile (measured from the processed workbook)

| Item | Value |
|------|-------|
| Raw rows (both sheets) | 1,067,371 |
| Cross-sheet duplicate rows (2010-12-01 → 2010-12-09 overlap) | 22,523, removed |
| Non-merchandise lines (POST, DOT, M, fees, vouchers, tests, bad debt …) | 5,815, excluded |
| Zero-price lines | 5,971, excluded |
| **Clean rows** | **1,033,062** (1,015,088 sales + 17,974 cancellations) |
| Period | 2009-12-01 → 2011-12-09 (**104 weeks**, last week partial) |
| Products (Stock_Code) | 4,739 |
| Identified customers | 5,852 (~22% of rows have no Customer ID) |
| Countries | 43 (UK = 85.6% of revenue) |
| Gross sales | 11,221,957 units · £19,700,954.44 |
| Cancellations | −£719,692.94 |

### Things in the data that change how we model it

- **Strong Q4 seasonality.** Monthly sales rise from about £0.5–0.7M in Jan–Aug to about **£1.44M (Nov 2010) and £1.46M (Nov 2011)**. A model without seasonality will fail.
- **Revenue is highly concentrated.** The top 20% of products produce **78.1%** of revenue.
- **Many products have short histories.** Only 1,647 products sold in ≥52 of the 104 weeks. 664 products sold in fewer than 8 weeks.
- **Price depends on order size.** For 85123A, lines at £2.95 have a median quantity of 6, while lines at £2.55 have a median of 32. Lines without a Customer ID have median quantity **1** and median price **£3.29**. Lines with a Customer ID have median quantity **5** and median price **£1.95**. The low price is *caused by* the large order, so a naive price-vs-quantity regression measures volume discounts, not customer price sensitivity.
- **Huge orders that were cancelled.** 80,995 × "PAPER CRAFT, LITTLE BIRDIE" (invoice 581483) was cancelled 12 minutes later (C581484). 74,215 × "MEDIUM CERAMIC TOP STORAGE JAR" (541431) was cancelled 16 minutes later (C541433). If demand is measured as gross sales, these orders count as real demand.
- **Weeks with no sales are not recorded.** The weekly table only has rows for weeks with a sale, and the data cannot tell "zero demand" apart from "out of stock".
- **Currency is GBP (£).** We report in £. If INR is ever shown, it is a labelled conversion at a documented historical exchange rate, never a relabelling.

---

## 3. Factors we do not have, and how we handle them

| Factor | In the data? | What we do | What we will **not** do |
|--------|--------------|------------|-------------------------|
| **Inventory / stock levels** | ❌ | Build an *availability proxy* from real sales gaps: a product that sells most weeks and then has a run of zero-sale weeks is flagged "possibly unavailable", and those weeks are excluded from training. Shown on the dashboard as a proxy. | Invent stock levels, reorder points or stockout dates. |
| **Competitor prices** | ❌ | No genuine competitor history exists for this retailer's products in 2009–2011. The dashboard says "not available". **Optional extension:** the real [Olist Brazilian e-commerce dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) has several sellers selling the *same* product, so a separate case study can measure the effect of competitor price there. It is never merged into the UK data. | Scrape today's prices and attach them to 2010 products, or generate "competitor" columns. |
| **Promotions** | ❌ | Detect **observed price reductions** from real prices (a product's small-order price drops ≥10% below its 8-week median) and label them "observed markdown", not "promotion". | Call any price drop a promotion, or invent campaign calendars. |
| **Cost / margin** | ❌ | Optimise **revenue**, not profit. The dashboard has an optional *what-if* box where a user can type an assumed margin %. It is clearly marked as a user assumption and never stored as data. | Present profit as measured. |
| **Customer behaviour** | ✅ partial | Real RFM features (recency, frequency, monetary value) and segments (wholesale-like vs retail-like by order size), computed from identified customers only. | Impute missing Customer IDs. |
| **Seasonality / holidays** | ✅ derivable | Week of year, weeks to Christmas, and UK bank holidays from the [`holidays`](https://pypi.org/project/holidays/) Python package (rule-based official calendar). | |
| **Market conditions** | ✅ external | *Optional:* the UK [ONS Retail Sales Index (DRSI)](https://db.nomics.world/ONS/DRSI) monthly non-store retail series as a market-level control. The file and its download date are saved in `data/external/`. | |

Every external file has an entry in `data/external/SOURCES.md` with its URL, download date and licence.

---

## 4. Architecture

```
                 ┌──────────────────────────── BATCH (PySpark) ───────────────────────────┐
 online_retail_II.xlsx ─► ingest ─► BRONZE ─► clean ─► SILVER ─► aggregate/features ─► GOLD
  (UCI, raw)            (xlsx→     (raw rows,  (rules,   (clean     (product-week panel,   (features,
                         Parquet)   untouched)  log of    lines)     calendar, RFM,         forecasts,
 external/ (holidays, ONS) ───────────────────────────────────────►  availability proxy)   elasticities,
                                                                                            prices)
                                                    ┌───────────────┐                        │
                                                    │ models/       │◄──── train/backtest ───┤
                                                    │ forecast,     │───── predictions ─────►│
                                                    │ elasticity    │                        │
                                                    └───────────────┘                        ▼
 ┌──────────── STREAMING (Spark Structured Streaming) ─────────────┐               ┌──────────────┐
 │ replay producer ─► events/ (JSON files or Kafka) ─► stream job   │──► gold/live ─►│  Dashboard   │
 │ (2011 Q4 sales, time-compressed)   windowed demand, drift alerts │               │ (Streamlit)  │
 └──────────────────────────────────────────────────────────────────┘               └──────────────┘
```

- **Storage:** Parquet in a bronze → silver → gold layout, partitioned by year and week. The dashboard **never reads Excel**.
- **Compute:** PySpark 3.5 (local mode is enough for 1M rows, and the same code runs on a cluster).
- **Modelling:** LightGBM (or Spark MLlib `GBTRegressor`) for demand, `statsmodels` for elasticity panel regressions.
- **Dashboard:** Streamlit + Plotly, reading gold Parquet tables.

### Generated evidence

The reproducible build writes Plotly figures from the gold feature table. Each figure includes its source table and configured date range:

- [Monthly observed demand](reports/figures/monthly_demand.html)
- [Weekly observed demand](reports/figures/weekly_demand.html)

---

## 5. Repository layout

```
dynamic-pricing-analytics/
├── README.md
├── requirements.txt            # pinned versions
├── Makefile                    # make ingest | etl | features | train | price | stream | dashboard | test
├── configs/
│   └── pipeline.yaml           # paths, split dates, guardrails, thresholds (no magic numbers in code)
├── data/                       # everything except external/ and SOURCES.md is git-ignored
│   ├── raw/                    # online_retail_II.xlsx (download, do not edit)
│   ├── reference/              # old processed workbook, used only for reconciliation tests
│   ├── external/               # holidays, ONS series + SOURCES.md
│   ├── bronze/  silver/  gold/
│   └── stream/                 # replayed event files + checkpoints
├── src/dpa/
│   ├── ingest/xlsx_to_parquet.py
│   ├── etl/clean.py            # Spark cleaning rules + rejected-records log
│   ├── etl/aggregate.py        # product-day / product-week panels
│   ├── features/build.py       # lags, rolling stats, calendar, price, RFM, availability proxy
│   ├── analysis/eda.py         # tables and figures for the report
│   ├── analysis/elasticity.py  # fixed-effects log-log panel + per-product shrinkage
│   ├── models/baselines.py     # seasonal naive, moving average
│   ├── models/forecast.py      # global GBM model
│   ├── models/evaluate.py      # rolling-origin backtest, WAPE/MAE/bias
│   ├── pricing/recommend.py    # pricing method + explanation text
│   ├── streaming/replay.py     # turns historical rows into timed events
│   └── streaming/stream_job.py # Structured Streaming aggregation + alerts
├── dashboard/app.py (+ pages/)
├── notebooks/                  # exploration only; final logic lives in src/
├── reports/                    # figures, data_card.md, model_card.md, final report
└── tests/
```

---

## 6. Pipeline, stage by stage

### 6.1 Ingest (`make ingest`)
**Starting file:** `data/silver/transactions_clean.parquet` (9 MB, zstd). It holds the cleaned transaction rows and is the preferred input for the reproducible rebuild. Data files are excluded from source control, so place this file in `data/silver/` before running `make all`, or provide the raw workbook at `data/raw/online_retail_II.xlsx` and run the ingest/clean steps.

Spark cannot read `.xlsx` directly. A short script converts both sheets to Parquet with `python-calamine` (about 1 minute), adding `source_sheet` and `source_row` so any row can be traced back to the original file. No values are changed. Cleaning, aggregation, and feature transformations run in Spark; local Parquet output is written through PyArrow so Windows users do not need Hadoop `winutils.exe`.

### 6.2 Clean (`make etl`), all in PySpark
Same rules as the reference workbook, so the results can be checked against it:

1. Trim and upper-case `StockCode`, trim text, parse timestamps.
2. Remove the 22,523 cross-sheet duplicates (identical rows in the 2010-12-01 → 12-09 overlap).
3. Exclude non-merchandise codes (POST, DOT, M, D, S, C2, C3, B, ADJUST*, AMAZONFEE, BANK CHARGES, CRUK, TEST*, GIFT*, DCGS0067/73).
4. Exclude zero or negative prices.
5. Keep cancellations (`C…` invoices) as returns. **New in v2:** match each cancellation to its original sale (same customer, product and quantity, within 1 day) and flag both lines as `immediately_cancelled`. These lines are taken out of demand. This removes the 80,995- and 74,215-unit orders above.
6. Flag (don't delete) exact repeated lines within one invoice (11,790).
7. Write every excluded row to `silver/rejected/` with a reason.

### 6.3 Aggregate and features (`make features`)
- **Product-week panel:** for each product, from its first to its last sale week, **fill missing weeks with 0** and set `zero_filled = 1`. Weeks flagged by the availability proxy are kept but marked `possibly_unavailable` and excluded from training. Sensitivity check: we retrain without zero-filling and report the difference.
- **Demand target:** `units = sale qty − immediately cancelled qty`. We also cap single-order spikes at the product's 99.5th-percentile line quantity and report how many lines were capped.
- **Price features:** the *small-order list price* (modal unit price on lines with qty ≤ 12), its change vs the product's 8- and 26-week median, the week's price spread, and an observed-markdown flag.
- **Calendar:** ISO week, month, weeks to Christmas, UK bank-holiday week, partial-week flag.
- **History:** demand lags 1, 2, 4 and 52, rolling mean and std over 4, 8 and 13 weeks, weeks since launch, number of buyers and invoices (lagged), share of quantity bought by wholesale-like customers.
- **Customer:** RFM per identified customer, and segment (wholesale-like / retail-like) by median order size.

---

## 7. Demand forecasting model

**Target:** units per product per week (1-week and 4-week horizons).
**Scope:** products with ≥26 active weeks (2,810 products) get individual forecasts. The rest get a "low history" label and fall back to a baseline.

**Time-based split (no shuffling, no leakage):**

| Set | Weeks |
|-----|-------|
| Train | 2009-12-07 → 2011-06-05 |
| Validation (tuning) | 2011-06-06 → 2011-09-04 |
| Test (touched once) | 2011-09-05 → 2011-11-27, *includes the Q4 peak* |
| Dropped | 2009-11-30 and 2011-12-05 (partial weeks) |

We also run a **rolling-origin backtest**: the model is re-trained every 4 weeks across the test period, and each time it predicts the next 1–4 weeks.

**Models compared (the ML model only wins if it beats the baselines):**
1. Seasonal naive (same week last year)
2. 4- and 13-week moving average
3. **Global LightGBM / MLlib GBT** on the features in §6.3 (Tweedie or Poisson loss, because demand is non-negative and has many zeros)

**Metrics:** WAPE (main), MAE, bias, and the coverage of the 80% prediction interval (from quantile models). We report them overall, by demand tier (high / medium / low volume), and for the Nov 2011 peak. The results go to `reports/model_card.md` and to the dashboard's *Model accuracy* page.

**Explainability:** SHAP values for the forecast model, at both global and per-product level.

---

## 8. Pricing method

Price recommendations are calculated by a fixed, documented method. There are no hard-coded "+7%/−8%" rules.

**Step 1: Estimate price elasticity (how much demand changes when price changes).**
- Use the **small-order list price**, not the weekly average price. The average price mixes volume discounts with real price changes (see §2).
- Fit a pooled log-log panel regression `log(units) ~ log(list price) + product fixed effects + week fixed effects + controls`. The week effects absorb seasonality and overall trend.
- Estimate per-product elasticities and **shrink** them toward the pooled value (empirical Bayes). Products with little price variation then borrow strength from the group instead of producing wild estimates.
- An elasticity counts as *identified* only if the product had ≥3 distinct list prices over ≥8 weeks and the 90% CI is entirely below 0. Otherwise the product gets **"Hold price: elasticity not identified."**

**Step 2: Search for a better price.** For each candidate price `p` within guardrails:

```
expected_units(p) = forecast_units(current price) × (p / current price) ^ elasticity
expected_revenue(p) = p × expected_units(p)
```

**Guardrails** (set in `configs/pipeline.yaml`):
- Change is limited to **±10%** per review cycle.
- Price stays **inside the product's historically observed list-price range**, so the model never extrapolates beyond prices it has seen.
- Prices are rounded to the retailer's own price endings (e.g. £x.45, £x.95, £x.65).
- No increase when the product's demand is falling, and no decrease while it is flagged "possibly unavailable".

**Step 3: Explain.** Every recommendation carries the forecast, the elasticity with its CI, which guardrail was binding, the expected revenue change with an uncertainty range, and a confidence label (High / Medium / Low) based on history length, elasticity CI width and the product group's forecast error.

**Step 4: Evaluate the method with the data we have.** We can't run a live price test, so we:
- check whether the elasticity model predicts demand after **real historical price changes** in the test period (held-out price changes);
- report how many products get a recommendation vs "hold", and the size of the changes;
- state plainly that the revenue gain is an *estimate under the model*, not a measured result.

---

## 9. Real-time component

What the demo shows: *"if sales arrived live, metrics and pricing alerts would update by themselves."*

1. `streaming/replay.py` reads the **real** Sep–Dec 2011 transactions in time order and writes them as small JSON event files (or Kafka messages) into `data/stream/in/`, compressing time (e.g. 1 real day = 10 seconds). The events are labelled as a **replay of historical data**.
2. `streaming/stream_job.py` (Spark Structured Streaming):
   - keeps 1-hour, 1-day and 7-day tumbling-window demand per product (with watermarking);
   - compares running demand with the batch forecast and raises an alert when actual demand is outside the 80% interval;
   - for products with an alert, re-runs the pricing function and writes the result to `gold/live/`.
3. The dashboard's *Live* page refreshes every few seconds from `gold/live/`.

Kafka is optional. The file-source version needs no extra services, so it works on any laptop.

---

## 10. Dashboard

Streamlit app with these pages:

| Page | Contents |
|------|----------|
| **Overview** | KPI cards (revenue, units, active products, return rate) for the selected period vs the same period a year earlier; weekly revenue trend; top products. |
| **Demand analysis** | Seasonality by month and week, country mix, customer segments, top risers and fallers (with zero-filled weeks counted correctly), price vs demand **using list price**. |
| **Forecasts** | Product picker; history + forecast + 80% interval; actual vs predicted in the test period; SHAP drivers. |
| **Pricing** | Recommendation table (current, suggested, % change, confidence, reason); per-product explanation panel; what-if simulator that uses the product's elasticity and refuses prices outside the observed range. |
| **Model accuracy** | Baseline vs model WAPE/MAE/bias, error by demand tier, backtest chart. |
| **Live** | Streaming metrics and alerts. |
| **Data & limitations** | Row reconciliation, exclusions by reason, missing factors (§3), external sources. |

Every chart says which table it comes from and which date range it shows.

---

## 11. Setup and running

**Requirements:** Python 3.11, Java 17 (for Spark), about 4 GB free RAM.

```bash
git clone <repo-url> && cd dynamic-pricing-analytics
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 1. Put the raw file in place (download from UCI, see §16)
#    data/raw/online_retail_II.xlsx
# 2. (optional) put the old workbook in data/reference/ for reconciliation tests

make ingest      # xlsx → bronze Parquet
make etl         # clean → silver (+ rejected log)
make features    # panels + features → gold
make train       # baselines + model + backtest → reports/model_card.md
make price       # elasticities + recommendations → gold/pricing
make dashboard   # streamlit run dashboard/app.py
make all         # tests + gold rebuild + model evaluation + reports

# real-time demo (two terminals)
make stream      # starts the Structured Streaming job
make replay      # starts replaying Sep–Dec 2011 events
```

Without `make`, each target is a plain `python -m dpa.<module>` command; see the `Makefile`.

The batch rebuild starts from the cleaned silver Parquet when it exists. If it does not, it can create silver from the configured raw workbook. `make all` rebuilds the product-week panel, feature table, test forecasts, pricing holds/recommendations, and report figures/cards. The dashboard is started separately and reads the generated gold Parquet; it does not rebuild or read Excel at request time.

**Do not commit** `data/` (except `external/`), `.venv/`, `node_modules/`, model binaries or build output. They are in `.gitignore`.

---

## 12. Testing and validation

`make test` runs:

- **Reconciliation:** clean row count = **1,033,062**, sale lines = 1,015,088, gross units = **11,221,957**, gross revenue = **£19,700,954.44**, cancellation value = −£719,692.94, matching the reference workbook. (The v2 demand target is smaller on purpose because immediately cancelled orders are removed. That difference is reported, not hidden.)
- **Data contracts:** no null keys, no negative prices, `units ≥ 0`, one row per product-week.
- **Leakage check:** no feature uses information from the target week or later.
- **Pricing rules:** recommendations never break a guardrail; products without an identified elasticity always get "hold".
- **Determinism:** fixed random seeds; re-running the pipeline gives identical gold tables.

---

## 13. Limitations

- The data is **2009–2011** and from a **mostly wholesale giftware** business. Results describe this retailer, not online retail in general.
- Elasticities are **observational**: price changes were not randomised, so estimates can still be biased by unrecorded factors (stock, marketing, customer mix).
- No cost data → we optimise revenue, not profit.
- No inventory data → zero-sale weeks are uncertain. We use a proxy and a sensitivity check.
- No competitor or promotion data for this retailer. These factors are shown as unavailable.
- The streaming demo replays historical events. It is not connected to a live shop.

---

## 14. Why we rebuilt from scratch (problems in v1)

| Area | Problem in v1 | Why it matters | v2 fix |
|------|---------------|----------------|--------|
| Big Data | **No Spark anywhere.** pandas read a 211 MB Excel file inside the web server. | Fails deliverable #6. First request took minutes. | PySpark pipeline + Parquet; dashboard reads gold tables. |
| ML | **No machine-learning model.** "Forecast" was a straight line fitted to the last 24 weeks. `scikit-learn` was listed but never used. | Fails deliverable #3; a straight line can't model the Q4 peak. | Global GBM with lags, seasonality, price and calendar features, compared with baselines. |
| Evaluation | The "hold-out" MAE was computed on the **last 8 weeks that were also used to fit the line** (in-sample). | Reported accuracy was not real. | Strict time split + rolling-origin backtest. |
| Pricing | Fixed rules: rising → **+7%**, falling → **−8%**, stable → 0. Elasticity only halved the change. | Not a pricing method. The demand response to price was ignored. | Elasticity-based revenue search with guardrails and confidence. |
| Elasticity | Regressed weekly **average** price on quantity. That price falls *because* big orders get volume discounts. | Measured discount tiers, not customer price sensitivity. | Small-order list price, fixed effects, shrinkage, CI requirement. |
| Revenue impact | Estimated with **quantity held constant**, so every price increase looked like pure gain. | Systematically misleading. | Uses elasticity-adjusted demand with an uncertainty range. |
| Demand definition | Gross sales included orders cancelled minutes later (80,995 and 74,215 units). Missing weeks were not zero-filled, so "average weekly demand" was inflated. | Wrong trends, risers/fallers and forecasts. | Cancellation matching, spike capping, zero-filled lifecycle panel with availability proxy. |
| Metrics | Customer counts were summed across weeks (the same customer counted many times). Seasonal insight averaged product-weeks instead of totalling months. Return rate missed returns in weeks without sales. Data-quality totals were **hard-coded numbers**. | KPIs on the dashboard were wrong or unverifiable. | All metrics computed from silver/gold tables and covered by tests. |
| "Supply / Inventory" page | A whole page about inventory, with no inventory data. | Implies a capability we don't have. | Removed. Availability proxy shown honestly, labelled as a proxy. |
| Performance | The pricing endpoint looped over ~4,700 products and filtered the full table for each one, on every request. | Slow; unusable with date filters. | Pre-computed in Spark. |
| Reproducibility | The processed workbook was produced by a script that isn't in the repo. The zip shipped `node_modules/` and `dist/` (~218 MB). Dependencies weren't pinned. API URL hard-coded to `localhost:8000`; CORS allowed everything with credentials. | Nobody else can rebuild or trust the outputs. | Raw → gold in code, pinned requirements, config file, `.gitignore`. |

---

## 15. Team work split

Suggested split for 4 people (adjust to team size):

| Member | Owns |
|--------|------|
| A | Ingest + Spark cleaning + reconciliation tests (§6.1–6.2, §12) |
| B | Features + EDA + elasticity analysis (§6.3, §8 step 1, analysis section of report) |
| C | Forecast models + backtest + model card (§7) |
| D | Pricing engine + streaming + dashboard (§8 steps 2–4, §9, §10) |

Milestones follow the build phases in §16.

---

## 16. Build phases

Build in this order. Each phase ends with its **exit check** passing and a short entry in `CHANGELOG.md`. Don't start a phase until the previous one passes.

| Phase | Goal | Builds | Exit check |
|-------|------|--------|------------|
| **0. Skeleton** | Repo ready to work in | Folder layout (§5), `requirements.txt` (pinned), `Makefile`, `configs/pipeline.yaml`, `.gitignore`, Spark session helper, logging | `make test` runs (empty suite passes); `python -c "import pyspark"` works |
| **1. Data load + validation** | Trustworthy silver data | Load `transactions_clean.parquet` with Spark; schema contract; reconciliation tests (§12); optional raw-xlsx → bronze → silver path (§6.1–6.2) | Rows = 1,033,062; gross units = 11,221,957; gross revenue ≈ £19,700,954 (±£1) |
| **2. Demand definition** | Correct target | Cancellation matching, `immediately_cancelled` flag, spike capping, product-week panel with zero-filling, availability proxy (§6.2 step 5, §6.3) | One row per product-week; the 80,995/74,215-unit orders excluded; counts of capped/zero-filled rows logged |
| **3. Features + EDA** | Gold features and findings | Calendar, lags, rolling, price (list price), RFM, segments, holidays; EDA figures in `reports/figures/` | Leakage test passes; each EDA finding has a figure and the table it came from |
| **4. Forecasting** | Measured demand model | Baselines, global GBM, time split, rolling backtest, SHAP, `reports/model_card.md` (§7) | GBM beats the best baseline on test WAPE, or the model card says honestly that it doesn't |
| **5. Elasticity + pricing** | Explainable prices | Panel elasticity with shrinkage, revenue search, guardrails, explanation text, held-out price-change check (§8) | Guardrail tests pass; every product has either a recommendation or a "hold" with a reason |
| **6. Dashboard** | Usable interface | Streamlit pages (§10) reading gold Parquet only | Every page loads in under 5 s; every chart labels its source and date range |
| **7. Streaming** | Real-time demo | Replay producer + Structured Streaming job + Live page (§9) | Replay updates windowed metrics and alerts on the dashboard end to end |
| **8. Polish** | Hand-in ready | `reports/data_card.md`, final report, README figures, clean re-run from scratch | `make all` from a fresh checkout with the documented silver or raw input reproduces gold tables, model evaluation, pricing decisions, and dashboard inputs |

## 17. Sources

- Chen, D. (2019). *Online Retail II* [Dataset]. UCI Machine Learning Repository. https://archive.ics.uci.edu/dataset/502/online+retail+ii
- Office for National Statistics, *Retail Sales Index time series (DRSI)*. Mirror: https://db.nomics.world/ONS/DRSI
- Olist, *Brazilian E-Commerce Public Dataset* (optional competitor-price case study). https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- `holidays` Python package (UK bank holidays). https://pypi.org/project/holidays/
