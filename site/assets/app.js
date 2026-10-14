/* Shared shell, formatters and chart helpers for the Dynamic Pricing Analytics site. */
(function () {
  const C = { orange: '#f4733c', indigo: '#5b6cf0', violet: '#a77be8', sky: '#9ccbf4', peach: '#f8b27a', green: '#2fb67c', red: '#ef4d4d', grey: '#c4c7d2' };
  const ICON = {
    overview: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    demand: '<path d="M4 19V5M4 19h16M8 15l3-4 3 3 5-7"/>',
    forecast: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    pricing: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    products: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    data: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    units: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    hold: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
  const PAGES = [
    ['overview', 'index.html', 'Overview'], ['demand', 'demand.html', 'Demand'], ['forecast', 'forecast.html', 'Forecast'],
    ['pricing', 'pricing.html', 'Pricing'], ['products', 'products.html', 'Products'], ['data', 'data.html', 'Data & limits'],
  ];
  const fmt = {
    int: (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB')),
    gbp: (v, d = 2) => (v == null ? '–' : '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })),
    compact: (v) => (v == null ? '–' : Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v)),
    pct: (v, d = 1) => (v == null ? '–' : (v * 100).toFixed(d) + '%'),
    spct: (v, d = 1) => (v == null ? '–' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%'),
    num: (v, d = 2) => (v == null ? '–' : Number(v).toFixed(d)),
    date: (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
  const deltaPill = (v) => {
    if (v == null || !isFinite(v)) return '<span class="delta flat">n/a</span>';
    const cls = Math.abs(v) < 0.0005 ? 'flat' : v > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•'} ${fmt.spct(v, 2)}</span>`;
  };
  const kpi = ({ name, sub, value, delta, tone = 'b', ic = 'units' }) => `
    <div class="card kpi"><div class="kpi-top"><div class="chip ${tone}">${icon(ic)}</div>
      <div><div class="kpi-name">${name}</div><div class="kpi-sub">${sub || ''}</div></div></div>
      <div class="kpi-val"><b>${value}</b>${delta === undefined ? '' : deltaPill(delta)}</div></div>`;

  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = '"Outfit","Urbanist","Inter",system-ui,sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#8a8e9c';
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#fff';
    Chart.defaults.plugins.tooltip.titleColor = '#1d1f2a';
    Chart.defaults.plugins.tooltip.bodyColor = '#555a6b';
    Chart.defaults.plugins.tooltip.borderColor = '#eceef3';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 12;
    Chart.defaults.plugins.tooltip.boxPadding = 5;
    Chart.defaults.plugins.tooltip.usePointStyle = true;
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.point.hoverRadius = 5;
    Chart.defaults.interaction = { mode: 'index', intersect: false };
  }
  const grid = { color: '#f0f1f5', drawBorder: false };
  const axes = (yFmt) => ({
    x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 9, maxRotation: 0 } },
    y: { grid, border: { display: false }, ticks: { callback: yFmt || ((v) => fmt.compact(v)), maxTicksLimit: 6 } },
  });
  const legend = () => ({ display: true, align: 'end', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, generateLabels: (c) => Chart.defaults.plugins.legend.labels.generateLabels(c).map((l) => { const ds = c.data.datasets[l.datasetIndex]; const isBar = (ds.type || c.config.type) === 'bar'; return { ...l, fillStyle: isBar ? ds.backgroundColor : l.strokeStyle, lineWidth: 0 }; }) } });
  const charts = {};
  function chart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
    return charts[id];
  }
  function gradient(ctx, color, h = 280) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '33'); g.addColorStop(1, color + '00');
    return g;
  }
  const monthLabel = (s) => { const [y, m] = s.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
  const weekLabel = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

  function download(name, rows) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }

  function shell({ page, title, subtitle, actions = '' }) {
    const nav = PAGES.map(([k, href, label]) => `<a class="nav-btn ${k === page ? 'active' : ''}" href="${href}" aria-label="${label}">${icon(k)}<span class="tip">${label}</span></a>`).join('');
    document.body.innerHTML = `<div class="stage"><div class="shell">
      <aside class="rail"><svg class="logo" viewBox="0 0 40 40" fill="none" stroke="#1d1f2a" stroke-width="2.6"><circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="5.5"/><path d="M9 9l6 6" stroke-linecap="round"/></svg><nav>${nav}</nav></aside>
      <div class="main"><div class="topbar">
        <div class="search">${icon('search')}<input id="gsearch" placeholder="Search a product code or name" autocomplete="off"><kbd>/</kbd><div class="results" id="gresults"></div></div>
        <div class="spacer"></div><span class="pill">Online Retail II · UK</span><span class="pill round" title="Notifications">${icon('bell')}</span><span class="avatar" title="Analyst">DP</span></div>
        <div class="page-head"><div><h1>${title}</h1><div class="sub">${subtitle}</div></div><div class="page-actions">${actions}</div></div>
        <div id="content"></div></div></div></div>`;
    const input = document.getElementById('gsearch'), box = document.getElementById('gresults');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 || !window.DPA || !DPA.products) { box.style.display = 'none'; return; }
      const hits = DPA.products.rows.filter((r) => String(r[0]).toLowerCase().includes(q) || String(r[1] || '').toLowerCase().includes(q)).slice(0, 8);
      box.innerHTML = hits.map((r) => `<a href="products.html#${encodeURIComponent(r[0])}"><span>${r[1] || ''}</span><small>${r[0]}</small></a>`).join('') || '<a><small>No match</small></a>';
      box.style.display = 'block';
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.style.display = 'none'; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); input.focus(); } });
    chartDefaults();
    return document.getElementById('content');
  }
  const rangePill = (a, b) => `<span class="pill">${icon('calendar')} ${fmt.date(a)} – ${fmt.date(b)}</span>`;
  window.App = { legend, C, icon, fmt, kpi, deltaPill, axes, chart, gradient, monthLabel, weekLabel, download, shell, rangePill, grid };
})();
