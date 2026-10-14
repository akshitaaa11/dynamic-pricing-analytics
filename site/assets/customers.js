(() => {
const { fmt, tile, art, card, chart, axes, legend, col, withAlpha, heatmap, monthLabel } = App;
const Cu = DPA.customers, K = Cu.kpis;
App.view('customers', { title: 'Customers & orders', sub: 'Who buys, when they order and how big the baskets are. Sale invoices only; cancellations are excluded.', tags: [`${fmt.int(K.orders)} orders`, `${fmt.int(K.customers)} identified customers`, `${fmt.pct(K.no_customer_id_share, 0)} of orders have no customer ID`] }, (root) => {
  const C = col(), palette = [C.green, C.orange, C.amber, C.slate, C.violet, C.red, C.lime, C.faint, C.border];
  root.innerHTML = `
  <div class="grid g4">
    ${tile({ cls: 'green mini', label: 'Average order', value: fmt.gbp(K.aov, 0), text: `median ${fmt.gbp(K.median_order, 0)}`, art: art.waves(5) })}
    ${tile({ cls: 'amber mini', label: 'Units per order', value: fmt.num(K.units_per_order, 0), text: 'wholesale-sized baskets', art: art.bars() })}
    ${tile({ cls: 'coral mini', label: 'Repeat customers', value: fmt.pct(K.repeat_rate, 0), text: 'placed two or more orders', art: art.arcs() })}
    ${tile({ cls: 'slate mini', label: 'UK share of revenue', value: fmt.pct(K.uk_share, 0), text: 'the rest is export', art: art.rings() })}</div>
  <div class="grid g-wide mt">
    ${card('When orders arrive', 'Orders by weekday and hour of day (UK time as recorded). Darker is busier.', '<div id="heat"></div><div class="scale"><span>Fewer</span><i id="hs"></i><span>More</span></div>')}
    ${card('Revenue by country', 'Top eight countries and the rest', '<div class="chart sm fixed"><canvas id="c-country"></canvas></div><div class="legend" id="cl"></div>')}</div>
  <div class="grid g2 mt">
    ${card('Active customers and orders', 'Unique customers and invoices per month', '<div class="chart"><canvas id="c-active"></canvas></div>')}
    ${card('Order value distribution', 'Invoices by total value (£)', '<div class="chart"><canvas id="c-value"></canvas></div>')}</div>
  <div class="grid g2 mt">
    ${card('Orders per customer', 'Customers by number of invoices (10 = ten or more)', '<div class="chart"><canvas id="c-repeat"></canvas></div>')}
    ${card('Country detail', 'Revenue is quantity × unit price on sale rows', '<div class="table-wrap" style="max-height:none"><table><thead><tr><th>Country</th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">Customers</th></tr></thead><tbody>' + Cu.countries.map((c) => `<tr style="cursor:default"><td>${c[0]}</td><td class="num">${fmt.gbp(c[1], 0)}</td><td class="num">${fmt.int(c[2])}</td><td class="num">${fmt.int(c[3])}</td></tr>`).join('') + '</tbody></table></div>')}</div>`;
  heatmap(document.getElementById('heat'), Cu.heat, { rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], cols: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), color: 'orange', tip: (v) => fmt.int(v) + ' orders', showCols: (i) => i % 3 === 0, cell: 62 });
  document.getElementById('hs').style.background = `linear-gradient(90deg, ${withAlpha(C.orange, 0.1)}, ${C.orange})`;
  chart('c-country', { type: 'doughnut', data: { labels: Cu.countries.map((c) => c[0]), datasets: [{ data: Cu.countries.map((c) => c[1]), backgroundColor: palette, borderColor: C.card, borderWidth: 2, cutout: '66%' }] }, options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.gbp(c.parsed, 0)}` } } } } });
  const tot = Cu.countries.reduce((a, c) => a + c[1], 0);
  document.getElementById('cl').innerHTML = Cu.countries.slice(0, 5).map((c, i) => `<div class="row"><span class="dot" style="background:${palette[i]}"></span><span>${c[0]}</span><span>${fmt.pct(c[1] / tot, 1)}</span></div>`).join('');
  chart('c-active', { type: 'line', data: { labels: Cu.monthly.labels.map(monthLabel), datasets: [{ label: 'Customers', data: Cu.monthly.customers, borderColor: C.green, tension: .3, yAxisID: 'y' }, { label: 'Orders', data: Cu.monthly.orders, borderColor: C.orange, tension: .3, yAxisID: 'y' }] }, options: { maintainAspectRatio: false, scales: axes(), plugins: { legend: legend() } } });
  const labels = ['<£50', '50–100', '100–200', '200–300', '300–500', '500–1k', '1k–2k', '2k–5k', '5k+'];
  chart('c-value', { type: 'bar', data: { labels, datasets: [{ data: Cu.order_value_hist.counts, backgroundColor: withAlpha(C.green, 0.8), borderRadius: 4, maxBarThickness: 34 }] }, options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10.5 } } }, y: axes().y }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.y)} orders` } } } } });
  chart('c-repeat', { type: 'bar', data: { labels: Cu.orders_per_customer.map((r) => (r[0] === 10 ? '10+' : r[0])), datasets: [{ data: Cu.orders_per_customer.map((r) => r[1]), backgroundColor: withAlpha(C.slate, 0.85), borderRadius: 4, maxBarThickness: 30 }] }, options: { maintainAspectRatio: false, scales: axes(), plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.y)} customers` } } } } });
});
})();
