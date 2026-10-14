const { fmt, kpi, C } = App;
const D = DPA.data, Q = D.quality, R = D.recomputed, P = D.panel;
const root = App.shell({ page: 'data', title: 'Data & limits', subtitle: 'Reconciliation, lineage, what is missing and how far to trust the numbers' });
const num = (s) => (s == null ? null : parseFloat(String(s).replace(/[£,]/g, '')));
const checks = [['Clean transaction rows', Q.expected_clean_rows], ['Sale rows', Q.expected_sale_rows], ['Gross sale units', Q.expected_gross_units], ['Gross sale revenue', Q.expected_gross_revenue], ['Cancellation value', Q.expected_cancellation_value]];
const ok = (a, b) => a != null && Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 1e-6);
const missing = [['Competitor prices', 'Not in the data', false], ['Promotion labels', 'Not available; observed markdowns are not treated as promotions', false], ['Inventory', 'Not available; a sales-gap proxy flags possible unavailability', false], ['Unit costs / profit', 'Not available; revenue is shown, never profit', false], ['UK holidays', 'Rule-based calendar from the holidays package', true], ['Market series (ONS)', 'Optional and not used in this build', false]];
root.innerHTML = `
<div class="grid g4">
 ${kpi({ name: 'Clean rows', sub: 'Silver table', value: fmt.int(num(R['Clean transaction rows'])), tone: 'b', ic: 'data' })}
 ${kpi({ name: 'Product-weeks', sub: `${fmt.int(P.products)} products`, value: fmt.int(P.rows), tone: 'p', ic: 'products' })}
 ${kpi({ name: 'Zero-filled weeks', sub: fmt.pct(P.zero_filled / P.rows, 0) + ' of panel', value: fmt.int(P.zero_filled), tone: 'o', ic: 'hold' })}
 ${kpi({ name: 'Possibly unavailable', sub: 'Proxy, not inventory', value: fmt.int(P.possibly_unavailable), tone: 'g', ic: 'target' })}
</div>
<div class="grid g2 mt">
 <div class="card"><div class="card-head"><div><h3>Row reconciliation</h3><div class="card-sub">Recomputed from the silver table vs the contract in configs/pipeline.yaml</div></div></div>
  <table><thead><tr><th>Measurement</th><th class="num">Recomputed</th><th class="num">Contract</th><th></th></tr></thead><tbody>${checks.map(([k, e]) => { const v = num(R[k]); return `<tr style="cursor:default"><td>${k}</td><td class="num">${R[k] ?? '–'}</td><td class="num">${e.toLocaleString('en-GB')}</td><td class="${ok(v, e) ? 'badge-ok' : 'badge-no'}">${ok(v, e) ? '✓' : '≠'}</td></tr>`; }).join('')}</tbody></table>
  <div class="src">Revenue differs from the contract by pennies of rounding. Rejected raw rows are not kept in silver, so exclusion reasons cannot be re-derived here.</div></div>
 <div class="card"><div class="card-head"><div><h3>Missing factors</h3><div class="card-sub">Never filled with invented values</div></div></div>
  <table><tbody>${missing.map(([k, d, y]) => `<tr style="cursor:default"><td style="width:34%">${k}</td><td style="color:#555a6b">${d}</td><td class="${y ? 'badge-ok' : 'badge-no'}">${y ? '✓' : '✕'}</td></tr>`).join('')}</tbody></table></div>
</div>
<div class="grid g2 mt">
 <div class="card"><div class="card-head"><h3>Time split and guardrails</h3></div>
  <div class="stat-line"><span>Train</span><b>${D.periods.train_start} → ${D.periods.train_end}</b></div><div class="stat-line"><span>Validation</span><b>${D.periods.validation_start} → ${D.periods.validation_end}</b></div><div class="stat-line"><span>Test</span><b>${D.periods.test_start} → ${D.periods.test_end}</b></div>
  <div class="stat-line"><span>Max price change per cycle</span><b>±${D.guardrails.max_price_change_pct * 100}%</b></div><div class="stat-line"><span>Min weeks for elasticity</span><b>${D.guardrails.min_weeks_for_elasticity}</b></div><div class="stat-line"><span>Interval confidence</span><b>${D.guardrails.demand_interval_confidence * 100}%</b></div></div>
 <div class="card"><div class="card-head"><h3>Limitations</h3></div><div class="note" style="display:grid;gap:10px">
  <span>• A single UK wholesale-giftware retailer in 2009–2011; results should not be generalised.</span>
  <span>• Elasticity is estimated from historical list-price changes; it is not a controlled experiment, so revenue changes are estimates under the model.</span>
  <span>• LightGBM does not beat the 4-week moving average on test WAPE; the 80% interval undercovers slightly.</span>
  <span>• Forecasts are one-week-ahead, refit every four weeks; a direct 4-week model, demand-tier and peak-week breakdowns are not built.</span>
  <span>• Not included: the live streaming replay page.</span></div></div>
</div>
<div class="card mt"><div class="card-head"><h3>Lineage and documents</h3></div>
 <div class="stat-line"><span>Silver → gold</span><b>transactions_clean → product_week_panel → product_week_features</b></div>
 <div class="stat-line"><span>Forecasts</span><b>forecast_predictions · forecast_model.txt</b></div>
 <div class="stat-line"><span>Pricing</span><b>pricing/elasticity · pricing/recommendations</b></div>
 <div class="stat-line"><span>Documents</span><b><a href="../reports/data_card.md">Data card</a> · <a href="../reports/model_card.md">Model card</a> · <a href="../reports/final_report.md">Final report</a></b></div></div>`;
