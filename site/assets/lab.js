(() => {
const { fmt, card, chart, axes, legend, col, withAlpha, weekLabel, nice, esc } = App;
const F = DPA.forecast, O = DPA.overview, S = DPA.products.series, names = Object.fromEntries(DPA.search.rows.map((r) => [r[0], r[1]]));
const L = { moving_average_4: '4-week average', lightgbm: 'LightGBM only' };
App.view('lab', { title: 'Forecast lab', sub: 'Pick one of the 400 highest-volume products and compare its forecast with what happened.', tags: ['Actual vs LightGBM vs 4-week average', '80% prediction interval from quantile models', 'Test weeks only are forecasts'] }, (root) => {
  const C = col(), codes = Object.keys(F.products);
  const want = App.arg('lab'), keep = (window.__labSel && codes.includes(window.__labSel)) ? window.__labSel : null;
  const start = keep || (codes.includes(want) ? want : codes[0]);
  root.innerHTML = `<div class="card"><div class="picker"><div><label for="psel">Product</label><select id="psel">${codes.map((c) => `<option value="${c}" ${c === start ? 'selected' : ''}>${esc(nice(names[c] || ''))} · ${c}</option>`).join('')}</select></div>
    <div><label for="msel">Compare against</label><select id="msel"><option value="moving_average_4">4-week moving average</option><option value="lightgbm">LightGBM only (no baseline)</option></select></div></div></div>
  <div class="card kline mt" id="kp"></div>
  <div class="grid mt">${card('Actual, forecast and interval', 'Last 26 weeks before the test period, then the 12 test weeks', '<div class="chart lg"><canvas id="c-prod"></canvas></div>')}</div>
  <div class="grid mt">${card('Forecast error by week', 'Forecast minus actual, units. Bars above zero are over-forecasts.', '<div class="chart"><canvas id="c-err"></canvas></div><div id="stats" style="margin-top:14px"></div>')}</div>
  <div class="note mt">The shaded band is the 80% prediction interval from separate quantile models; roughly eight in ten actual values should land inside it. Weeks are forecast one step ahead from the lags known at that time, and the model is refit every four weeks using only earlier data.</div>`;
  const kpi = (n, v, s) => App.stat({ label: n, value: v, text: s });
  function show(code) {
    window.__labSel = code; const rows = F.products[code], first = rows[0][0], s = S[code], from = Math.max(first - 26, s ? s[0] : first), to = rows.at(-1)[0];
    const idx = []; for (let i = from; i <= to; i++) idx.push(i);
    const at = Object.fromEntries(rows.map((r) => [r[0], r])), val = (i) => (s && s[1][i - s[0]] != null ? s[1][i - s[0]] : null), cmp = document.getElementById('msel').value === 'moving_average_4';
    const act = rows.reduce((a, r) => a + r[1], 0), absL = rows.reduce((a, r) => a + Math.abs(r[2] - r[1]), 0), absB = rows.reduce((a, r) => a + Math.abs(r[5] - r[1]), 0), inside = rows.filter((r) => r[1] >= r[3] && r[1] <= r[4]).length, bias = rows.reduce((a, r) => a + (r[2] - r[1]), 0) / rows.length;
    document.getElementById('kp').innerHTML = kpi('Units sold in test weeks', fmt.int(act), `${rows.length} weeks`) + kpi('LightGBM WAPE', act ? fmt.pct(absL / act, 0) : '–', 'this product') + kpi('4-week average WAPE', act ? fmt.pct(absB / act, 0) : '–', 'this product') + kpi('Inside 80% interval', fmt.pct(inside / rows.length, 0), `${inside} of ${rows.length} weeks`);
    document.getElementById('stats').innerHTML = App.statLine('Average bias (forecast − actual)', fmt.num(bias, 1) + ' units') + App.statLine('Mean interval width', fmt.num(rows.reduce((a, r) => a + r[4] - r[3], 0) / rows.length, 0) + ' units');
    const ds = [{ label: 'Lower', data: idx.map((i) => at[i]?.[3] ?? null), borderColor: 'transparent', pointRadius: 0, tension: .3 }, { label: '80% interval', data: idx.map((i) => at[i]?.[4] ?? null), borderColor: 'transparent', backgroundColor: withAlpha(C.orange, 0.16), fill: '-1', pointRadius: 0, tension: .3 }, { label: 'Actual', data: idx.map(val), borderColor: C.green, tension: .3 }, { label: 'LightGBM', data: idx.map((i) => at[i]?.[2] ?? null), borderColor: C.orange, tension: .3, spanGaps: true }];
    if (cmp) ds.push({ label: '4-week average', data: idx.map((i) => at[i]?.[5] ?? null), borderColor: C.slate, borderDash: [5, 4], tension: .3, spanGaps: true });
    const lg = legend(); lg.labels.filter = (l) => l.text !== 'Lower';
    chart('c-prod', { type: 'line', data: { labels: idx.map((i) => weekLabel(O.weeks[i])), datasets: ds }, options: { maintainAspectRatio: false, scales: axes((v) => fmt.int(v)), plugins: { legend: lg, tooltip: { filter: (t) => t.dataset.label !== 'Lower' } } } });
    chart('c-err', { type: 'bar', data: { labels: rows.map((r) => weekLabel(O.weeks[r[0]])), datasets: [{ label: 'LightGBM', data: rows.map((r) => r[2] - r[1]), backgroundColor: withAlpha(C.orange, 0.85), borderRadius: 3 }].concat(cmp ? [{ label: '4-week average', data: rows.map((r) => r[5] - r[1]), backgroundColor: withAlpha(C.slate, 0.6), borderRadius: 3 }] : []) }, options: { maintainAspectRatio: false, scales: { x: { ...axes().x, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: axes((v) => fmt.int(v)).y }, plugins: { legend: legend() } } });
  }
  document.getElementById('psel').onchange = (e) => show(e.target.value); document.getElementById('msel').onchange = () => show(document.getElementById('psel').value);
  show(start);
});
})();
