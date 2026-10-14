(() => {
const { fmt, tile, art, col } = App;
const O = DPA.overview, F = DPA.forecast, P = DPA.pricing, Cu = DPA.customers, SM = P.summary, K = O.kpis;
const M = Object.fromEntries(F.metrics.map((m) => [m.model, m]));
App.view('summary', { title: 'Dynamic Pricing Analytics', sub: 'Demand forecasting and explainable price recommendations for an online retailer, built on 1M real transactions.',
  tags: [`${fmt.int(K.products)} products`, `${K.weeks} weeks of demand`, `${F.metrics.length} forecast models`, 'Rolling-origin backtest', 'Guardrail ±10%'] }, (root) => {
  const C = col();
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
  <div class="note mt2 ${M.lightgbm.wape < M.moving_average_4.wape ? 'ok' : 'warn'}">${M.lightgbm.wape < M.moving_average_4.wape ? '<b>LightGBM beats the baselines</b> on test WAPE.' : '<b>LightGBM does not beat the 4-week moving average</b> on test WAPE.'} Revenue figures are model estimates, not measured results. Use <b>Demand &amp; forecast</b> and <b>Pricing</b> in the sidebar for the detail.</div>`;
});
})();
