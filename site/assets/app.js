/* Shared shell, theme, formatters, chart + art helpers for the Dynamic Pricing Analytics site. */
(function () {
  const ICON = {
    home: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    demand: '<path d="M4 19V5M4 19h16"/><path d="M8 15l3.5-4.5 3 3L19 7"/>',
    customers: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.6.6 2.6 2.2 2.9 4.6"/>',
    products: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>',
    forecast: '<path d="M3 12h4l2.2-6.5 4 13L15.5 12H21"/>',
    lab: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.3 1.3 0 0 0 1.1 2h11.8A1.3 1.3 0 0 0 19 19l-5.5-9.5v-6"/><path d="M7.5 15h9"/>',
    elasticity: '<path d="M3 17c3-9 6-12 9-9s6 3 9-5"/><path d="M3 21h18"/>',
    pricing: '<path d="M3.5 12V4.5H11l9.5 9.5-7 7z"/><circle cx="7.8" cy="8.8" r="1.2"/>',
    impact: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    data: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>',
    about: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.4v.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
  const NAV = [
    ['Overview', [['home', 'index.html', 'Home'], ['demand', 'demand.html', 'Demand'], ['customers', 'customers.html', 'Customers & orders'], ['products', 'products.html', 'Products']]],
    ['Forecasting', [['forecast', 'forecast.html', 'Forecast'], ['lab', 'lab.html', 'Forecast lab']]],
    ['Pricing', [['elasticity', 'elasticity.html', 'Elasticity'], ['pricing', 'pricing.html', 'Recommendations'], ['impact', 'impact.html', 'Impact']]],
    ['Reference', [['data', 'data.html', 'Data & limits'], ['about', 'about.html', 'Method']]],
  ];
  const fmt = {
    int: (v) => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-GB')),
    gbp: (v, d = 2) => (v == null || !isFinite(v) ? '–' : (v < 0 ? '−' : '') + '£' + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })),
    compact: (v) => (v == null ? '–' : Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v)),
    pct: (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v * 100).toFixed(d) + '%'),
    spct: (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%'),
    num: (v, d = 2) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d)),
    date: (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
  const monthLabel = (s) => { const [y, m] = s.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
  const weekLabel = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nice = (s) => cap(String(s || '').toLowerCase());

  /* ---------- theme ---------- */
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const systemDark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = () => document.documentElement.getAttribute('data-theme') || (systemDark() ? 'dark' : 'light');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function col() {
    return { green: css('--green'), orange: css('--orange'), amber: css('--amber'), slate: css('--slate'), violet: css('--violet'), red: css('--red'), lime: css('--lime'),
      ink: css('--ink'), muted: css('--muted'), grid: css('--grid'), card: css('--card'), soft: css('--soft'), border: css('--border'), faint: css('--faint') };
  }
  const withAlpha = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function chartDefaults() {
    if (!window.Chart) return;
    const C = col(), D = Chart.defaults;
    D.font.family = '"Outfit","Urbanist","Inter",system-ui,sans-serif'; D.font.size = 12; D.font.weight = 300;
    D.color = C.muted; D.borderColor = C.grid;
    D.plugins.legend.display = false;
    Object.assign(D.plugins.tooltip, { backgroundColor: C.card, titleColor: C.ink, bodyColor: C.muted, borderColor: C.border, borderWidth: 1, padding: 11, cornerRadius: 6, boxPadding: 5, usePointStyle: true, titleFont: { weight: 400 } });
    D.elements.line.borderWidth = 1.6; D.elements.point.radius = 0; D.elements.point.hoverRadius = 4;
    D.interaction = { mode: 'index', intersect: false };
  }
  const axes = (yFmt, o = {}) => { const C = col(); return {
    x: { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { maxTicksLimit: 9, maxRotation: 0, padding: 8 }, ...(o.x || {}) },
    y: { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { callback: yFmt || ((v) => fmt.compact(v)), maxTicksLimit: 6, padding: 8 }, ...(o.y || {}) } }; };
  const legend = () => ({ display: true, align: 'start', labels: { usePointStyle: false, boxWidth: 22, boxHeight: 3, padding: 16, generateLabels: (c) => Chart.defaults.plugins.legend.labels.generateLabels(c).map((l) => { const ds = c.data.datasets[l.datasetIndex]; const bar = (ds.type || c.config.type) === 'bar'; return { ...l, fillStyle: bar ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) : l.strokeStyle, strokeStyle: 'transparent', lineWidth: 0, borderRadius: 2 }; }) } });
  const charts = {};
  const chart = (id, cfg) => { if (charts[id]) charts[id].destroy(); const el = document.getElementById(id); if (!el) return null; charts[id] = new Chart(el, cfg); return charts[id]; };
  const destroyCharts = () => { Object.values(charts).forEach((c) => c.destroy()); for (const k in charts) delete charts[k]; };
  const gradient = (ctx, color, h = 300) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, withAlpha(color, 0.22)); g.addColorStop(1, withAlpha(color, 0)); return g; };

  /* ---------- line-art for tiles ---------- */
  const A = 'stroke="#fff" fill="none" stroke-linecap="round"';
  const art = {
    sphere(cx = 300, cy = 150, r = 95) {
      let s = '';
      for (let k = 0; k < 7; k++) s += `<ellipse cx="${cx}" cy="${cy}" rx="${(r * Math.abs(Math.cos((k * Math.PI) / 7))).toFixed(1)}" ry="${r}" ${A} stroke-opacity=".5" stroke-width=".9"/>`;
      for (let l = -0.8; l <= 0.81; l += 0.2) { const rx = r * Math.sqrt(1 - l * l); s += `<ellipse cx="${cx}" cy="${(cy + r * l).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * 0.17).toFixed(1)}" ${A} stroke-opacity=".5" stroke-width=".9"/>`; }
      return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">${s}<circle cx="${cx}" cy="${cy + r * 0.0}" r="3.5" fill="#d8f56a"/></svg>`;
    },
    waves(n = 7) {
      let s = '';
      for (let k = 0; k < n; k++) { let d = ''; for (let x = 0; x <= 400; x += 8) { const y = 150 + Math.sin(x / 38 + k * 0.45) * (34 - k * 3.2) * Math.cos((x - 200) / 260); d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1); } s += `<path d="${d}" ${A} stroke-opacity="${(0.75 - k * 0.07).toFixed(2)}" stroke-width="1"/>`; }
      return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">${s}<circle cx="2" cy="150" r="3.5" fill="#d8f56a"/><circle cx="398" cy="150" r="3.5" fill="#d8f56a"/></svg>`;
    },
    arcs() {
      let s = '';
      for (let k = 1; k <= 7; k++) { const r = 28 + k * 22; s += `<path d="M ${200 - r} 280 A ${r} ${r * 0.9} 0 0 1 ${200 + r} 280" ${A} stroke-opacity="${(0.8 - k * 0.07).toFixed(2)}" stroke-width="1"/>`; }
      for (let k = 0; k < 11; k++) s += `<circle cx="${40 + k * 32}" cy="282" r="${k === 0 || k === 9 ? 3.6 : 2}" fill="${k === 0 ? '#d8f56a' : '#fff'}" fill-opacity=".85"/>`;
      return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
    },
    rings() {
      let s = '';
      for (let k = 0; k < 16; k++) s += `<circle cx="${230 + Math.cos(k / 2.5) * 22}" cy="${150 + Math.sin(k / 2.5) * 22}" r="${36 + k * 5}" ${A} stroke-opacity="${(0.55 - k * 0.025).toFixed(2)}" stroke-width=".9"/>`;
      return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
    },
    bars() {
      let s = '';
      for (let k = 0; k < 26; k++) { const h = 30 + 90 * Math.abs(Math.sin(k * 0.55) * Math.cos(k * 0.21)); s += `<line x1="${22 + k * 14}" x2="${22 + k * 14}" y1="290" y2="${290 - h}" ${A} stroke-opacity=".6" stroke-width="1.6"/>`; }
      return `<svg class="art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">${s}</svg>`;
    },
  };
  const tile = ({ cls = 'green', label, badge = '', value, text, art: a, small, extra = '' }) => `<div class="tile ${cls} ${extra}"><div class="k"><span>${label}</span><span>${badge}</span></div><div class="n ${small ? 's' : ''}">${value}</div><div class="d">${text}</div>${a || ''}</div>`;
  const spark = (values, color, id) => {
    const v = values.filter((x) => x != null), mn = Math.min(...v), mx = Math.max(...v), w = 300, h = 64, p = 4;
    const pts = values.map((y, i) => (y == null ? null : [(i / (values.length - 1)) * w, h - p - ((y - mn) / (mx - mn || 1)) * (h - 2 * p)])).filter(Boolean);
    const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${line}L${w} ${h}L0 ${h}Z" fill="${withAlpha(color, 0.12)}"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const card = (title, sub, body, { cls = '', tools = '' } = {}) => `<div class="card ${cls}"><div class="card-head"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${tools}</div>${body}</div>`;
  const statLine = (a, b) => `<div class="stat-line"><span>${a}</span><b>${b}</b></div>`;
  const banner = (html) => `<div class="card banner"><div class="ic">${icon('warn')}</div><p>${html}</p></div>`;

  function heatmap(el, matrix, { rows, cols, color = 'green', tip = (v) => v, showCols, cell } ) {
    const C = col(), base = C[color], max = Math.max(...matrix.flat(), 1);
    const n = cols.length; el.className = 'heat'; el.style.gridTemplateColumns = `auto repeat(${n}, minmax(10px,1fr))`;
    let h = '<span></span>' + cols.map((c, i) => `<span class="cl">${!showCols || showCols(i) ? c : ''}</span>`).join('');
    matrix.forEach((r, ri) => { h += `<span class="rl">${rows[ri]}</span>` + r.map((v, ci) => `<span class="c" title="${esc(rows[ri] + ' · ' + cols[ci] + ': ' + tip(v))}" style="${cell ? `aspect-ratio:auto;height:${cell}px;` : ''}background:${v ? withAlpha(base, 0.1 + 0.9 * (v / max)) : C.soft}"></span>`).join(''); });
    el.innerHTML = h;
  }

  function table({ el, columns, rows, pageSize = 12, sortKey, dir = -1, onSelect, selected }) {
    const st = { rows, page: 0, sortKey, dir, selected };
    const root = typeof el === 'string' ? document.getElementById(el) : el;
    root.innerHTML = `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}" data-k="${c.key}">${c.label}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="pager"><span class="info"></span><button class="prev">Prev</button><button class="next">Next</button></div>`;
    const tb = root.querySelector('tbody');
    function draw() {
      const col_ = columns.find((c) => c.key === st.sortKey), list = [...st.rows];
      if (col_) list.sort((a, b) => { const x = a[st.sortKey], y = b[st.sortKey]; return (x == null) - (y == null) || (x > y ? st.dir : x < y ? -st.dir : 0); });
      const pages = Math.max(1, Math.ceil(list.length / pageSize)); st.page = Math.min(st.page, pages - 1);
      const slice = list.slice(st.page * pageSize, (st.page + 1) * pageSize);
      tb.innerHTML = slice.map((r) => `<tr data-id="${esc(r.id)}" class="${r.id === st.selected ? 'sel' : ''}">${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : r[c.key]}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}" class="empty">No items match</td></tr>`;
      root.querySelector('.info').textContent = `${fmt.int(list.length)} items · page ${st.page + 1} of ${pages}`;
      root.querySelector('.prev').disabled = st.page === 0; root.querySelector('.next').disabled = st.page >= pages - 1;
      tb.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => { st.selected = tr.dataset.id; draw(); onSelect && onSelect(list.find((r) => String(r.id) === tr.dataset.id)); }));
      st.list = list;
    }
    root.querySelector('.prev').onclick = () => { st.page--; draw(); };
    root.querySelector('.next').onclick = () => { st.page++; draw(); };
    root.querySelectorAll('th').forEach((th) => (th.onclick = () => { st.dir = st.sortKey === th.dataset.k ? -st.dir : -1; st.sortKey = th.dataset.k; st.page = 0; draw(); }));
    draw();
    return { setRows(r) { st.rows = r; st.page = 0; draw(); }, select(id) { st.selected = id; const i = st.list.findIndex((r) => String(r.id) === String(id)); if (i >= 0) st.page = Math.floor(i / pageSize); draw(); } };
  }

  function download(name, rows) {
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' })); a.download = name; a.click(); } catch (e) {}
  }

  /* ---------- page shell ---------- */
  function page(cfg, build) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => page(cfg, build)); return; }
    const { id, title, sub, tags = [] } = cfg;
    const mode = store.get('dpa-theme'); if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
    const nav = NAV.map(([label, items]) => `<div class="nav-label">${label}</div>` + items.map(([k, href, text]) => `<a href="${href}" class="${k === id ? 'on' : ''}"><span class="ico">${icon(k)}</span>${text}</a>`).join('')).join('');
    document.body.innerHTML = `<div class="app"><aside class="side">
      <a class="brand" href="index.html"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="3"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(16 + Math.cos(a) * 7).toFixed(1)} ${(16 + Math.sin(a) * 7).toFixed(1)}L${(16 + Math.cos(a) * 12).toFixed(1)} ${(16 + Math.sin(a) * 12).toFixed(1)}"/>`; }).join('')}</svg></span><span><b>Dynamic Pricing</b><small>Analytics</small></span></a>
      <div class="gsearch">${icon('search')}<input type="text" id="gsearch" placeholder="Find a product" autocomplete="off"><div class="results" id="gresults"></div></div>
      <nav class="nav">${nav}</nav>
      <div class="side-foot"><span><span class="chip">Research project</span></span><span>Online Retail II, 2009–2011. Revenue effects are model estimates, not measured results.</span></div></aside>
      <main class="main"><div class="head"><div><h1>${title}</h1><p>${sub}</p></div><div class="theme"><button id="t-light" title="Light">${icon('sun')}</button><button id="t-dark" title="Dark">${icon('moon')}</button></div></div>
      <div class="tags">${tags.map((t) => `<span>${t}</span>`).join('')}</div><div id="content"></div></main></div>`;
    const root = document.getElementById('content');
    const sync = () => { document.getElementById('t-light').classList.toggle('on', theme() === 'light'); document.getElementById('t-dark').classList.toggle('on', theme() === 'dark'); };
    const run = () => { destroyCharts(); chartDefaults(); sync(); build(root); };
    const setMode = (m) => { document.documentElement.setAttribute('data-theme', m); store.set('dpa-theme', m); run(); };
    document.getElementById('t-light').onclick = () => setMode('light');
    document.getElementById('t-dark').onclick = () => setMode('dark');
    const input = document.getElementById('gsearch'), box = document.getElementById('gresults');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase(); const rows = (window.DPA && DPA.search && DPA.search.rows) || [];
      if (q.length < 2) { box.style.display = 'none'; return; }
      const hits = rows.filter((r) => String(r[0]).toLowerCase().includes(q) || String(r[1] || '').toLowerCase().includes(q)).slice(0, 8);
      box.innerHTML = hits.map((r) => `<a href="products.html#${encodeURIComponent(r[0])}"><span>${esc(nice(r[1]))}</span><small>${esc(r[0])}</small></a>`).join('') || '<a><small>No match</small></a>';
      box.style.display = 'block';
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.gsearch')) box.style.display = 'none'; });
    run();
  }
  window.App = { icon, fmt, col, withAlpha, axes, legend, chart, gradient, art, tile, spark, card, statLine, banner, heatmap, table, download, page, monthLabel, weekLabel, cap, esc, nice };
})();
