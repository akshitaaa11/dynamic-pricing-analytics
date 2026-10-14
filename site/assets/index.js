const { fmt, tile, art, card, spark, icon, col, chart, axes, withAlpha } = App;
const O = DPA.overview, F = DPA.forecast, P = DPA.pricing, Cu = DPA.customers, SM = P.summary, K = O.kpis;
const M = Object.fromEntries(F.metrics.map((m) => [m.model, m]));
App.page({ id: 'home', title: 'Dynamic Pricing Analytics', sub: 'Demand forecasting and explainable price recommendations for an online retailer, built on 1M real transactions.',
  tags: [`${fmt.int(K.products)} products`, `${K.weeks} weeks of demand`, `${F.metrics.length} forecast models`, 'Rolling-origin backtest', 'Guardrail ±10%'] }, (root) => {
  const C = col();
  const wk = O.weekly.units.slice(1, -1), links = [
    ['demand', 'Demand', 'Seasonality, trend and product concentration across two years.', spark(wk, C.green)],
    ['forecast', 'Forecast', 'LightGBM against simple baselines, with 80% prediction intervals.', spark(F.aggregate.lightgbm, C.orange)],
    ['elasticity', 'Elasticity', 'How demand responds to price, shrunk toward the pooled estimate.', spark(P.rows.filter((r) => r[P.columns.indexOf('identified')]).map((r) => r[P.columns.indexOf('elasticity')]).sort((a, b) => a - b), C.slate)],
    ['pricing', 'Recommendations', 'Per-product price decisions with a stated reason and confidence.', spark(Object.values(P.hold_reasons), C.amber)],
    ['customers', 'Customers & orders', 'Country mix, order timing and basket values.', spark(Cu.monthly.customers, C.violet)],
    ['impact', 'Impact', 'What the recommended changes are worth, and how sure we are.', spark(Cu.monthly.revenue, C.green)],
  ];
  root.innerHTML = `
  <div class="hero">
    <div class="card hero-copy"><span><span class="chip">Research project</span></span>
      <h2>Price smarter with real demand data</h2>
      <p class="lead">A Spark and LightGBM pipeline that forecasts weekly product demand, estimates price elasticity from observed list-price changes, and recommends changes only where the evidence holds.</p>
      <div class="feat">
        <div class="r"><span class="dot"></span><span class="tt"><span class="t">Weekly demand forecast</span><span class="s">LightGBM + baselines</span></span><span class="chip grey plain">${F.metrics.length} models</span></div>
        <div class="r"><span class="dot"></span><span class="tt"><span class="t">Rolling-origin backtest</span><span class="s">refit before every block</span></span><span class="chip grey plain">${M.lightgbm.folds} blocks</span></div>
        <div class="r"><span class="dot"></span><span class="tt"><span class="t">Fixed-effects elasticity</span><span class="s">product + week effects</span></span><span class="chip grey plain">${fmt.int(SM.identified)} identified</span></div>
      </div></div>
    <div class="tiles">
      ${tile({ cls: 'green tall', label: 'Identified elasticities', badge: 'Pricing', value: fmt.int(SM.identified), text: `Products with a price response whose 90% interval is entirely below zero, out of ${fmt.int(SM.products)}.`, art: art.sphere(250, 200, 105) })}
      ${tile({ cls: 'amber', label: 'Price changes', badge: 'Guardrailed', value: fmt.int(SM.recommended), text: `Recommended within ±${P.guardrails.max_price_change_pct * 100}%. The rest are held.`, art: art.waves() })}
      ${tile({ cls: 'coral', label: 'Products', badge: 'Weekly panel', value: fmt.int(K.products), text: `${fmt.compact(K.units)} units over ${K.weeks} weeks.`, art: art.arcs() })}
      ${tile({ cls: 'olive wide', label: 'Interval coverage', badge: 'Forecast', value: fmt.pct(M.lightgbm.coverage_80, 0), text: 'Share of test product-weeks that landed inside the 80% prediction interval.', art: art.rings() })}
    </div></div>
  <div class="grid g3 mt2">${links.map(([id, t, d, s]) => `<a class="card link-card" href="${id === 'home' ? 'index' : id}.html"><div class="top"><span class="ico">${icon(id)}</span><h4>${t}</h4><span class="go">${icon('arrow').replace('<svg', '<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:1.5"')}</span></div><p>${d}</p>${s}</a>`).join('')}</div>
  <div class="grid g-wide mt">
    ${card('Forecast accuracy', 'WAPE on the Sept–Nov 2011 test weeks. Lower is better.', '<div class="chart sm"><canvas id="c-wape"></canvas></div>')}
    <div class="card"><div class="card-head"><div><h3>What to know first</h3></div></div>
      <div class="note ${M.lightgbm.wape < M.moving_average_4.wape ? 'ok' : 'warn'}">${M.lightgbm.wape < M.moving_average_4.wape ? '<b>LightGBM beats the baselines</b> on test WAPE.' : '<b>LightGBM does not beat the 4-week moving average</b> on test WAPE. Both are shown side by side on the Forecast page.'}</div>
      ${App.statLine('Price changes recommended', fmt.int(SM.recommended))}${App.statLine('Held, with a reason', fmt.int(SM.held))}${App.statLine('Held-out price check', fmt.pct(P.check.sign_agreement, 0) + ' direction hits')}${App.statLine('Revenue basis', 'Proxy, not profit')}</div></div>`;
  const order = [...F.metrics].sort((a, b) => a.wape - b.wape), label = { lightgbm: 'LightGBM', seasonal_naive: 'Seasonal naive', moving_average_4: '4-week average', moving_average_13: '13-week average' };
  chart('c-wape', { type: 'bar', data: { labels: order.map((m) => label[m.model]), datasets: [{ data: order.map((m) => m.wape * 100), backgroundColor: order.map((m) => (m.model === 'lightgbm' ? C.orange : withAlpha(C.green, 0.75))), borderRadius: 4, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { ...axes().y, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false }, border: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` WAPE ${c.parsed.x.toFixed(1)}%` } } } } });
});
