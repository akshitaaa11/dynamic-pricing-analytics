(() => {
const { fmt, tile, art, card, chart, axes, legend, col, withAlpha, gradient, monthLabel, weekLabel, heatmap, nice } = App;
const O = DPA.overview, K = O.kpis, names = Object.fromEntries(DPA.search.rows.map((r) => [r[0], r[1]]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
App.view('demand', { title: 'Demand', sub: 'Seasonality, trend and concentration of weekly unit demand.', tags: [`${fmt.date(O.range[0])} to ${fmt.date(O.range[1])}`, `${fmt.int(K.products)} products`, 'Source: gold product-week features'] }, (root) => {
  const C = col(), inner = O.weekly.units.slice(1, -1), pk = inner.indexOf(Math.max(...inner)) + 1, pm = O.monthly.units.indexOf(Math.max(...O.monthly.units));
  const q4 = (O.seasonality[9] + O.seasonality[10] + O.seasonality[11]) / O.seasonality.reduce((a, b) => a + b, 0);
  root.innerHTML = `
  <div class="grid g4">
    ${tile({ cls: 'green mini', label: 'Average week', value: fmt.compact(K.avg_weekly_units), text: 'units, partial weeks excluded', art: art.waves(5) })}
    ${tile({ cls: 'amber mini', label: 'Peak week', value: fmt.compact(O.weekly.units[pk]), text: `week of ${fmt.date(O.weeks[pk])}`, art: art.bars() })}
    ${tile({ cls: 'coral mini', label: 'Peak month', value: fmt.compact(O.monthly.units[pm]), text: monthLabel(O.monthly.labels[pm]), art: art.arcs() })}
    ${tile({ cls: 'slate mini', label: 'Q4 share', value: fmt.pct(q4, 0), text: 'of all units sold in Oct–Dec', art: art.rings() })}</div>
  <div class="grid mt">
    ${card('Weekly demand', 'Units and revenue proxy (units × small-order list price)', '<div class="chart lg"><canvas id="c-weekly"></canvas></div><div class="src">Partial first and last weeks drop toward zero.</div>', { tools: '<div class="seg" id="seg"><button data-k="weekly" class="on">Weekly</button><button data-k="monthly">Monthly</button></div>' })}</div>
  <div class="grid g2 mt">
    ${card('Seasonality', 'Units by calendar month, all years', '<div class="chart"><canvas id="c-season"></canvas></div>')}
    ${card('Product tiers', 'Share of all units by product rank', '<div class="chart"><canvas id="c-tier"></canvas></div>')}</div>
  <div class="grid mt">${card('Demand calendar', 'Total units per ISO week, one row per year. Darker is higher.', '<div id="cal"></div><div class="scale"><span>Low</span><i id="cal-scale"></i><span>High</span></div>')}</div>
  <div class="grid g2 mt">
    ${card('Concentration', 'Cumulative units vs share of products', '<div class="chart"><canvas id="c-pareto"></canvas></div>')}
    ${card('Availability proxy', 'Share of product-weeks with zero sales or flagged unavailable', '<div class="chart"><canvas id="c-zero"></canvas></div><div class="src">Inferred from sales gaps; not inventory data.</div>')}</div>`;
  const draw = (kind) => {
    const labels = kind === 'weekly' ? O.weeks.map(weekLabel) : O.monthly.labels.map(monthLabel), d = kind === 'weekly' ? O.weekly : O.monthly;
    chart('c-weekly', { type: 'line', data: { labels, datasets: [{ label: 'Units', data: d.units, borderColor: C.green, backgroundColor: (c) => gradient(c.chart.ctx, C.green, 340), fill: true, tension: .3, yAxisID: 'y' }, { label: 'Revenue proxy (£)', data: d.revenue, borderColor: C.orange, tension: .3, yAxisID: 'y1' }] },
      options: { maintainAspectRatio: false, scales: { x: axes().x, y: axes().y, y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { callback: (v) => '£' + fmt.compact(v), maxTicksLimit: 6 } } }, plugins: { legend: legend(), tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt.int(c.parsed.y)}` } } } } });
  };
  draw('weekly');
  document.querySelectorAll('#seg button').forEach((b) => (b.onclick = () => { document.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x === b)); draw(b.dataset.k); }));
  chart('c-season', { type: 'radar', data: { labels: MONTHS, datasets: [{ label: 'Units', data: O.seasonality, borderColor: C.orange, backgroundColor: withAlpha(C.orange, 0.16), pointRadius: 2.5, pointBackgroundColor: C.orange }] },
    options: { maintainAspectRatio: false, scales: { r: { grid: { color: C.grid }, angleLines: { color: C.grid }, ticks: { display: false }, pointLabels: { color: C.muted } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.r)} units` } } } } });
  const years = [...new Set(O.weeks.map((w) => w.slice(0, 4)))], isoWeek = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return { y: d.getFullYear(), w: 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7) }; };
  const mat = years.map(() => Array(53).fill(0)); O.weeks.forEach((w, i) => { if (i === 0 || i === O.weeks.length - 1) return; const { y, w: n } = isoWeek(w); const r = years.indexOf(String(y)); if (r >= 0 && n >= 1 && n <= 53) mat[r][n - 1] += O.weekly.units[i]; });
  heatmap(document.getElementById('cal'), mat, { rows: years, cols: Array.from({ length: 53 }, (_, i) => i + 1), color: 'green', tip: (v) => fmt.int(v) + ' units', showCols: (i) => i % 4 === 0 });
  document.getElementById('cal-scale').style.background = `linear-gradient(90deg, ${withAlpha(C.green, 0.1)}, ${C.green})`;
  const tc = [C.green, C.amber, C.slate, C.orange];
  chart('c-tier', { type: 'pie', data: { labels: O.tiers.map((t) => t[0]), datasets: [{ data: O.tiers.map((t) => t[1] * 100), backgroundColor: tc, borderColor: C.card, borderWidth: 3 }] },
    options: { maintainAspectRatio: false, layout: { padding: 8 }, plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 10, padding: 18, font: { size: 15.5 }, generateLabels: (c) => c.data.labels.map((l, i) => ({ text: `${l}  ${c.data.datasets[0].data[i].toFixed(0)}%`, fillStyle: tc[i], strokeStyle: tc[i], pointStyle: 'circle', index: i })) }, onClick: null }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.toFixed(1)}% of units` } } } },
    plugins: [{ id: 'pct', afterDatasetsDraw(ch) { const m = ch.getDatasetMeta(0), g = ch.ctx; m.data.forEach((arc, i) => { const v = ch.data.datasets[0].data[i]; if (v < 6) return; const p = arc.tooltipPosition(); g.save(); g.fillStyle = '#fff'; g.font = '500 16px Outfit, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v.toFixed(0) + '%', p.x, p.y); g.restore(); }); } }] });
  chart('c-pareto', { type: 'line', data: { datasets: [{ label: 'Cumulative units', data: O.pareto.map((p) => ({ x: p[0] * 100, y: p[1] * 100 })), borderColor: C.green, fill: true, backgroundColor: withAlpha(C.green, 0.1), tension: .3 }, { label: 'Even share', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: C.faint, borderDash: [4, 4] }] },
    options: { maintainAspectRatio: false, parsing: false, interaction: { mode: 'nearest', intersect: false }, scales: { x: { type: 'linear', min: 0, max: 100, grid: { color: C.grid }, ticks: { callback: (v) => v + '%' }, title: { display: true, text: '% of products' } }, y: { min: 0, max: 100, grid: { color: C.grid }, border: { display: false }, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: legend(), tooltip: { callbacks: { title: () => '', label: (c) => ` ${c.parsed.y.toFixed(0)}% at ${c.parsed.x.toFixed(0)}% of products` } } } } });
  chart('c-zero', { type: 'line', data: { labels: O.zero_by_month.labels.map(monthLabel), datasets: [{ label: 'Zero-sales weeks', data: O.zero_by_month.zero.map((v) => v * 100), borderColor: C.orange, tension: .3 }, { label: 'Possibly unavailable', data: O.zero_by_month.unavailable.map((v) => v * 100), borderColor: C.slate, tension: .3 }] },
    options: { maintainAspectRatio: false, scales: { x: axes().x, y: { ...axes().y, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: legend() } } });
});
})();
