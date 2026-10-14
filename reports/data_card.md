# Data card

## Scope
This project uses the online retail dataset described in README §2 and §12. The analysis uses the cleaned silver table `data/silver/transactions_clean.parquet` and the derived product-week and feature tables created from that dataset.

## Data lineage
- Raw source: UCI Online Retail II workbook (2009-2011)
- Bronze: raw ingestion output if present in a local clone
- Silver: cleaned and reconciled transactions
- Gold: demand panel, feature dataset, pricing outputs, and live stream summaries

## Key characteristics
- Rows: 1,033,062 clean rows
- Sales rows: 1,015,088
- Gross units: 11,221,957
- Gross revenue: £19,700,954.44
- Cancellation value: −£719,692.94
- Time span: 2009-12-01 to 2011-12-09
- Products: 4,739 stock codes

## Data limitations and proxies
The project follows the README’s rule that missing factors are not invented.

- Inventory / stock availability is handled with an availability proxy derived from real zero-sale patterns and is labelled as a proxy.
- Competitor prices are not available and are shown as not available.
- Promotions are not available; observed markdowns are labelled as observed markdowns, not promotions.
- Costs are not available; revenue is optimized rather than profit.
- External factors not present in the data remain unavailable rather than simulated.

## Quality checks
The project runs validation rules for row counts, signed quantity handling, price ranges, product-week uniqueness, and leakage checks. The tests in `tests/` cover these requirements.

## Model-use note
The forecast and pricing outputs are computed from observed dataset features and documented proxies only. Any recommendation is explicitly model-based and not a measured business result.
