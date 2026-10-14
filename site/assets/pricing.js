const { fmt, kpi, C, chart, axes, weekLabel } = App;
const P = DPA.pricing, S = DPA.products.series, O = DPA.overview, F = DPA.forecast;
const col = Object.fromEntries(P.columns.map((c, i) => [c, i]));
const names = Object.fromEntries(DPA.products.rows.map((r) => [r[0], r[1]]));
const rows = P.rows.map((r) => Object.fromEntries(P.columns.map((c, i) => [c, r[i]])));
const SM = P.summary, G = P.guardrails;
const root = App.shell({ page: 'pricing', title: 'Pricing', subtitle: 'Explainable recommendations: forecast × elasticity inside guardrails', actions: `<button class="pill btn" id="export">${App.icon('download')} Export recommendations</button>` });
const ups = rows.filter((r) => !r.hold && r.percent_change > 0).length, downs = rows.filter((r) => !r.hold && r.percent_change < 0).length;
root.innerHTML = `
<div class="grid g5">
 ${kpi({ name: 'Products', sub: 'With a decision', value: fmt.int(SM.products), tone: 'b', ic: 'products' })}
 ${kpi({ name: 'Elasticity identified', sub: '90% CI below zero', value: fmt.int(SM.identified), tone: 'g', ic: 'check' })}
 ${kpi({ name: 'Price changes', sub: `${ups} up · ${downs} down`, value: fmt.int(SM.recommended), tone: 'v', ic: 'pricing' })}
 ${kpi({ name: 'Held', sub: 'With a stated reason', value: fmt.int(SM.held), tone: 'o', ic: 'hold' })}
 ${kpi({ name: 'Pooled elasticity', sub: 'Fixed-effects log-log', value: fmt.num(SM.pooled_elasticity, 2), tone: 'p', ic: 'percent' })}
</div>
<div class="grid g3 mt">
 <div class="card"><div class="card-head"><div><h3>Decisions</h3><div class="card-sub">Change vs hold</div></div></div><div class="chart sm"><canvas id="c-dec"></canvas></div>
  <div class="legend"><div class="row"><span class="dot" style="background:${C.green}"></span><span>Raise price</span><span>${ups}</span></div><div class="row"><span class="dot" style="background:${C.orange}"></span><span>Lower price</span><span>${downs}</span></div><div class="row"><span class="dot" style="background:${C.grey}"></span><span>Hold</span><span>${fmt.int(SM.held)}</span></div></div></div>
 <div class="card"><div class="card-head"><div><h3>Why products are held</h3><div class="card-sub">Reason counts</div></div></div><div class="bars" id="reasons"></div></div>
 <div class="card"><div class="card-head"><div><h3>Held-out price check</h3><div class="card-sub">Elasticities fitted before ${F.periods.test_start}</div></div></div>
  <div class="stat-line"><span>Real test-period price changes</span><b>${fmt.int(P.check.n_price_changes)}</b></div>
  <div class="stat-line"><span>Direction predicted correctly</span><b>${fmt.pct(P.check.sign_agreement)}</b></div>
  <div class="stat-line"><span>Rank correlation</span><b>${fmt.num(P.check.rank_correlation, 2)}</b></div>
  <div class="note mt">Better than chance but modest. Revenue effects are <b>estimates under the model</b>, not measured results; no live price test was possible.</div></div>
</div>
<div class="grid g-wide mt">
 <div class="card"><div class="card-head"><h3>Recommendations</h3></div>
  <div class="toolbar"><input type="text" id="q" placeholder="Filter by code or name"><select id="fd"><option value="all">All decisions</option><option value="chg">Price changes</option><option value="hold">Holds</option></select><select id="fc"><option value="all">Any confidence</option><option>High</option><option>Medium</option><option>Low</option></select></div>
  <div class="table-wrap"><table><thead><tr><th data-s="Stock_Code">Product</th><th class="num" data-s="current_price">Current</th><th class="num" data-s="recommended_price">Suggested</th><th class="num" data-s="percent_change">Change</th><th data-s="confidence">Confidence</th><th class="num" data-s="revenue_gain">Est. revenue</th></tr></thead><tbody id="tb"></tbody></table></div>
  <div class="pager"><span id="pinfo"></span><button id="prev">Prev</button><button id="next">Next</button></div></div>
 <div class="card" id="detail" style="align-self:start;position:sticky;top:16px"></div>
</div>`;
chart('c-dec', { type: 'doughnut', data: { labels: ['Raise', 'Lower', 'Hold'], datasets: [{ data: [ups, downs, SM.held], backgroundColor: [C.green, C.orange, '#e3e5ec'], borderWidth: 0, cutout: '72%' }] }, options: { maintainAspectRatio: false } });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const hr = Object.entries(P.hold_reasons).map(([k, v]) => [cap(k), v]), hm = Math.max(...hr.map((h) => h[1]));
document.getElementById('reasons').innerHTML = hr.map(([k, v], i) => `<div class="bar-row"><div class="l"><b style="font-size:13px">${k}</b><span>${fmt.int(v)}</span></div><div class="track"><div class="fill" style="width:${v / hm * 100}%;background:${[C.indigo, C.violet, C.sky, C.peach, C.orange][i % 5]}"></div></div></div>`).join('');
let sortKey = 'revenue_gain', dir = -1, page = 0, selected = null; const PAGE = 12;
const state = () => {
  const q = document.getElementById('q').value.toLowerCase(), d = document.getElementById('fd').value, c = document.getElementById('fc').value;
  return rows.filter((r) => (!q || r.Stock_Code.toLowerCase().includes(q) || (names[r.Stock_Code] || '').toLowerCase().includes(q)) && (d === 'all' || (d === 'hold') === r.hold) && (c === 'all' || r.confidence === c))
    .sort((a, b) => { const x = a[sortKey], y = b[sortKey]; return (x == null) - (y == null) || (x > y ? dir : x < y ? -dir : 0); });
};
function render() {
  const list = state(), pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(page, pages - 1);
  document.getElementById('tb').innerHTML = list.slice(page * PAGE, page * PAGE + PAGE).map((r) => `<tr data-c="${r.Stock_Code}" class="${r.Stock_Code === selected ? 'sel' : ''}"><td><b style="font-weight:500">${r.Stock_Code}</b><br><small style="color:#8a8e9c">${(names[r.Stock_Code] || '').slice(0, 30)}</small></td><td class="num">${fmt.gbp(r.current_price)}</td><td class="num">${fmt.gbp(r.recommended_price)}</td><td class="num">${r.hold ? '<span class="tag hold">Hold</span>' : `<span class="tag ${r.percent_change > 0 ? 'up' : 'down'}">${fmt.spct(r.percent_change)}</span>`}</td><td><span class="tag ${r.confidence}">${r.confidence}</span></td><td class="num">${r.hold ? '–' : fmt.gbp(r.revenue_gain)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No products match</td></tr>';
  document.getElementById('pinfo').textContent = `${fmt.int(list.length)} products · page ${page + 1} of ${pages}`;
  document.getElementById('prev').disabled = page === 0; document.getElementById('next').disabled = page >= pages - 1;
  document.querySelectorAll('#tb tr[data-c]').forEach((tr) => tr.onclick = () => { selected = tr.dataset.c; render(); detail(selected); });
}
['q', 'fd', 'fc'].forEach((id) => document.getElementById(id).addEventListener('input', () => { page = 0; render(); }));
document.getElementById('prev').onclick = () => { page--; render(); }; document.getElementById('next').onclick = () => { page++; render(); };
document.querySelectorAll('th[data-s]').forEach((th) => th.onclick = () => { dir = sortKey === th.dataset.s ? -dir : -1; sortKey = th.dataset.s; page = 0; render(); });
function detail(code) {
  const r = rows.find((x) => x.Stock_Code === code), box = document.getElementById('detail');
  const s = S[code], factor = r.hold ? 1 : (r.recommended_price / r.current_price) ** r.elasticity;
  const base = r.expected_units == null ? null : r.expected_units / factor;
  const canSim = r.identified && r.min != null && r.max > r.min && base != null;
  box.innerHTML = `<div class="card-head"><div><h3>${(names[code] || code).slice(0, 34)}</h3><div class="card-sub">${code} · <span class="tag ${r.hold ? 'hold' : r.percent_change > 0 ? 'up' : 'down'}">${r.hold ? 'Hold' : fmt.spct(r.percent_change)}</span> <span class="tag ${r.confidence}">${r.confidence} confidence</span></div></div></div>
  <div class="note">${r.reason}</div>
  <div class="stat-line mt"><span>Current → suggested</span><b>${fmt.gbp(r.current_price)} → ${fmt.gbp(r.recommended_price)}</b></div>
  <div class="stat-line"><span>Elasticity (90% CI)</span><b>${r.identified ? `${fmt.num(r.elasticity)} (${fmt.num(r.ci_lower)} to ${fmt.num(r.ci_upper)})` : 'not identified'}</b></div>
  <div class="stat-line"><span>Observed list-price range</span><b>${fmt.gbp(r.min)} – ${fmt.gbp(r.max)}</b></div>
  <div class="stat-line"><span>Binding guardrail</span><b>${(r.binding_guardrail || 'none').replace(/_/g, ' ')}</b></div>
  <div class="chart sm" style="margin-top:12px"><canvas id="c-det"></canvas></div>
  <h3 style="margin-top:18px;font-size:16px">What-if simulator</h3>
  ${canSim ? `<input class="range" type="range" id="sim" min="${r.min}" max="${r.max}" step="0.01" value="${r.current_price}"><div class="card-sub" id="simnote"></div><div class="sim-out"><div><small>Expected units / week</small><b id="su">–</b></div><div><small>Expected revenue / week</small><b id="sr">–</b></div></div>` : '<div class="note">Simulator unavailable: this product has no identified elasticity or no price variation, so a response to price cannot be estimated.</div>'}`;
  if (s) {
    const labels = s[1].map((_, i) => weekLabel(O.weeks[s[0] + i]));
    chart('c-det', { type: 'line', data: { labels, datasets: [{ label: 'Units', data: s[1], borderColor: C.indigo, tension: .3, yAxisID: 'y' }, { label: 'List price (£)', data: s[2], borderColor: C.orange, stepped: true, spanGaps: true, yAxisID: 'y1' }] },
      options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxTicksLimit: 5, maxRotation: 0 } }, y: { ...axes().y, ticks: { maxTicksLimit: 4 } }, y1: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 4, callback: (v) => '£' + v } } }, plugins: { legend: App.legend() } } });
  }
  if (canSim) {
    const sim = document.getElementById('sim'), upd = () => {
      const p = +sim.value, u = base * (p / r.current_price) ** r.elasticity, ch = (p - r.current_price) / r.current_price, out = Math.abs(ch) > G.max_price_change_pct + 1e-9;
      document.getElementById('su').textContent = fmt.num(u, 1); document.getElementById('sr').textContent = fmt.gbp(u * p);
      document.getElementById('simnote').innerHTML = `Price ${fmt.gbp(p)} (${fmt.spct(ch)}) · ${out ? `<span class="badge-no">outside the ±${G.max_price_change_pct * 100}% guardrail</span>` : '<span class="badge-ok">inside guardrails</span>'} · slider limited to the observed range`;
    };
    sim.oninput = upd; upd();
  }
}
document.getElementById('export').onclick = () => App.download('price_recommendations.csv', [P.columns].concat(P.rows));
render();
const want = decodeURIComponent(location.hash.slice(1));
selected = rows.some((r) => r.Stock_Code === want) ? want : (state().find((r) => !r.hold) || rows[0]).Stock_Code; render(); detail(selected);
