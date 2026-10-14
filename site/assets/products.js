(() => {
const { fmt, card, chart, axes, legend, col, withAlpha, gradient, weekLabel, nice, esc } = App;
const PR = DPA.products, P = DPA.pricing, F = DPA.forecast, O = DPA.overview, pc = Object.fromEntries(P.columns.map((c, i) => [c, i]));
const rec = Object.fromEntries(P.rows.map((r) => [r[0], r]));
const items = PR.rows.map((r) => ({ id: r[0], name: nice(r[1]), units: r[2], revenue: r[3], price: r[4], weeks: r[5], zero: r[6] }));
App.view('products', { title: 'Products', sub: `${fmt.int(items.length)} products with weekly units, list price and the pricing decision for each.`, tags: ['Click a row for the detail', 'Source: gold product-week features'] }, (root) => {
  const C = col();
  root.innerHTML = `<div class="grid g-wide"><div class="card"><div class="toolbar"><input type="text" id="q" placeholder="Search by code or name"><select id="sk"><option value="units">Sort by units</option><option value="revenue">Sort by revenue proxy</option><option value="price">Sort by average price</option><option value="weeks">Sort by weeks active</option></select></div><div id="tbl"></div></div>
    <div id="detail" style="display:grid;gap:18px;align-content:start"></div></div>`;
  const want = App.arg('p');
  let selected = items.some((i) => i.id === want) ? want : items[0].id, sortKey = 'units';
  const cols = [{ key: 'id', label: 'Product', render: (r) => `<b style="font-weight:400">${esc(r.id)}</b><br><small style="color:var(--muted)">${esc(r.name.slice(0, 30))}</small>` }, { key: 'units', label: 'Units', num: true, render: (r) => fmt.int(r.units) }, { key: 'revenue', label: 'Revenue', num: true, render: (r) => fmt.gbp(r.revenue, 0) }, { key: 'price', label: 'Avg price', num: true, render: (r) => fmt.gbp(r.price) }, { key: 'weeks', label: 'Weeks', num: true }];
  const t = App.table({ el: 'tbl', columns: cols, rows: items, pageSize: 12, sortKey, selected, onSelect: (r) => { selected = r.id; history.replaceState(null, '', '#p-' + encodeURIComponent(r.id)); detail(r.id); } });
  const filter = () => { const q = document.getElementById('q').value.toLowerCase(); t.setRows(items.filter((i) => !q || i.id.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))); };
  document.getElementById('q').oninput = filter;
  document.getElementById('sk').onchange = (e) => { items.sort((a, b) => (b[e.target.value] ?? -1) - (a[e.target.value] ?? -1)); filter(); };
  function detail(code) {
    const it = items.find((i) => i.id === code), s = PR.series[code], r = rec[code], f = F.products[code];
    const dec = r ? (r[pc.hold] ? '<span class="tag hold">Hold</span>' : `<span class="tag ${r[pc.percent_change] > 0 ? 'up' : 'down'}">${fmt.spct(r[pc.percent_change])}</span>`) : '–';
    document.getElementById('detail').innerHTML = card(esc(it.name || code), `${esc(code)} · ${dec}`, '<div class="chart"><canvas id="c-p"></canvas></div><div class="src">Weekly units and small-order list price.</div>') +
      `<div class="card">${App.statLine('Total units', fmt.int(it.units))}${App.statLine('Revenue proxy', fmt.gbp(it.revenue, 0))}${App.statLine('Weeks in panel / with zero sales', `${it.weeks} / ${it.zero}`)}${App.statLine('Elasticity', r && r[pc.identified] ? `${fmt.num(r[pc.elasticity])} (${fmt.num(r[pc.ci_lower])} to ${fmt.num(r[pc.ci_upper])})` : 'not identified')}${App.statLine('Last forecast week', f ? fmt.num(f.at(-1)[2], 1) + ' units' : 'outside the explorer set')}${r ? `<div class="note" style="margin-top:12px">${esc(r[pc.reason])}</div>` : ''}<p style="margin:14px 0 0;font-size:14px"><a href="pricing.html#rec-${encodeURIComponent(code)}">Open in Recommendations →</a>${f ? ` · <a href="explore.html#lab-${encodeURIComponent(code)}">Open in Forecast lab →</a>` : ''}</p></div>`;
    chart('c-p', { type: 'line', data: { labels: s[1].map((_, i) => weekLabel(O.weeks[s[0] + i])), datasets: [{ label: 'Units', data: s[1], borderColor: C.green, backgroundColor: (c) => gradient(c.chart.ctx, C.green, 300), fill: true, tension: .3, yAxisID: 'y' }, { label: 'List price (£)', data: s[2], borderColor: C.orange, stepped: true, spanGaps: true, yAxisID: 'y1' }] },
      options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: axes().y, y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => '£' + v } } }, plugins: { legend: legend() } } });
  }
  detail(selected); t.select(selected);
});
})();
