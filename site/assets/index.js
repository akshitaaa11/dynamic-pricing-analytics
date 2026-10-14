const { fmt, kpi, C, chart, axes, gradient, monthLabel, weekLabel } = App;
const O = DPA.overview, F = DPA.forecast, P = DPA.pricing, K = O.kpis;
const root = App.shell({
  page: 'overview', title: 'Overview', subtitle: 'Demand, forecasts and price decisions from the real transaction data',
  actions: App.rangePill(O.range[0], O.range[1]) + `<button class="pill btn" id="export">${App.icon('download')} Export report</button>`,
});
const lgb = F.metrics.find((m) => m.model === 'lightgbm');
const best = F.metrics.filter((m) => m.model !== 'lightgbm').sort((a, b) => a.wape - b.wape)[0];
root.innerHTML = `
<div class="grid g5">
 ${kpi({ name: 'Total units', sub: 'Last 8 wks vs prior 8', value: fmt.int(K.units), delta: K.units_delta, tone: 'b', ic: 'units' })}
 ${kpi({ name: 'Revenue proxy', sub: 'Last 8 wks vs prior 8', value: fmt.gbp(K.revenue, 0), delta: K.revenue_delta, tone: 'g', ic: 'money' })}
 ${kpi({ name: 'Active products', sub: 'Sold at least once', value: fmt.int(K.products), tone: 'p', ic: 'products' })}
 ${kpi({ name: 'Forecast WAPE', sub: 'LightGBM, test weeks', value: fmt.pct(lgb.wape), tone: 'o', ic: 'target' })}
 ${kpi({ name: 'Price changes', sub: `of ${fmt.int(P.summary.products)} products`, value: fmt.int(P.summary.recommended), tone: 'v', ic: 'pricing' })}
</div>
<div class="grid g-wide mt">
 <div class="card"><div class="card-head"><div><h3>Demand overview</h3><div class="card-sub">Units and revenue proxy</div></div>
  <div class="seg" id="seg"><button data-k="weekly" class="on">Weekly</button><button data-k="monthly">Monthly</button></div></div>
  <div class="chart lg"><canvas id="c-demand"></canvas></div>
  <div class="src">Source: gold/product_week_features · ${fmt.date(O.range[0])} to ${fmt.date(O.range[1])} · revenue proxy = units × small-order list price</div></div>
 <div class="card"><div class="card-head"><div><h3>Demand by product tier</h3><div class="card-sub">Share of all units</div></div></div>
  <div class="chart sm"><canvas id="c-tier"></canvas></div><div class="legend" id="tier-legend"></div></div>
</div>
<div class="grid g3 mt">
 <div class="card"><div class="card-head"><h3>Top products</h3><a class="sub" href="products.html" style="text-decoration:none">View all →</a></div><div class="bars" id="top"></div></div>
 <div class="card"><div class="card-head"><div><h3>Prediction interval</h3><div class="card-sub">80% interval coverage on test weeks</div></div></div>
  <div class="gauge"><canvas id="c-gauge"></canvas><div class="gauge-center"><small>Coverage</small><b>${fmt.pct(lgb.coverage_80)}</b></div></div>
  <div class="gauge-foot"><span>Target <b>80%</b></span><span>Mean width <b>${fmt.num(lgb.mean_interval_width, 0)} units</b></span></div></div>
 <div class="card"><div class="card-head"><div><h3>Forecast vs actual</h3><div class="card-sub">Total units, test weeks</div></div></div>
  <div class="chart"><canvas id="c-fc"></canvas></div></div>
</div>
<div class="note mt">${lgb.wape < best.wape ? 'LightGBM beats' : 'LightGBM does <b>not</b> beat'} the best baseline (${best.model.replace(/_/g, ' ')}, WAPE ${fmt.pct(best.wape)} vs ${fmt.pct(lgb.wape)}). Revenue is a proxy, not profit; competitor prices, promotions, inventory and costs are not in the data. See <a href="data.html">Data &amp; limits</a>.</div>`;

function demand(kind) {
  const labels = kind === 'weekly' ? O.weeks.map(weekLabel) : O.monthly.labels.map(monthLabel);
  const d = kind === 'weekly' ? O.weekly : O.monthly;
  chart('c-demand', { type: 'line', data: { labels, datasets: [
    { label: 'Units', data: d.units, borderColor: C.orange, backgroundColor: (c) => gradient(c.chart.ctx, C.orange, 340), fill: true, tension: .35, yAxisID: 'y' },
    { label: 'Revenue proxy (£)', data: d.revenue, borderColor: C.indigo, tension: .35, yAxisID: 'y1' }] },
    options: { maintainAspectRatio: false, scales: { x: axes().x, y: axes().y, y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { callback: (v) => '£' + fmt.compact(v), maxTicksLimit: 6 } } },
      plugins: { legend: App.legend(), tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.int(c.parsed.y)}` } } } } });
}
demand('weekly');
document.querySelectorAll('#seg button').forEach((b) => b.onclick = () => { document.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x === b)); demand(b.dataset.k); });
const tc = [C.indigo, C.violet, C.sky, C.peach];
chart('c-tier', { type: 'polarArea', data: { labels: O.tiers.map((t) => t[0]), datasets: [{ data: O.tiers.map((t) => t[1] * 100), backgroundColor: tc.map((c) => c + 'cc'), borderWidth: 0 }] },
  options: { maintainAspectRatio: false, scales: { r: { ticks: { display: false }, grid: { color: '#eef0f4' }, border: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.r.toFixed(1)}% of units` } } } } });
document.getElementById('tier-legend').innerHTML = O.tiers.map((t, i) => `<div class="row"><span class="dot" style="background:${tc[i]}"></span><span>${t[0]}</span><span>${fmt.pct(t[1], 0)}</span></div>`).join('');
const topRows = O.top_products.slice(0, 5), max = topRows[0][1], cols = [C.green, C.orange, C.indigo, C.violet, C.sky];
const names = Object.fromEntries(DPA.products.rows.map((r) => [r[0], r[1]]));
document.getElementById('top').innerHTML = topRows.map((r, i) => `<a class="bar-row" href="products.html#${encodeURIComponent(r[0])}" style="color:inherit;text-decoration:none"><div class="l"><b>${(names[r[0]] || r[0]).toLowerCase().replace(/^./, (c) => c.toUpperCase()).slice(0, 26)}</b><span>${fmt.int(r[1])} units (${fmt.pct(r[1] / max, 0)})</span></div><div class="track"><div class="fill" style="width:${r[1] / max * 100}%;background:${cols[i]}"></div></div></a>`).join('');
const cov = lgb.coverage_80;
chart('c-gauge', { type: 'doughnut', data: { datasets: [{ data: [cov, 1 - cov], backgroundColor: [C.orange, '#eef0f4'], borderWidth: 0, borderRadius: 6, cutout: '78%' }] },
  options: { rotation: -90, circumference: 180, maintainAspectRatio: false, plugins: { tooltip: { enabled: false } }, layout: { padding: { bottom: 0 } } } });
chart('c-fc', { type: 'line', data: { labels: F.aggregate.weeks.map(weekLabel), datasets: [
  { label: 'Actual', data: F.aggregate.units, borderColor: C.indigo, tension: .3 },
  { label: 'LightGBM', data: F.aggregate.lightgbm, borderColor: C.orange, tension: .3 }] },
  options: { maintainAspectRatio: false, scales: axes(), plugins: { legend: App.legend() } } });
document.getElementById('export').onclick = () => App.download('weekly_demand.csv', [['week_start', 'units', 'revenue_proxy_gbp', 'active_products']].concat(O.weeks.map((w, i) => [w, O.weekly.units[i], O.weekly.revenue[i], O.weekly.products[i]])));
