(() => {
const { fmt, tile, art, card, banner, chart, axes, legend, col, withAlpha, nice, esc } = App;
const P = DPA.pricing, SM = P.summary, names = Object.fromEntries(DPA.search.rows.map((r) => [r[0], r[1]]));
const rows = P.rows.map((r) => Object.fromEntries(P.columns.map((c, i) => [c, r[i]]))), chg = rows.filter((r) => !r.hold);
App.view('impact', { title: 'Impact', sub: 'What the recommended changes are estimated to be worth, how confident the model is, and which guardrails bind.', tags: ['Estimates under the model', 'Weekly revenue at forecast demand', 'Not profit'] }, (root) => {
  const C = col(), gain = chg.reduce((a, r) => a + r.revenue_gain, 0), lo = chg.reduce((a, r) => a + r.revenue_gain_low, 0), hi = chg.reduce((a, r) => a + r.revenue_gain_high, 0);
  root.innerHTML = `
  ${banner('<b>These are estimates, not measured results.</b> No live price test was possible. The range uses the 90% interval of each product’s elasticity; the true effect can fall outside it if demand responds differently from history.')}
  <div class="card kline mt">
    ${App.stat({ cls: 'green mini', label: 'Estimated weekly gain', value: fmt.gbp(gain, 0), text: `range ${fmt.gbp(lo, 0)} to ${fmt.gbp(hi, 0)}`, art: art.waves(5), small: true })}
    ${App.stat({ cls: 'amber mini', label: 'Products changed', value: fmt.int(chg.length), text: `${fmt.pct(chg.length / SM.products, 1)} of the catalogue`, art: art.bars() })}
    ${App.stat({ cls: 'coral mini', label: 'Median change', value: fmt.spct(SM.median_change), text: 'mostly price cuts', art: art.arcs() })}
    ${App.stat({ cls: 'slate mini', label: 'Largest single gain', value: fmt.gbp(Math.max(...chg.map((r) => r.revenue_gain)), 0), text: 'per week, one product', art: art.rings(), small: true })}</div>
  <div class="grid g2 mt">
    ${card('Size of recommended changes', 'Products by percentage change', '<div class="chart"><canvas id="c-hist"></canvas></div>')}
    ${card('Cumulative gain', 'Products ranked by estimated gain', '<div class="chart"><canvas id="c-cum"></canvas></div>')}</div>
  <div class="grid g2 mt">
    ${card('Confidence', 'Recommended changes', '<div class="chart sm fixed"><canvas id="c-conf"></canvas></div><div class="legend" id="conf-l"></div>')}
    ${card('Binding guardrails', 'What limited the chosen price', '<div class="chart sm fixed"><canvas id="c-bind"></canvas></div><div class="legend" id="bind-l"></div>')}</div>
  <div class="grid g2 mt">
    ${card('Why products are held', 'All held products', '<div class="bars" id="reasons"></div>')}
    ${card('By price band', 'Recommended changes grouped by current list price', '<div class="chart"><canvas id="c-band"></canvas></div>')}</div>
  <div class="grid mt">${card('Top 10 estimated gains', 'With the range across the elasticity interval', '<div class="chart lg"><canvas id="c-top"></canvas></div>')}</div>`
  const bins = Array.from({ length: 21 }, (_, i) => -0.1 + i * 0.01);
  chart('c-hist', { type: 'bar', data: { labels: bins.map((b) => (b * 100).toFixed(0) + '%'), datasets: [{ data: bins.map((b) => chg.filter((r) => r.percent_change >= b - 0.005 && r.percent_change < b + 0.005).length), backgroundColor: bins.map((b) => (b < 0 ? withAlpha(C.orange, 0.85) : withAlpha(C.green, 0.85))), borderRadius: 3 }] }, options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxTicksLimit: 8, maxRotation: 0 } }, y: axes().y }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} products` } } } } });
  const sorted = [...chg].sort((a, b) => b.revenue_gain - a.revenue_gain); let run = 0;
  chart('c-cum', { type: 'line', data: { labels: sorted.map((_, i) => i + 1), datasets: [{ label: 'Cumulative weekly gain', data: sorted.map((r) => (run += r.revenue_gain)), borderColor: C.green, backgroundColor: (c) => App.gradient(c.chart.ctx, C.green, 300), fill: true, tension: .2 }] }, options: { maintainAspectRatio: false, scales: { x: { ...axes().x, title: { display: true, text: 'Products, best first' } }, y: { ...axes().y, ticks: { callback: (v) => '£' + fmt.compact(v) } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.gbp(c.parsed.y, 0)} from the top ${c.label} products` } } } } });
  const donut = (id, lid, labels, data, colors) => { chart(id, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: C.card, borderWidth: 3, cutout: '68%' }] }, options: { maintainAspectRatio: false } }); document.getElementById(lid).innerHTML = labels.map((l, i) => `<div class="row"><span class="dot" style="background:${colors[i]}"></span><span>${l}</span><span>${data[i]}</span></div>`).join(''); };
  const cf = ['High', 'Medium', 'Low'].map((k) => chg.filter((r) => r.confidence === k).length);
  donut('c-conf', 'conf-l', ['High', 'Medium', 'Low'], cf, [C.green, C.amber, C.red]);
  const bk = { max_price_change: 'Max ±10% change', observed_price_range: 'Observed price range', none: 'No guardrail' }, bc = Object.keys(bk).map((k) => chg.filter((r) => r.binding_guardrail === k).length);
  donut('c-bind', 'bind-l', Object.values(bk), bc, [C.orange, C.slate, C.faint]);
  const hr = Object.entries(P.hold_reasons).map(([k, v]) => [App.cap(k), v]), hm = Math.max(...hr.map((h) => h[1]));
  document.getElementById('reasons').innerHTML = hr.map(([k, v], i) => `<div class="bar-row"><div class="l"><span style="color:var(--ink)">${esc(k)}</span><span>${fmt.int(v)}</span></div><div class="track"><div class="fill" style="width:${v / hm * 100}%;background:${[C.slate, C.amber, C.green, C.orange, C.violet, C.red][i % 6]}"></div></div></div>`).join('');
  const bands = [[0, 1, 'Under £1'], [1, 3, '£1–3'], [3, 10, '£3–10'], [10, 1e9, '£10+']].map(([a, b, l]) => { const g = chg.filter((r) => r.current_price >= a && r.current_price < b); return { l, n: g.length, gain: g.reduce((s, r) => s + r.revenue_gain, 0), med: g.length ? g.map((r) => r.percent_change).sort((x, y) => x - y)[Math.floor(g.length / 2)] : 0 }; });
  chart('c-band', { type: 'bar', data: { labels: bands.map((b) => b.l), datasets: [{ label: 'Estimated weekly gain (£)', data: bands.map((b) => b.gain), backgroundColor: withAlpha(C.green, 0.85), borderRadius: 4, maxBarThickness: 44 }] }, options: { maintainAspectRatio: false, scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...axes().y, ticks: { callback: (v) => '£' + fmt.compact(v) } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.gbp(c.parsed.y, 0)} · ${bands[c.dataIndex].n} products · median ${fmt.spct(bands[c.dataIndex].med)}` } } } } });
  const top = sorted.slice(0, 10);
  chart('c-top', { type: 'bar', data: { labels: top.map((r) => nice(names[r.Stock_Code] || r.Stock_Code).slice(0, 24)), datasets: [{ label: 'Range', data: top.map((r) => [r.revenue_gain_low, r.revenue_gain_high]), backgroundColor: withAlpha(C.green, 0.3), borderRadius: 3, barThickness: 14, grouped: false }, { label: 'Estimate', data: top.map((r) => r.revenue_gain), backgroundColor: C.green, borderRadius: 3, barThickness: 5, grouped: false }] }, options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { ...axes().y, ticks: { callback: (v) => '£' + v } }, y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10.5 } } } }, plugins: { legend: legend(), tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${Array.isArray(c.raw) ? fmt.gbp(c.raw[0], 0) + ' to ' + fmt.gbp(c.raw[1], 0) : fmt.gbp(c.raw, 0)}` } } } } });
});
})();
