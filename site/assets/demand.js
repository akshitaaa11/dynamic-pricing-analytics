const { fmt, kpi, C, chart, axes, monthLabel, weekLabel } = App;
const O = DPA.overview, K = O.kpis;
const root = App.shell({ page: 'demand', title: 'Demand', subtitle: 'Seasonality, product concentration and availability evidence', actions: App.rangePill(O.range[0], O.range[1]) });
const inner = O.weekly.units.slice(1, -1), peakIdx = inner.indexOf(Math.max(...inner)) + 1;
const peakMonth = O.monthly.units.indexOf(Math.max(...O.monthly.units));
const zeroShare = O.zero_by_month.zero.reduce((a, b) => a + b, 0) / O.zero_by_month.zero.length;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const q4 = (O.seasonality[9] + O.seasonality[10] + O.seasonality[11]) / O.seasonality.reduce((a, b) => a + b, 0);
root.innerHTML = `
<div class="grid g4">
 ${kpi({ name: 'Avg weekly demand', sub: 'Excluding partial weeks', value: fmt.int(K.avg_weekly_units), tone: 'b', ic: 'units' })}
 ${kpi({ name: 'Peak week', sub: fmt.date(O.weeks[peakIdx]), value: fmt.int(O.weekly.units[peakIdx]), tone: 'o', ic: 'demand' })}
 ${kpi({ name: 'Peak month', sub: monthLabel(O.monthly.labels[peakMonth]), value: fmt.compact(O.monthly.units[peakMonth]), tone: 'p', ic: 'calendar' })}
 ${kpi({ name: 'Q4 share of demand', sub: 'Oct–Dec, all years', value: fmt.pct(q4, 0), tone: 'g', ic: 'percent' })}
</div>
<div class="grid g-wide mt">
 <div class="card"><div class="card-head"><div><h3>Monthly demand</h3><div class="card-sub">Units sold per calendar month</div></div></div><div class="chart lg"><canvas id="c-month"></canvas></div>
  <div class="src">Source: gold/product_week_features · weeks are grouped by their start date</div></div>
 <div class="card"><div class="card-head"><div><h3>Seasonality</h3><div class="card-sub">Units by calendar month, all years</div></div></div><div class="chart lg"><canvas id="c-season"></canvas></div></div>
</div>
<div class="grid g2 mt">
 <div class="card"><div class="card-head"><div><h3>Product concentration</h3><div class="card-sub">Cumulative share of units vs share of products</div></div></div><div class="chart"><canvas id="c-pareto"></canvas></div></div>
 <div class="card"><div class="card-head"><div><h3>Availability proxy</h3><div class="card-sub">Share of product-weeks with zero sales / flagged possibly unavailable</div></div></div><div class="chart"><canvas id="c-zero"></canvas></div>
  <div class="src">The flag is inferred from gaps in sales, not from inventory data. Zero demand and stock-outs cannot be told apart.</div></div>
</div>
<div class="card mt"><div class="card-head"><h3>Top 10 products by units</h3></div><div class="table-wrap" style="max-height:none"><table><thead><tr><th>Code</th><th>Product</th><th class="num">Units</th><th class="num">Revenue proxy</th><th class="num">Avg list price</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
chart('c-month', { type: 'bar', data: { labels: O.monthly.labels.map(monthLabel), datasets: [{ data: O.monthly.units, backgroundColor: O.monthly.labels.map((m) => ['10', '11', '12'].includes(m.slice(5)) ? C.orange : C.indigo + 'cc'), borderRadius: 8, maxBarThickness: 26 }] },
  options: { maintainAspectRatio: false, scales: axes(), plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.y)} units` } } } } });
chart('c-season', { type: 'bar', data: { labels: MONTHS, datasets: [{ data: O.seasonality, backgroundColor: MONTHS.map((_, i) => i >= 9 ? C.orange : C.violet + 'cc'), borderRadius: 8, maxBarThickness: 22 }] },
  options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: axes().y, y: { grid: { display: false }, border: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.x)} units` } } } } });
chart('c-pareto', { type: 'line', data: { datasets: [{ label: 'Cumulative units', data: O.pareto.map((p) => ({ x: p[0] * 100, y: p[1] * 100 })), borderColor: C.indigo, fill: true, backgroundColor: C.indigo + '1a', tension: .3 }, { label: 'Even share', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: C.grey, borderDash: [5, 5] }] },
  options: { maintainAspectRatio: false, parsing: false, interaction: { mode: 'nearest', intersect: false }, scales: { x: { type: 'linear', min: 0, max: 100, grid: { display: false }, title: { display: true, text: '% of products (ranked by units)' }, ticks: { callback: (v) => v + '%' } }, y: { min: 0, max: 100, grid: App.grid, border: { display: false }, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: App.legend(), tooltip: { callbacks: { title: () => '', label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(0)}% at ${c.parsed.x.toFixed(0)}% of products` } } } } });
chart('c-zero', { type: 'line', data: { labels: O.zero_by_month.labels.map(monthLabel), datasets: [{ label: 'Zero-sales weeks', data: O.zero_by_month.zero.map((v) => v * 100), borderColor: C.orange, tension: .3 }, { label: 'Possibly unavailable', data: O.zero_by_month.unavailable.map((v) => v * 100), borderColor: C.violet, tension: .3 }] },
  options: { maintainAspectRatio: false, scales: { x: axes().x, y: { grid: App.grid, border: { display: false }, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: App.legend() } } });
const names = Object.fromEntries(DPA.products.rows.map((r) => [r[0], r[1]]));
document.getElementById('tb').innerHTML = O.top_products.map((r) => `<tr onclick="location.href='products.html#${encodeURIComponent(r[0])}'"><td>${r[0]}</td><td>${names[r[0]] || ''}</td><td class="num">${fmt.int(r[1])}</td><td class="num">${fmt.gbp(r[2], 0)}</td><td class="num">${fmt.gbp(r[3])}</td></tr>`).join('');
