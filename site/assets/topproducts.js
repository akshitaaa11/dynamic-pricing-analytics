(() => {
const { fmt, tile, art, card, chart, axes, col, withAlpha, nice, esc } = App;
const PR = DPA.products, P = DPA.pricing, pc = Object.fromEntries(P.columns.map((c, i) => [c, i]));
const rec = Object.fromEntries(P.rows.map((r) => [r[0], r]));
const totalUnits = PR.rows.reduce((a, r) => a + r[2], 0), totalRev = PR.rows.reduce((a, r) => a + r[3], 0);
const top = PR.rows.slice(0, 50).map((r, i) => ({ id: r[0], rank: i + 1, name: nice(r[1]), units: r[2], revenue: r[3], price: r[4], weeks: r[5], share: r[2] / totalUnits, rec: rec[r[0]] }));
App.view('topproducts', { title: 'Top products', sub: 'The 50 products with the most units sold over the whole period. Click a row to open the product.', tags: ['Ranked by units', 'Revenue proxy = units × small-order list price', 'Source: gold product-week features'] }, (root) => {
  const C = col(), u50 = top.reduce((a, r) => a + r.units, 0), r50 = top.reduce((a, r) => a + r.revenue, 0), chg = top.filter((r) => r.rec && !r.rec[pc.hold]).length;
  root.innerHTML = `
  <div class="grid g4">
    ${tile({ cls: 'green mini', label: 'Share of units', value: fmt.pct(u50 / totalUnits, 0), text: `held by the top 50 of ${fmt.int(PR.rows.length)} products`, art: art.waves(5) })}
    ${tile({ cls: 'amber mini', label: 'Share of revenue', value: fmt.pct(r50 / totalRev, 0), text: 'revenue proxy, top 50', art: art.bars() })}
    ${tile({ cls: 'coral mini', label: 'Best seller', value: fmt.compact(top[0].units), text: esc(top[0].name.slice(0, 34)), art: art.arcs() })}
    ${tile({ cls: 'slate mini', label: 'With a price change', value: String(chg), text: 'of the top 50 are recommended a new price', art: art.rings() })}</div>
  <div class="grid mt">${card('Top 20 by units', 'Units sold, best seller first', '<div class="chart lg"><canvas id="c-top"></canvas></div>')}</div>
  <div class="grid mt">${card('Top 50 products', 'Sort by any column', '<div id="tbl"></div>')}</div>`;
  chart('c-top', { type: 'bar', data: { labels: top.slice(0, 20).map((r) => r.name.slice(0, 42)), datasets: [{ label: 'Units', data: top.slice(0, 20).map((r) => r.units), backgroundColor: withAlpha(C.green, 0.85), borderRadius: 4, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: axes().y, y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.x)} units · ${fmt.pct(top[c.dataIndex].share, 1)} of all units` } } } } });
  const cols = [
    { key: 'rank', label: '#', render: (r) => r.rank },
    { key: 'name', label: 'Product', render: (r) => `<b style="font-weight:400">${esc(r.name.slice(0, 44))}</b><br><small style="color:var(--muted)">${esc(r.id)}</small>` },
    { key: 'units', label: 'Units', num: true, render: (r) => fmt.int(r.units) },
    { key: 'share', label: 'Share', num: true, render: (r) => fmt.pct(r.share, 2) },
    { key: 'revenue', label: 'Revenue proxy', num: true, render: (r) => fmt.gbp(r.revenue, 0) },
    { key: 'price', label: 'Avg price', num: true, render: (r) => fmt.gbp(r.price) },
    { key: 'decision', label: 'Price decision', render: (r) => (!r.rec ? '–' : r.rec[pc.hold] ? '<span class="tag hold">Hold</span>' : `<span class="tag ${r.rec[pc.percent_change] > 0 ? 'up' : 'down'}">${fmt.spct(r.rec[pc.percent_change])}</span>`) },
  ];
  top.forEach((r) => (r.decision = r.rec ? (r.rec[pc.hold] ? 0 : r.rec[pc.percent_change]) : null));
  App.table({ el: 'tbl', columns: cols, rows: top.map((r) => ({ ...r, id: r.id })), pageSize: 50, sortKey: 'rank', dir: 1, onSelect: (r) => { location.href = 'demand.html#p-' + encodeURIComponent(r.id); } });
  document.querySelector('#tbl .table-wrap').style.maxHeight = 'none';
  document.querySelector('#tbl .pager').style.display = 'none';
});
})();
