(() => {
const { fmt, tile, art, card, chart, axes, col, withAlpha, nice, esc } = App;
const PR = DPA.products, P = DPA.pricing, pc = Object.fromEntries(P.columns.map((c, i) => [c, i]));
const rec = Object.fromEntries(P.rows.map((r) => [r[0], r]));
const totalUnits = PR.rows.reduce((a, r) => a + r[2], 0), totalRev = PR.rows.reduce((a, r) => a + r[3], 0);
const top = PR.rows.slice(0, 50).map((r, i) => ({ id: r[0], rank: i + 1, name: nice(r[1]), units: r[2], revenue: r[3], price: r[4], weeks: r[5], share: r[2] / totalUnits, rec: rec[r[0]] }));
App.view('topproducts', { title: 'Top products', sub: 'The 50 products with the most units sold over the whole period. Click a row to open the product.', tags: ['Ranked by units', 'Revenue proxy = units × small-order list price', 'Source: gold product-week features'] }, (root) => {
  let shown = 10;
  const C = col(), u50 = top.reduce((a, r) => a + r.units, 0), r50 = top.reduce((a, r) => a + r.revenue, 0), chg = top.filter((r) => r.rec && !r.rec[pc.hold]).length;
  root.innerHTML = `
  <div class="grid g4">
    ${tile({ cls: 'green mini', label: 'Share of units', value: fmt.pct(u50 / totalUnits, 0), text: `held by the top 50 of ${fmt.int(PR.rows.length)} products`, art: art.waves(5) })}
    ${tile({ cls: 'amber mini', label: 'Share of revenue', value: fmt.pct(r50 / totalRev, 0), text: 'revenue proxy, top 50', art: art.bars() })}
    ${tile({ cls: 'coral mini', label: 'Best seller', value: fmt.compact(top[0].units), text: esc(top[0].name.slice(0, 34)), art: art.arcs() })}
    ${tile({ cls: 'slate mini', label: 'With a price change', value: String(chg), text: 'of the top 50 are recommended a new price', art: art.rings() })}</div>
  <div class="grid mt">${card('Top 20 by units', 'Units sold, best seller first', '<div class="chart lg"><canvas id="c-top"></canvas></div>')}</div>
  <h2 style="font-size:26px;font-weight:300;margin:44px 0 6px">Product leaderboard</h2>
  <p style="margin:0 0 22px;color:var(--muted)">Ranked by units sold. Each card shows the product's volume, revenue proxy, average price and current price decision. Click a card to open the product.</p>
  <div class="pgrid" id="pgrid"></div>
  <div class="more" id="more"></div>`;
  const palette = [C.green, C.amber, C.slate, C.orange, C.violet], maxU = top[0].units;
  const draw = () => {
    document.getElementById('pgrid').innerHTML = top.slice(0, shown).map((r) => {
      const rc = r.rec, hold = !rc || rc[pc.hold], ch = hold ? 0 : rc[pc.percent_change], ac = hold ? palette[(r.rank - 1) % palette.length] : ch > 0 ? C.green : C.orange;
      const dec = !rc ? '<span class="tag hold">No decision</span>' : hold ? '<span class="tag hold">Hold</span>' : `<span class="tag ${ch > 0 ? 'up' : 'down'}">Price ${fmt.spct(ch)}</span>`;
      return `<a class="pcard" href="demand.html#p-${encodeURIComponent(r.id)}" style="--ac:${ac}">
        <div class="top"><span class="rank">${r.rank}</span><div><h4>${esc(r.name.slice(0, 48))}</h4><div class="code">Code ${esc(r.id)}</div></div></div>
        <div class="bar"><div class="l"><span>Units sold</span><b>${fmt.int(r.units)}</b></div><div class="track"><div class="fill" style="width:${r.units / maxU * 100}%;background:linear-gradient(90deg,${ac},${withAlpha(ac, 0.45)})"></div></div></div>
        <div class="stats"><div><small>Share of units</small><b>${fmt.pct(r.share, 2)}</b></div><div><small>Revenue proxy</small><b>${fmt.gbp(r.revenue, 0)}</b></div><div><small>Avg list price</small><b>${fmt.gbp(r.price)}</b></div><div><small>Weeks sold</small><b>${r.weeks}</b></div></div>
        <div class="foot"><span>Price decision</span>${dec}</div></a>`;
    }).join('');
    document.getElementById('more').innerHTML = `<span>Showing ${shown} of ${top.length} products</span>` + (shown < top.length ? `<button class="btn" id="more-btn">Show ${Math.min(10, top.length - shown)} more</button>` : '') + (shown > 10 ? '<button class="btn ghost" id="less-btn">Show fewer</button>' : '');
    const m = document.getElementById('more-btn'); if (m) m.onclick = () => { shown = Math.min(top.length, shown + 10); draw(); };
    const l = document.getElementById('less-btn'); if (l) l.onclick = () => { shown = 10; draw(); window.scrollTo({ top: document.getElementById('pgrid').offsetTop - 120, behavior: 'smooth' }); };
  };
  draw();
  chart('c-top', { type: 'bar', data: { labels: top.slice(0, 20).map((r) => r.name.slice(0, 42)), datasets: [{ label: 'Units', data: top.slice(0, 20).map((r) => r.units), backgroundColor: top.slice(0, 20).map((r, i) => [C.green, C.amber, C.slate, C.orange, C.violet][i % 5]), borderRadius: 6, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: axes().y, y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false } } }, plugins: { tooltip: { callbacks: { label: (c) => ` ${fmt.int(c.parsed.x)} units · ${fmt.pct(top[c.dataIndex].share, 1)} of all units` } } } } });
});
})();
