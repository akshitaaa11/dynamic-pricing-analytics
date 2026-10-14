const { fmt, kpi, C, chart, axes, weekLabel } = App;
const PR = DPA.products, P = DPA.pricing, F = DPA.forecast, O = DPA.overview;
const root = App.shell({ page: 'products', title: 'Products', subtitle: `${fmt.int(PR.rows.length)} products — demand history, list price and decision`, actions: `<button class="pill btn" id="export">${App.icon('download')} Export list</button>` });
const pc = Object.fromEntries(P.columns.map((c, i) => [c, i]));
const rec = Object.fromEntries(P.rows.map((r) => [r[0], r]));
const items = PR.rows.map((r) => ({ code: r[0], name: r[1] || '', units: r[2], revenue: r[3], price: r[4], weeks: r[5], zero: r[6] }));
root.innerHTML = `<div class="grid g-wide">
 <div class="card"><div class="toolbar"><input type="text" id="q" placeholder="Search code or name" style="flex:1"><select id="sk"><option value="units">Sort: units</option><option value="revenue">Sort: revenue proxy</option><option value="price">Sort: avg price</option><option value="weeks">Sort: weeks active</option></select></div>
  <div class="table-wrap"><table><thead><tr><th>Product</th><th class="num">Units</th><th class="num">Revenue proxy</th><th class="num">Avg price</th><th class="num">Weeks</th></tr></thead><tbody id="tb"></tbody></table></div>
  <div class="pager"><span id="pinfo"></span><button id="prev">Prev</button><button id="next">Next</button></div></div>
 <div id="detail" style="align-self:start;position:sticky;top:16px;display:grid;gap:18px"></div></div>`;
let page = 0, selected = null; const PAGE = 14;
const list = () => { const q = document.getElementById('q').value.toLowerCase(), k = document.getElementById('sk').value; return items.filter((i) => !q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)).sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)); };
function render() {
  const l = list(), pages = Math.max(1, Math.ceil(l.length / PAGE)); page = Math.min(page, pages - 1);
  document.getElementById('tb').innerHTML = l.slice(page * PAGE, (page + 1) * PAGE).map((i) => `<tr data-c="${i.code}" class="${i.code === selected ? 'sel' : ''}"><td><b style="font-weight:500">${i.code}</b><br><small style="color:#8a8e9c">${i.name.slice(0, 32)}</small></td><td class="num">${fmt.int(i.units)}</td><td class="num">${fmt.gbp(i.revenue, 0)}</td><td class="num">${fmt.gbp(i.price)}</td><td class="num">${i.weeks}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No products match</td></tr>';
  document.getElementById('pinfo').textContent = `${fmt.int(l.length)} products · page ${page + 1} of ${pages}`;
  document.getElementById('prev').disabled = page === 0; document.getElementById('next').disabled = page >= pages - 1;
  document.querySelectorAll('#tb tr[data-c]').forEach((tr) => tr.onclick = () => { selected = tr.dataset.c; history.replaceState(null, '', '#' + encodeURIComponent(selected)); render(); detail(selected); });
}
function detail(code) {
  const it = items.find((i) => i.code === code), s = PR.series[code], r = rec[code], f = F.products[code], box = document.getElementById('detail');
  const decision = r ? (r[pc.hold] ? '<span class="tag hold">Hold</span>' : `<span class="tag ${r[pc.percent_change] > 0 ? 'up' : 'down'}">${fmt.spct(r[pc.percent_change])}</span>`) : '–';
  box.innerHTML = `<div class="card"><div class="card-head"><div><h3>${it.name || code}</h3><div class="card-sub">${code} · ${decision}</div></div></div>
   <div class="chart"><canvas id="c-p"></canvas></div><div class="src">Weekly units and small-order list price · source: gold/product_week_features</div></div>
   <div class="card"><div class="stat-line"><span>Total units</span><b>${fmt.int(it.units)}</b></div><div class="stat-line"><span>Revenue proxy</span><b>${fmt.gbp(it.revenue, 0)}</b></div>
   <div class="stat-line"><span>Weeks in panel / with zero sales</span><b>${it.weeks} / ${it.zero}</b></div>
   <div class="stat-line"><span>Elasticity</span><b>${r && r[pc.identified] ? `${fmt.num(r[pc.elasticity])} (${fmt.num(r[pc.ci_lower])} to ${fmt.num(r[pc.ci_upper])})` : 'not identified'}</b></div>
   <div class="stat-line"><span>Next-week forecast</span><b>${f ? fmt.num(f.at(-1)[2], 1) + ' units' : 'not in top-400 explorer'}</b></div>
   ${r ? `<div class="note mt">${r[pc.reason]}</div>` : ''}
   <p style="margin:14px 0 0"><a href="pricing.html#${encodeURIComponent(code)}">Open in Pricing →</a>${f ? ` · <a href="forecast.html#${encodeURIComponent(code)}">Open in Forecast →</a>` : ''}</p></div>`;
  chart('c-p', { type: 'line', data: { labels: s[1].map((_, i) => weekLabel(O.weeks[s[0] + i])), datasets: [{ label: 'Units', data: s[1], borderColor: C.indigo, backgroundColor: (c) => App.gradient(c.chart.ctx, C.indigo, 300), fill: true, tension: .3, yAxisID: 'y' }, { label: 'List price (£)', data: s[2], borderColor: C.orange, stepped: true, spanGaps: true, yAxisID: 'y1' }] },
    options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: axes().y, y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => '£' + v } } }, plugins: { legend: App.legend() } } });
}
['q', 'sk'].forEach((id) => document.getElementById(id).addEventListener('input', () => { page = 0; render(); }));
document.getElementById('prev').onclick = () => { page--; render(); }; document.getElementById('next').onclick = () => { page++; render(); };
document.getElementById('export').onclick = () => App.download('products.csv', [['code', 'name', 'units', 'revenue_proxy', 'avg_list_price', 'weeks', 'zero_weeks']].concat(PR.rows));
const want = decodeURIComponent(location.hash.slice(1));
selected = items.some((i) => i.code === want) ? want : items[0].code; render(); detail(selected);
const hit = list().findIndex((i) => i.code === selected); if (hit >= 0) { page = Math.floor(hit / PAGE); render(); }
