const { fmt, kpi, C, chart, axes, weekLabel } = App;
const F = DPA.forecast, O = DPA.overview, S = DPA.products.series;
const root = App.shell({ page: 'forecast', title: 'Forecast', subtitle: 'One-week-ahead demand, rolling-origin evaluation against simple baselines', actions: App.rangePill(F.aggregate.weeks[0], F.aggregate.weeks.at(-1)) });
const M = Object.fromEntries(F.metrics.map((m) => [m.model, m]));
const lgb = M.lightgbm, base = F.metrics.filter((m) => m.model !== 'lightgbm').sort((a, b) => a.wape - b.wape)[0];
const label = (m) => ({ lightgbm: 'LightGBM', seasonal_naive: 'Seasonal naive', moving_average_4: '4-wk moving avg', moving_average_13: '13-wk moving avg' }[m] || m);
const names = Object.fromEntries(DPA.products.rows.map((r) => [r[0], r[1]]));
root.innerHTML = `
<div class="grid g4">
 ${kpi({ name: 'LightGBM WAPE', sub: 'Lower is better', value: fmt.pct(lgb.wape), tone: 'o', ic: 'target' })}
 ${kpi({ name: 'Best baseline WAPE', sub: label(base.model), value: fmt.pct(base.wape), tone: 'b', ic: 'forecast' })}
 ${kpi({ name: '80% interval coverage', sub: 'Target 80%', value: fmt.pct(lgb.coverage_80), tone: 'g', ic: 'check' })}
 ${kpi({ name: 'Evaluation blocks', sub: `${F.periods.test_start} to ${F.periods.test_end}`, value: lgb.folds + ' × 4 wks', tone: 'p', ic: 'calendar' })}
</div>
<div class="note ${lgb.wape < base.wape ? '' : 'warn'} mt">${lgb.wape < base.wape ? 'LightGBM beats the best baseline.' : '<b>LightGBM does not beat the best baseline</b> on test WAPE, so the simple ' + label(base.model).toLowerCase() + ' is the more accurate point forecast here.'} Before each 4-week block the models are refit on rows strictly before that block, so no block sees its own targets.</div>
<div class="grid g-wide mt">
 <div class="card"><div class="card-head"><div><h3>Total demand: actual vs forecast</h3><div class="card-sub">Sum over all products, test weeks (with 26 weeks of context)</div></div>
  <div class="seg" id="mseg"><button data-m="lightgbm" class="on">LightGBM</button><button data-m="moving_average_4">4-wk MA</button><button data-m="seasonal_naive">Seasonal</button></div></div>
  <div class="chart lg"><canvas id="c-agg"></canvas></div></div>
 <div class="card"><div class="card-head"><div><h3>Model comparison</h3><div class="card-sub">WAPE on the test weeks</div></div></div><div class="chart"><canvas id="c-wape"></canvas></div>
  <table style="margin-top:8px"><thead><tr><th>Model</th><th class="num">MAE</th><th class="num">Bias</th></tr></thead><tbody>${F.metrics.map((m) => `<tr style="cursor:default"><td>${label(m.model)}</td><td class="num">${fmt.num(m.mae, 1)}</td><td class="num">${fmt.num(m.bias, 1)}</td></tr>`).join('')}</tbody></table></div>
</div>
<div class="grid g2 mt">
 <div class="card"><div class="card-head"><div><h3>Feature importance</h3><div class="card-sub">Mean |SHAP| — model behaviour, not causality</div></div></div><div class="chart"><canvas id="c-shap"></canvas></div></div>
 <div class="card"><div class="card-head"><div><h3>Accuracy by evaluation block</h3><div class="card-sub">WAPE per 4-week block</div></div></div><div class="chart sm"><canvas id="c-fold"></canvas></div>
  <div class="src">The Sept–Nov test window includes the Q4 peak; seasonal naive has only the prior-year week to lean on.</div></div>
</div>
<div class="card mt"><div class="card-head"><div><h3>Product forecast explorer</h3><div class="card-sub">Actual units, forecast and 80% interval (top 400 products by test-period volume)</div></div>
  <select id="psel">${Object.keys(F.products).map((c) => `<option value="${c}">${c} · ${(names[c] || '').slice(0, 34)}</option>`).join('')}</select></div>
  <div class="chart lg"><canvas id="c-prod"></canvas></div></div>`;
const W = O.weeks;
function agg(model) {
  const labels = F.context.weeks.concat(F.aggregate.weeks).map(weekLabel);
  const pad = (a) => Array(F.context.weeks.length).fill(null).concat(a);
  chart('c-agg', { type: 'line', data: { labels, datasets: [
    { label: 'Actual', data: F.context.units.concat(F.aggregate.units), borderColor: C.indigo, tension: .3 },
    { label: label(model), data: pad(F.aggregate[model]), borderColor: C.orange, tension: .3, borderDash: model === 'lightgbm' ? [] : [6, 4] }] },
    options: { maintainAspectRatio: false, scales: axes(), plugins: { legend: App.legend(), tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.int(c.parsed.y)}` } } } } });
}
agg('lightgbm');
document.querySelectorAll('#mseg button').forEach((b) => b.onclick = () => { document.querySelectorAll('#mseg button').forEach((x) => x.classList.toggle('on', x === b)); agg(b.dataset.m); });
const order = [...F.metrics].sort((a, b) => a.wape - b.wape);
chart('c-wape', { type: 'bar', data: { labels: order.map((m) => label(m.model)), datasets: [{ data: order.map((m) => m.wape * 100), backgroundColor: order.map((m) => m.model === 'lightgbm' ? C.orange : C.indigo + 'bb'), borderRadius: 8, maxBarThickness: 28 }] },
  options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { grid: App.grid, border: { display: false }, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false }, border: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` WAPE ${c.parsed.x.toFixed(1)}%` } } } } });
const pretty = (f) => f.replace(/_units$/, '').replace(/_/g, ' ');
chart('c-shap', { type: 'bar', data: { labels: F.shap.map((s) => pretty(s.feature)), datasets: [{ data: F.shap.map((s) => s.mean_abs_shap), backgroundColor: C.violet + 'cc', borderRadius: 8, maxBarThickness: 18 }] },
  options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { grid: App.grid, border: { display: false } }, y: { grid: { display: false }, border: { display: false } } } } });
chart('c-fold', { type: 'bar', data: { labels: F.by_fold.map((f) => `${weekLabel(f.from)} – ${weekLabel(f.to)}`), datasets: [{ label: 'LightGBM', data: F.by_fold.map((f) => f.lightgbm_wape * 100), backgroundColor: C.orange, borderRadius: 8, maxBarThickness: 30 }, { label: '4-wk MA', data: F.by_fold.map((f) => f.ma4_wape * 100), backgroundColor: C.indigo + 'bb', borderRadius: 8, maxBarThickness: 30 }] },
  options: { maintainAspectRatio: false, scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid: App.grid, border: { display: false }, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: App.legend(), tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } } });
function prod(code) {
  const rows = F.products[code], first = rows[0][0], s = S[code];
  const from = Math.max(first - 26, s ? s[0] : first), to = rows.at(-1)[0];
  const idx = []; for (let i = from; i <= to; i++) idx.push(i);
  const val = (i) => (s && s[1][i - s[0]] != null ? s[1][i - s[0]] : null);
  const at = Object.fromEntries(rows.map((r) => [r[0], r]));
  chart('c-prod', { type: 'line', data: { labels: idx.map((i) => weekLabel(W[i])), datasets: [
    { label: 'Lower 80%', data: idx.map((i) => at[i]?.[3] ?? null), borderColor: 'transparent', pointRadius: 0, tension: .3 },
    { label: '80% interval', data: idx.map((i) => at[i]?.[4] ?? null), borderColor: 'transparent', backgroundColor: C.orange + '26', fill: '-1', pointRadius: 0, tension: .3 },
    { label: 'Actual', data: idx.map(val), borderColor: C.indigo, tension: .3 },
    { label: 'LightGBM', data: idx.map((i) => at[i]?.[2] ?? null), borderColor: C.orange, tension: .3, spanGaps: true },
    { label: '4-wk MA', data: idx.map((i) => at[i]?.[5] ?? null), borderColor: C.grey, borderDash: [5, 4], tension: .3, spanGaps: true }] },
    options: { maintainAspectRatio: false, scales: axes((v) => fmt.int(v)), plugins: { legend: { ...App.legend(), labels: { ...App.legend().labels, filter: (l) => l.text !== 'Lower 80%' } }, tooltip: { filter: (t) => t.dataset.label !== 'Lower 80%' } } } });
}
const sel = document.getElementById('psel');
sel.onchange = () => prod(sel.value);
const want = decodeURIComponent(location.hash.slice(1));
if (F.products[want]) sel.value = want;
prod(sel.value);
