/* ── SEO Dashboard — app.js ─────────────────────────────────────────────── */

const loaded = {};
let chartInstance = null;
let trafficChartInstance = null;
let currentUser = null;
let cachedKeywords = null;
let cachedTraffic  = null;
let cachedSpend    = null;
let agencyEmail = '';

// ── Period state ───────────────────────────────────────────────────────────

let period = (() => {
  try { return JSON.parse(localStorage.getItem('seo-period') || '{}'); } catch { return {}; }
})();
if (!period.days && !period.from) period = { days: 28 };

function getApiParams() {
  if (period.from && period.to) return `?from=${period.from}&to=${period.to}`;
  return `?days=${period.days || 28}`;
}

function savePeriod(p) {
  period = p;
  localStorage.setItem('seo-period', JSON.stringify(p));
}

function resetAndReload() {
  cachedKeywords = null;
  cachedTraffic  = null;
  Object.assign(loaded, { positions: false, traffic: false, pages: false, devices: false, chart: false });
  const activeTab = document.querySelector('.tab-bar button.active')?.dataset.tab;
  if (activeTab) loadTab(activeTab);
}

function setupPeriod() {
  const presets   = document.getElementById('periodPresets');
  const customToggle = document.getElementById('periodCustomToggle');
  const customRange  = document.getElementById('periodCustomRange');
  const fromInput    = document.getElementById('periodFrom');
  const toInput      = document.getElementById('periodTo');
  const applyBtn     = document.getElementById('periodApplyBtn');

  // Restore UI state
  if (period.from && period.to) {
    fromInput.value = period.from;
    toInput.value   = period.to;
    customRange.style.display = '';
    customToggle.classList.add('active');
    presets.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  } else {
    const days = period.days || 28;
    presets.querySelectorAll('.period-btn[data-days]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.days) === days);
    });
  }

  presets.addEventListener('click', (e) => {
    const btn = e.target.closest('.period-btn[data-days]');
    if (!btn) return;
    savePeriod({ days: parseInt(btn.dataset.days) });
    presets.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    customToggle.classList.remove('active');
    customRange.style.display = 'none';
    resetAndReload();
  });

  customToggle.addEventListener('click', () => {
    const open = customRange.style.display !== 'none';
    customRange.style.display = open ? 'none' : '';
    customToggle.classList.toggle('active', !open);
    if (!open && period.from) {
      fromInput.value = period.from;
      toInput.value   = period.to;
    }
  });

  applyBtn.addEventListener('click', () => {
    const from = fromInput.value;
    const to   = toInput.value;
    if (!from || !to || from > to) { toast('Podaj prawidłowy zakres dat', 'error'); return; }
    savePeriod({ from, to });
    presets.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    customToggle.classList.add('active');
    resetAndReload();
  });
}

// ── Column visibility ──────────────────────────────────────────────────────

let visibleCols = (() => {
  try { return JSON.parse(localStorage.getItem('seo-cols') || 'null'); } catch { return null; }
})() || { position: true, positionPrev: true, delta: true, clicks: true, impressions: true, ctr: true, trend: true };

function setupColToggles() {
  const controls = document.getElementById('colControls');
  if (!controls) return;
  controls.querySelectorAll('input[data-col]').forEach(cb => {
    cb.checked = visibleCols[cb.dataset.col] !== false;
    cb.addEventListener('change', () => {
      visibleCols[cb.dataset.col] = cb.checked;
      localStorage.setItem('seo-cols', JSON.stringify(visibleCols));
      applyColVisibility();
    });
  });
  applyColVisibility();

  document.getElementById('kwFilter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#positionsContent tbody tr').forEach(row => {
      row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

function applyColVisibility() {
  const cols = ['position', 'positionPrev', 'delta', 'clicks', 'impressions', 'ctr', 'trend'];
  cols.forEach(col => {
    const show = visibleCols[col] !== false;
    document.querySelectorAll(`.kw-col-${col}`).forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    currentUser = await apiFetch('/seo/api/me');
    const initials = currentUser.username.slice(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userInfo').textContent = currentUser.username;
    if (currentUser.role === 'admin') {
      document.getElementById('adminLink').style.display = '';
      const addCard = document.getElementById('spendAddCard');
      if (addCard) {
        addCard.style.display = '';
        // Pre-fill current month
        const todayMonth = new Date().toISOString().slice(0, 7);
        document.getElementById('spendMonth').value = todayMonth;
      }
    }
  } catch {
    window.location.href = '/seo/login';
    return;
  }

  try {
    const fr = await apiFetch('/seo/api/firstrun');
    if (fr.firstRun) document.getElementById('firstRunBanner').style.display = '';
  } catch {}

  try {
    const pub = await apiFetch('/seo/api/public/config');
    agencyEmail = pub.agencyEmail || '';
  } catch {}

  setupTabs();
  setupHelp();
  setupPeriod();
  setupColToggles();
  loadTab('positions');

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/seo/api/logout', { method: 'POST' });
    window.location.href = '/seo/login';
  });

  // Close modal on overlay click
  document.getElementById('emailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEmailModal();
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function setupTabs() {
  document.getElementById('tabBar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${tab}`).classList.add('active');
    if (!loaded[tab]) loadTab(tab);
  });
}

function loadTab(tab) {
  loaded[tab] = true;
  if (tab === 'positions') loadPositions();
  else if (tab === 'traffic')  loadTraffic();
  else if (tab === 'pages')    loadPages();
  else if (tab === 'devices')  loadDevices();
  else if (tab === 'chart')    loadChart();
  else if (tab === 'budget')   loadBudget();
  else if (tab === 'goals')    loadGoals();
}

// ── API helper ─────────────────────────────────────────────────────────────

async function apiFetch(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Toast ──────────────────────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const ct = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span style="font-weight:700;color:var(--${type === 'success' ? 'green' : type === 'error' ? 'red' : 'blue'})">${icons[type]}</span> ${esc(msg)}`;
  ct.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; el.style.transition = 'all .3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ── Help tooltips ──────────────────────────────────────────────────────────

const HELP_TEXTS = {
  positions: {
    title: 'Co to są pozycje fraz?',
    body: 'To numer miejsca Twojej strony na liście wyników Google. Pozycja 1 = pierwsze miejsce (najlepsza). Pozycja 10 = ostatnia na pierwszej stronie. Powyżej 10 = Google kolejna strona — nikt tam nie zagląda.\n\nPorównujemy bieżący kwartał z poprzednim: zielony = strona awansowała (świetnie!), czerwony = strona spadła (warto zareagować).',
    tip: '💡 Pozycja 1–3 to tzw. "złota strefa" — zbiera 50–75% wszystkich kliknięć.'
  },
  traffic: {
    title: 'Co to jest ruch organiczny?',
    body: 'Liczba osób, które weszły na Twoją stronę klikając wynik Google — bez płacenia za reklamy. Sesja = jedna wizyta (nawet jeśli ta sama osoba odwiedza wiele podstron).\n\nPorównujemy bieżący kwartał (np. Q2 2026) z poprzednim (Q1 2026). Procent pokazuje czy jest lepiej czy gorzej.',
    tip: '💡 Wzrost ruchu organicznego = darmowe wizyty, które nie kosztują Cię nic za kliknięcie.'
  },
  trend: {
    title: 'Co pokazuje ten wykres?',
    body: 'Tygodniowy trend liczby wizyt z Google (bez reklam). Idealna linia powinna rosnąć od lewej do prawej lub być stabilna. Nagłe spadki mogą oznaczać problem na stronie lub zmianę algorytmu Google.',
    tip: '💡 Sezonowość jest normalna — zabiegi estetyczne mają pik wiosną i jesienią.'
  },
  pages: {
    title: 'Które podstrony przynoszą ruch?',
    body: 'Lista 10 podstron Twojej kliniki, które najczęściej pojawiają się w wynikach Google i na które najczęściej klikają użytkownicy.\n\nKliknięcia = ile razy ktoś wszedł z Google. CTR = jaki procent osób, które zobaczyły link, faktycznie na niego kliknęło.',
    tip: '💡 Podstrony z niskim CTR (np. 1%) mogą mieć słaby tytuł lub opis — warto je poprawić.'
  },
  devices: {
    title: 'Skąd przeglądają Twoją stronę?',
    body: 'Podział użytkowników według urządzenia. W przypadku kliniki medycyny estetycznej zazwyczaj większość odwiedzin pochodzi z telefonów — dlatego strona musi świetnie wyglądać na mobile.',
    tip: '💡 Jeśli ponad 60% ruchu to telefony, a strona ładuje się wolno na mobile — tracisz pacjentów.'
  },
  chart: {
    title: 'Impressions vs Kliknięcia — co to znaczy?',
    body: 'Impressions (wyświetlenia) = ile razy Twoja strona pojawiła się w wynikach Google. Kliknięcia = ile razy ktoś faktycznie wszedł na stronę.\n\nStosunek kliknięcia/impressions = CTR (współczynnik klikalności). Dobry CTR dla medycyny estetycznej to 3–8%.\n\nJeśli impressions rosną a kliknięcia stoją — Twój tytuł strony jest mało atrakcyjny.',
    tip: '💡 Wzrost impressions przy stabilnych kliknięciach = Google Cię widzi, ale użytkownicy nie klikają. Warto poprawić opisy meta.'
  },
  budget: {
    title: 'Czy SEO się opłaca?',
    body: 'Porównujemy miesięczne wydatki na SEO (agencja + narzędzia) z szacowaną wartością ruchu organicznego.\n\nWartość organiczna = liczba sesji × średnia cena kliknięcia w Google Ads. Jeśli za te wizyty musiałbyś płacić reklamami, tyle by Cię to kosztowało.\n\nROI × 2 = za każdą wydaną złotówkę otrzymujesz wartość 2 zł.\n\nAdmin może dodawać i usuwać wpisy bezpośrednio w tej zakładce.',
    tip: '💡 Ustaw realny średni CPC w panelu admina, żeby obliczenia były dokładniejsze.'
  },
  goals: {
    title: 'Cele współpracy z agencją',
    body: 'To Twoja lista mierzalnych wymagań wobec agencji SEO. Każdy cel jest automatycznie sprawdzany na podstawie danych z Google.\n\n✅ Zielony = cel zrealizowany\n🟡 Żółty = blisko celu (≥80%)\n🔴 Czerwony = cel nie osiągnięty\n\nAdmin definiuje cele w panelu admina. Możesz dodać np. "fraza botoks warszawa na pozycji ≤ 5" albo "co najmniej 5 fraz w Top 10".',
    tip: '💡 Pokaż agencji te cele podczas negocjacji umowy — zrozumieją że śledzisz wyniki automatycznie.'
  }
};

function setupHelp() {
  const popover = document.getElementById('helpPopover');
  let activeBtn = null;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-btn');
    if (btn) {
      e.stopPropagation();
      if (activeBtn === btn && popover.classList.contains('visible')) {
        popover.classList.remove('visible');
        activeBtn = null;
        return;
      }
      const key = btn.dataset.help;
      const h = HELP_TEXTS[key];
      if (!h) return;

      const bodyText = h.body.replace(/\n/g, '<br>');
      popover.innerHTML = `<strong>${esc(h.title)}</strong>${bodyText}${h.tip ? `<div class="help-tip"><span>💡</span><span>${esc(h.tip.replace('💡 ', ''))}</span></div>` : ''}`;

      // Position
      const rect = btn.getBoundingClientRect();
      const pw = 320;
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 8;

      if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
      if (left < 8) left = 8;

      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
      popover.classList.add('visible');
      activeBtn = btn;
      return;
    }
    if (!popover.contains(e.target)) {
      popover.classList.remove('visible');
      activeBtn = null;
    }
  });
}

// ── Positions ──────────────────────────────────────────────────────────────

async function loadPositions() {
  try {
    const data = await apiFetch('/seo/api/keywords' + getApiParams());
    if (data.error) {
      document.getElementById('googleWarnPositions').style.display = '';
      document.getElementById('positionsContent').innerHTML = '';
      return;
    }
    cachedKeywords = data;
    document.getElementById('positionsQuarterBadge').textContent =
      `${data.currQuarter} vs ${data.prevQuarter}`;
    renderPositions(data);
  } catch (e) {
    document.getElementById('positionsContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${esc(e.message)}</p></div>`;
  }
}

function renderPositions({ keywords }) {
  if (!keywords || !keywords.length) {
    document.getElementById('positionsContent').innerHTML =
      '<div class="empty-state"><div class="icon">🔍</div><p>Brak danych. Skonfiguruj Google Search Console w panelu admina.</p></div>';
    return;
  }

  const rows = keywords.map(k => {
    const posClass = k.position === null ? 'pos-none'
      : k.position <= 3 ? 'pos-top'
      : k.position <= 10 ? 'pos-mid' : 'pos-low';

    const posStr = k.position !== null ? k.position.toFixed(1) : '—';
    const posPrevStr = k.positionPrev !== null ? k.positionPrev.toFixed(1) : '—';

    let deltaHtml = '—';
    if (k.delta !== null) {
      if (k.delta < 0) deltaHtml = `<span class="delta-arrow delta-up">▲ ${Math.abs(k.delta)}</span>`;
      else if (k.delta > 0) deltaHtml = `<span class="delta-arrow delta-down">▼ ${k.delta}</span>`;
      else deltaHtml = `<span class="delta-arrow delta-stable">— 0</span>`;
    }

    const trendClass = k.trend === 'up' ? 'trend-up' : k.trend === 'down' ? 'trend-down' : 'trend-stable';
    const badge = k.trend === 'up'
      ? '<span class="badge badge-up">▲ lepiej</span>'
      : k.trend === 'down'
        ? '<span class="badge badge-down">▼ gorzej</span>'
        : '<span class="badge badge-stable">→ bez zmian</span>';

    return `<tr class="${trendClass}">
      <td><strong>${esc(k.keyword)}</strong></td>
      <td class="kw-col-position"><span class="pos ${posClass}">${posStr}</span></td>
      <td class="kw-col-positionPrev" style="color:var(--text-muted)">${posPrevStr}</td>
      <td class="kw-col-delta">${deltaHtml}</td>
      <td class="kw-col-clicks">${k.clicks.toLocaleString('pl')}</td>
      <td class="kw-col-impressions" style="color:var(--text-muted)">${k.impressions.toLocaleString('pl')}</td>
      <td class="kw-col-ctr">${k.ctr}%</td>
      <td class="kw-col-trend">${badge}</td>
    </tr>`;
  }).join('');

  document.getElementById('positionsContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fraza kluczowa</th>
            <th class="kw-col-position">Pozycja</th>
            <th class="kw-col-positionPrev">Poprzednio</th>
            <th class="kw-col-delta">Zmiana</th>
            <th class="kw-col-clicks">Kliknięcia</th>
            <th class="kw-col-impressions">Wyświetlenia</th>
            <th class="kw-col-ctr">CTR</th>
            <th class="kw-col-trend">Trend</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="tooltip-text">
      Pozycja: <span style="color:var(--green)">1–3 złota strefa</span> ·
      <span style="color:var(--yellow)">4–10 pierwsza strona</span> ·
      <span style="color:var(--red)">11+ poza pierwszą stroną</span> ·
      Zmiana: ▲ mniejszy numer = lepsza pozycja · ▼ wyższy numer = gorsza pozycja
    </p>`;
  applyColVisibility();
}

// ── Traffic ────────────────────────────────────────────────────────────────

async function loadTraffic() {
  const statsEl = document.getElementById('trafficStats');
  const chartEl = document.getElementById('trafficChartWrap');

  try {
    const d = await apiFetch('/seo/api/traffic' + getApiParams());
    if (d.error) {
      document.getElementById('googleWarnTraffic').style.display = '';
      statsEl.innerHTML = '';
      chartEl.innerHTML = '';
      return;
    }
    cachedTraffic = d;
    renderTrafficStats(d);
    renderTrafficChart(d);
  } catch (e) {
    statsEl.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
    chartEl.innerHTML = '';
  }
}

function renderTrafficStats(d) {
  const items = [
    { label: 'Sesje organiczne',    val: d.current.sessions,  delta: d.sessionsDelta },
    { label: 'Użytkownicy',         val: d.current.users,     delta: d.usersDelta },
    { label: 'Nowi użytkownicy',    val: d.current.newUsers,  delta: d.newUsersDelta }
  ];
  document.getElementById('trafficStats').innerHTML = items.map(item => {
    const cls = item.delta > 0 ? 'delta-up' : item.delta < 0 ? 'delta-down' : 'delta-stable';
    const sign = item.delta > 0 ? '+' : '';
    const deltaStr = item.delta !== null
      ? `<span class="${cls}">${sign}${item.delta}% vs ${d.prevQuarter}</span>`
      : '<span class="delta-stable">— brak danych poprzedniego kwartału</span>';
    return `<div class="stat-card">
      <div class="stat-label">${item.label}</div>
      <div class="stat-value">${(item.val || 0).toLocaleString('pl')}</div>
      <div class="stat-delta">${deltaStr}</div>
    </div>`;
  }).join('');
}

function renderTrafficChart(d) {
  const wrap = document.getElementById('trafficChartWrap');
  if (!d.weeklyTrend || !d.weeklyTrend.length) {
    wrap.innerHTML = '<div class="empty-state"><p>Brak danych trendów tygodniowych.</p></div>';
    return;
  }
  wrap.innerHTML = '<div class="chart-wrap"><canvas id="trafficChart"></canvas></div>';
  const ctx = document.getElementById('trafficChart').getContext('2d');
  if (trafficChartInstance) trafficChartInstance.destroy();
  trafficChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.weeklyTrend.map(w => 'T' + w.week),
      datasets: [{
        label: 'Sesje organiczne',
        data: d.weeklyTrend.map(w => w.sessions),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: chartOptions('Sesje')
  });
}

// ── Pages ──────────────────────────────────────────────────────────────────

async function loadPages() {
  try {
    const d = await apiFetch('/seo/api/pages' + getApiParams());
    if (d.error) {
      document.getElementById('googleWarnPages').style.display = '';
      document.getElementById('pagesContent').innerHTML = '';
      return;
    }
    if (d.quarter) document.getElementById('pagesQuarter').textContent = d.quarter;
    if (!d.pages || !d.pages.length) {
      document.getElementById('pagesContent').innerHTML =
        '<div class="empty-state"><div class="icon">📄</div><p>Brak danych ze Search Console.</p></div>';
      return;
    }
    const rows = d.pages.map((p, i) => `
      <tr>
        <td style="color:var(--text-muted);width:32px;font-family:var(--font-display);font-weight:700">${i + 1}</td>
        <td style="max-width:400px">
          <a href="${esc(p.url)}" target="_blank" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block" title="${esc(p.url)}">${esc(shortUrl(p.url))}</a>
        </td>
        <td><strong>${p.clicks.toLocaleString('pl')}</strong></td>
        <td style="color:var(--text-muted)">${p.impressions.toLocaleString('pl')}</td>
        <td>${p.ctr}%</td>
        <td>${p.position.toFixed(1)}</td>
      </tr>`).join('');
    document.getElementById('pagesContent').innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>#</th><th>Adres strony</th><th>Kliknięcia</th>
          <th>Wyświetlenia</th><th>CTR</th><th>Avg. Pozycja</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  } catch (e) {
    document.getElementById('pagesContent').innerHTML =
      `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function shortUrl(url) {
  try { return new URL(url).pathname || url; } catch { return url; }
}

// ── Devices ────────────────────────────────────────────────────────────────

async function loadDevices() {
  try {
    const d = await apiFetch('/seo/api/devices' + getApiParams());
    if (d.error) {
      document.getElementById('googleWarnDevices').style.display = '';
      document.getElementById('devicesContent').innerHTML = '';
      return;
    }
    if (!d.devices || !d.devices.length) {
      document.getElementById('devicesContent').innerHTML =
        '<div class="empty-state"><div class="icon">📱</div><p>Brak danych.</p></div>';
      return;
    }
    const total = d.devices.reduce((s, x) => s + x.clicks, 0);
    const palette = { DESKTOP: '#3b82f6', MOBILE: '#10b981', TABLET: '#f59e0b' };
    const labels  = { DESKTOP: 'Komputer', MOBILE: 'Telefon', TABLET: 'Tablet' };

    const segments = d.devices.map(dev => {
      const pct = total ? Math.round(dev.clicks / total * 100) : 0;
      const color = palette[dev.device.toUpperCase()] || '#4b5e78';
      return `<div class="device-segment" style="width:${pct}%;background:${color}" title="${labels[dev.device.toUpperCase()] || dev.device}: ${pct}%"></div>`;
    }).join('');

    const legend = d.devices.map(dev => {
      const pct = total ? Math.round(dev.clicks / total * 100) : 0;
      const color = palette[dev.device.toUpperCase()] || '#4b5e78';
      const label = labels[dev.device.toUpperCase()] || dev.device;
      return `<div class="device-legend-item">
        <div class="legend-dot" style="background:${color}"></div>
        <span>${label}: <strong style="color:var(--text)">${pct}%</strong>
        <span style="color:var(--text-muted)">(${dev.clicks.toLocaleString('pl')} kliknięć)</span></span>
      </div>`;
    }).join('');

    document.getElementById('devicesContent').innerHTML = `
      <div class="device-bar">${segments}</div>
      <div class="device-legend">${legend}</div>
      <p class="tooltip-text" style="margin-top:18px">Dane z Google Search Console — kliknięcia wg rodzaju urządzenia w bieżącym kwartale.</p>`;
  } catch (e) {
    document.getElementById('devicesContent').innerHTML =
      `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

// ── Chart ──────────────────────────────────────────────────────────────────

async function loadChart() {
  document.getElementById('chartLoading').style.display = '';
  try {
    const d = await apiFetch('/seo/api/chart' + getApiParams());
    document.getElementById('chartLoading').style.display = 'none';
    if (d.error) { document.getElementById('googleWarnChart').style.display = ''; return; }
    if (!d.weeks || !d.weeks.length) return;
    const lbl = period.from ? `${period.from} – ${period.to}` : `ostatnie ${period.days || 28} dni`;
    document.getElementById('chartPeriodLabel').textContent = lbl;
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: d.weeks.map(w => w.date),
        datasets: [
          {
            label: 'Wyświetlenia',
            data: d.weeks.map(w => w.impressions),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,.07)',
            fill: true, tension: 0.4, yAxisID: 'y1',
            pointRadius: 3, pointHoverRadius: 5
          },
          {
            label: 'Kliknięcia',
            data: d.weeks.map(w => w.clicks),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,.07)',
            fill: true, tension: 0.4, yAxisID: 'y2',
            pointRadius: 3, pointHoverRadius: 5
          }
        ]
      },
      options: {
        ...chartOptions(),
        scales: {
          x: { grid: { color: 'rgba(30,42,61,.8)' }, ticks: { color: '#4b5e78', maxTicksLimit: 8 } },
          y1: { type: 'linear', position: 'left',  beginAtZero: true, grid: { color: 'rgba(30,42,61,.8)' }, ticks: { color: '#3b82f6' }, title: { display: true, text: 'Wyświetlenia', color: '#4b5e78' } },
          y2: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },     ticks: { color: '#10b981' }, title: { display: true, text: 'Kliknięcia',   color: '#4b5e78' } }
        }
      }
    });
  } catch {
    document.getElementById('chartLoading').style.display = 'none';
  }
}

function chartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#7d93b0', boxWidth: 12, font: { family: 'DM Sans' } } },
      tooltip: {
        backgroundColor: '#111827',
        titleColor: '#f1f5f9',
        bodyColor: '#7d93b0',
        borderColor: '#1e2a3d',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 7
      }
    },
    scales: {
      x: { grid: { color: 'rgba(30,42,61,.8)' }, ticks: { color: '#4b5e78', maxTicksLimit: 12 } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(30,42,61,.8)' },
        ticks: { color: '#7d93b0' },
        title: yLabel ? { display: true, text: yLabel, color: '#4b5e78' } : undefined
      }
    }
  };
}

// ── Budget ─────────────────────────────────────────────────────────────────

async function loadBudget() {
  try {
    const spend = await apiFetch('/seo/api/spend');
    cachedSpend = spend;
    renderSpend(spend);
  } catch (e) {
    document.getElementById('spendContent').innerHTML =
      `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

async function saveSpendEntry() {
  const month    = document.getElementById('spendMonth').value;
  const spendPln = document.getElementById('spendAmount').value;
  const note     = document.getElementById('spendNote').value;
  const msgEl    = document.getElementById('spendSaveMsg');

  if (!month || !spendPln) {
    msgEl.textContent = 'Podaj miesiąc i kwotę.';
    msgEl.style.background = 'var(--red-glow)';
    msgEl.style.borderColor = 'rgba(244,63,94,.3)';
    msgEl.style.color = 'var(--red)';
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 3500);
    return;
  }

  try {
    await apiFetch('/seo/api/admin/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, spendPln: parseFloat(spendPln), note })
    });
    document.getElementById('spendAmount').value = '';
    document.getElementById('spendNote').value = '';
    msgEl.textContent = 'Wydatek zapisany.';
    msgEl.style.background = 'var(--green-glow)';
    msgEl.style.borderColor = 'rgba(16,185,129,.3)';
    msgEl.style.color = 'var(--green)';
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 3000);
    // Reload spend table
    cachedSpend = null;
    loadBudget();
  } catch (e) {
    msgEl.textContent = e.message;
    msgEl.style.background = 'var(--red-glow)';
    msgEl.style.borderColor = 'rgba(244,63,94,.3)';
    msgEl.style.color = 'var(--red)';
    msgEl.classList.add('show');
    setTimeout(() => msgEl.classList.remove('show'), 3500);
  }
}

function renderSpend({ entries, avgCpc }) {
  if (!entries || !entries.length) {
    document.getElementById('spendContent').innerHTML =
      `<div class="empty-state">
        <div class="icon">💰</div>
        <p>Brak wpisów. ${currentUser?.role === 'admin' ? 'Dodaj pierwszy wydatek powyżej.' : 'Admin doda wpisy w tej zakładce.'}</p>
      </div>`;
    return;
  }
  const rows = entries.map(e => {
    const roi = e.spendPln && e.organicSessions
      ? (e.organicSessions * avgCpc / e.spendPln).toFixed(2) : null;
    return `<tr>
      <td><strong style="font-family:var(--font-display)">${e.month}</strong></td>
      <td><strong>${e.spendPln ? e.spendPln.toLocaleString('pl') + ' zł' : '—'}</strong></td>
      <td style="color:var(--text-muted)">
        ${e.organicSessions ? Math.round(e.organicSessions * avgCpc).toLocaleString('pl') + ' zł' : '<span style="color:var(--text-muted);font-size:12px">brak danych GA</span>'}
      </td>
      <td>${roi ? `<strong style="color:var(--green);font-family:var(--font-display);font-size:16px">×${roi}</strong>` : '—'}</td>
      <td style="color:var(--text-muted)">${e.note || '—'}</td>
    </tr>`;
  }).join('');
  document.getElementById('spendContent').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Miesiąc</th><th>Wydatki SEO</th><th>Wartość organiczna (szac.)</th><th>ROI</th><th>Uwagi</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="tooltip-text">
      Wartość organiczna = liczba sesji organicznych × średni CPC (${avgCpc} zł).
      Aktualizuj CPC w panelu admina → Konfiguracja Google.
    </p>`;
}

// ── Goals ──────────────────────────────────────────────────────────────────

async function loadGoals() {
  const el = document.getElementById('goalsContent');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Oceniam cele…</div>';
  try {
    const { goals } = await apiFetch('/seo/api/goals' + getApiParams());
    renderGoals(goals, el);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function renderGoals(goals, el) {
  if (!goals || !goals.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">🎯</div>
      <p>Brak zdefiniowanych celów.<br>
      ${currentUser?.role === 'admin'
        ? 'Dodaj cele w <a href="/seo/admin">panelu admina</a> → sekcja „Cele współpracy".'
        : 'Poproś administratora o skonfigurowanie celów współpracy z agencją.'}</p>
    </div>`;
    return;
  }

  const counts = { ok: 0, warn: 0, fail: 0, unknown: 0 };
  goals.forEach(g => { counts[g.status] = (counts[g.status] || 0) + 1; });

  const summary = `
    <div class="goals-summary">
      <div class="goals-summary-stat"><div class="num num-ok">${counts.ok}</div><div class="lbl">Zrealizowane</div></div>
      <div class="goals-summary-stat"><div class="num num-warn">${counts.warn}</div><div class="lbl">Blisko celu</div></div>
      <div class="goals-summary-stat"><div class="num num-fail">${counts.fail}</div><div class="lbl">Niezrealizowane</div></div>
      <div class="goals-summary-stat"><div class="num num-gray">${goals.length}</div><div class="lbl">Łącznie</div></div>
    </div>`;

  const cards = goals.map(g => {
    const statusLabel = { ok: '✓ Zrealizowany', warn: '~ Blisko celu', fail: '✗ Niezrealizowany', unknown: '? Brak danych' };
    const barClass    = { ok: 'bar-ok', warn: 'bar-warn', fail: 'bar-fail', unknown: 'bar-unknown' };
    const priorityClass = { high: 'goal-priority-high', medium: 'goal-priority-medium', low: 'goal-priority-low' };
    const priorityLabel = { high: 'Wysoki', medium: 'Średni', low: 'Niski' };

    const currentFmt = g.current === null ? '—'
      : g.type === 'traffic_growth' ? `${g.current > 0 ? '+' : ''}${g.current}%`
      : g.type === 'keyword_position' ? `poz. ${typeof g.current === 'number' ? g.current.toFixed(1) : g.current}`
      : g.type === 'keyword_ctr' ? `${g.current}%`
      : Number(g.current).toLocaleString('pl');

    const targetFmt = g.target === null ? '—'
      : g.type === 'traffic_growth' ? `+${g.target}%`
      : g.type === 'keyword_position' ? `≤ poz. ${g.target}`
      : g.type === 'keyword_ctr' ? `≥ ${g.target}%`
      : `≥ ${Number(g.target).toLocaleString('pl')}${g.unit ? ' ' + g.unit : ''}`;

    const currentColor = g.status === 'ok' ? 'var(--green)' : g.status === 'warn' ? 'var(--yellow)' : g.status === 'fail' ? 'var(--red)' : 'var(--text-dim)';

    return `<div class="goal-card status-${g.status}">
      <div class="goal-card-header">
        <div class="goal-desc">${esc(g.desc || g.type)}</div>
        <span class="goal-priority ${priorityClass[g.priority] || ''}">${priorityLabel[g.priority] || g.priority}</span>
      </div>
      <div class="goal-values">
        <span class="goal-current" style="color:${currentColor}">${currentFmt}</span>
        <span class="goal-target">cel: ${targetFmt}</span>
      </div>
      <div class="goal-bar-wrap">
        <div class="goal-bar ${barClass[g.status] || 'bar-unknown'}" style="width:${g.progress || 0}%"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11px;color:${currentColor};font-weight:600">${statusLabel[g.status] || ''}</span>
        <span style="font-size:11px;color:var(--text-muted)">${g.progress ?? 0}%</span>
      </div>
      ${g.note ? `<div class="goal-note">${esc(g.note)}</div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = summary + `<div class="goals-grid">${cards}</div>`;
}

// ── Email draft ────────────────────────────────────────────────────────────

async function openEmailDraft() {
  const modal = document.getElementById('emailModal');
  const btn   = document.getElementById('emailAgencyBtn');
  const explEl = document.getElementById('emailExplanation');

  // Disable button while fetching
  btn.disabled = true;
  btn.textContent = '⏳ Przygotowuję…';

  // Fetch any data not yet cached
  try {
    const [kw, tr, spend] = await Promise.all([
      cachedKeywords ? Promise.resolve(cachedKeywords) : apiFetch('/seo/api/keywords' + getApiParams()).catch(() => null),
      cachedTraffic  ? Promise.resolve(cachedTraffic)  : apiFetch('/seo/api/traffic'  + getApiParams()).catch(() => null),
      cachedSpend    ? Promise.resolve(cachedSpend)    : apiFetch('/seo/api/spend').catch(() => null),
    ]);
    if (kw  && !kw.error)  cachedKeywords = kw;
    if (tr  && !tr.error)  cachedTraffic  = tr;
    if (spend) cachedSpend = spend;
  } catch {}

  btn.disabled = false;
  btn.textContent = '✉ Napisz do agencji';

  // ── Build subject ──────────────────────────────────────────────────────
  const quarter = cachedKeywords?.currQuarter
    || new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long' });
  const prevQ = cachedKeywords?.prevQuarter || 'poprzedni kwartał';

  document.getElementById('emailFrom').value = currentUser?.email || '';
  document.getElementById('emailTo').value   = agencyEmail || '';
  document.getElementById('emailSubject').value =
    `Kompleksowy raport SEO — ${quarter} | Klinika Dr Kossut`;

  // ── Build body ─────────────────────────────────────────────────────────
  const sender = currentUser?.username || 'Klinika Dr Kossut';
  let body = `Dzień dobry,\n\nprzesyłam kompleksowe podsumowanie wyników SEO za ${quarter} w porównaniu do ${prevQ}.\n`;
  body += `─────────────────────────────────────────\n\n`;

  // 1. POZYCJE KLUCZOWYCH FRAZ
  body += `📍 POZYCJE KLUCZOWYCH FRAZ\n\n`;
  if (cachedKeywords?.keywords?.length) {
    const { keywords } = cachedKeywords;
    const improving = keywords.filter(k => k.trend === 'up');
    const declining = keywords.filter(k => k.trend === 'down');
    const stable    = keywords.filter(k => k.trend === 'stable' && k.position !== null);
    const noData    = keywords.filter(k => k.position === null);

    if (improving.length) {
      body += `✅ Poprawa pozycji (${improving.length}):\n`;
      improving.forEach(k => {
        const delta = k.delta !== null ? ` (zmiana: ${k.delta > 0 ? '+' : ''}${k.delta} miejsc)` : '';
        body += `  • ${k.keyword}: pozycja ${k.position?.toFixed(1) || '?'} (było: ${k.positionPrev?.toFixed(1) || '?'})${delta}\n`;
        body += `    Kliknięcia: ${k.clicks}, Wyświetlenia: ${k.impressions}, CTR: ${k.ctr}%\n`;
      });
      body += '\n';
    }
    if (declining.length) {
      body += `⚠️ Spadek pozycji — wymagają działań (${declining.length}):\n`;
      declining.forEach(k => {
        const delta = k.delta !== null ? ` (zmiana: +${Math.abs(k.delta)} miejsc w dół)` : '';
        body += `  • ${k.keyword}: pozycja ${k.position?.toFixed(1) || 'brak'}${k.positionPrev !== null ? ` (było: ${k.positionPrev.toFixed(1)})` : ''}${delta}\n`;
        body += `    Kliknięcia: ${k.clicks}, Wyświetlenia: ${k.impressions}, CTR: ${k.ctr}%\n`;
      });
      body += '\n';
    }
    if (stable.length) {
      body += `→ Bez istotnych zmian (${stable.length}):\n`;
      stable.forEach(k => {
        body += `  • ${k.keyword}: pozycja ${k.position?.toFixed(1) || '?'}\n`;
      });
      body += '\n';
    }
    if (noData.length) {
      body += `❓ Brak danych — frazy nie pojawiły się w wynikach (${noData.length}):\n`;
      noData.forEach(k => { body += `  • ${k.keyword}\n`; });
      body += '\n';
    }
  } else {
    body += `  Brak danych z Google Search Console.\n\n`;
  }

  // 2. RUCH ORGANICZNY
  body += `📊 RUCH ORGANICZNY (Google Analytics)\n\n`;
  if (cachedTraffic?.current) {
    const t = cachedTraffic;
    const sign = v => v > 0 ? `+${v}%` : v < 0 ? `${v}%` : 'bez zmian';
    body += `  • Sesje organiczne: ${(t.current.sessions || 0).toLocaleString('pl')} (${sign(t.sessionsDelta)} vs ${prevQ})\n`;
    body += `  • Użytkownicy: ${(t.current.users || 0).toLocaleString('pl')} (${sign(t.usersDelta)})\n`;
    body += `  • Nowi użytkownicy: ${(t.current.newUsers || 0).toLocaleString('pl')} (${sign(t.newUsersDelta)})\n\n`;
  } else {
    body += `  Brak danych z Google Analytics.\n\n`;
  }

  // 3. EFEKTYWNOŚĆ WYDATKÓW
  body += `💰 EFEKTYWNOŚĆ WYDATKÓW\n\n`;
  if (cachedSpend?.entries?.length) {
    const avgCpc = cachedSpend.avgCpc || 8.5;
    const recent = cachedSpend.entries.slice(0, 3);
    recent.forEach(e => {
      const orgValue = e.organicSessions
        ? Math.round(e.organicSessions * avgCpc).toLocaleString('pl') + ' zł'
        : 'brak danych GA';
      const roi = e.spendPln && e.organicSessions
        ? `×${(e.organicSessions * avgCpc / e.spendPln).toFixed(2)}` : '—';
      body += `  ${e.month}: wydatki ${e.spendPln ? e.spendPln.toLocaleString('pl') + ' zł' : '—'}, wartość organiczna ~${orgValue}, ROI ${roi}\n`;
    });
    body += '\n';
  } else {
    body += `  Brak danych o wydatkach.\n\n`;
  }

  // 5. PYTANIA / OCZEKIWANIA
  body += `─────────────────────────────────────────\n`;
  body += `❓ PYTANIA I OCZEKIWANIA\n\n`;

  const issues = [];
  if (cachedKeywords?.keywords) {
    const declining = cachedKeywords.keywords.filter(k => k.trend === 'down');
    if (declining.length) {
      issues.push(`Proszę o szczegółowe wyjaśnienie przyczyn spadków dla ${declining.length} fraz oraz plan naprawczy z konkretnymi terminami.`);
    }
    const noData = cachedKeywords.keywords.filter(k => k.position === null);
    if (noData.length) {
      issues.push(`Frazy: ${noData.map(k => k.keyword).join(', ')} nie pojawiają się w wynikach wyszukiwania. Jakie działania są planowane?`);
    }
  }
  if (issues.length) {
    issues.forEach((q, i) => { body += `${i + 1}. ${q}\n`; });
  } else {
    body += `Proszę o miesięczne podsumowanie wykonanych prac oraz plan na kolejny miesiąc.\n`;
  }

  body += `\nOczekuję odpowiedzi do końca tygodnia.\n\nZ poważaniem,\n${sender}`;

  document.getElementById('emailBody').value = body;

  // ── Build explanation ──────────────────────────────────────────────────
  const bullets = [
    `<strong>Pozycje kluczowych fraz</strong> — na których miejscach w Google pojawia się strona kliniki dla najważniejszych zabiegów. Numer 1 to szczyt, im niższy tym lepiej.`,
    `<strong>Ruch organiczny</strong> — ile osób odwiedziło stronę kliknąwszy w wyniki Google (nie reklamy). To efekt pracy SEO.`,
    `<strong>Efektywność wydatków (ROI)</strong> — ile wart jest ruch organiczny względem kwoty zapłaconej agencji. ROI ×3 = za każdą złotówkę wynagrodzenia agencja przyniosła 3 zł wartości.`,
    `<strong>Pytania i oczekiwania</strong> — konkretne żądania oparte na danych. Wysyłasz je, żeby agencja nie mogła zbagatelizować problemów.`,
  ];
  explEl.innerHTML = `<h4>💡 Co oznaczają poszczególne sekcje tego maila?</h4><ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul>`;
  explEl.style.display = '';

  modal.classList.add('open');
}

function closeEmailModal() {
  document.getElementById('emailModal').classList.remove('open');
}

function copyEmailToClipboard() {
  const body = document.getElementById('emailBody').value;
  const subject = document.getElementById('emailSubject').value;
  const text = `Temat: ${subject}\n\n${body}`;
  navigator.clipboard.writeText(text).then(() => {
    toast('Treść maila skopiowana do schowka', 'success');
    closeEmailModal();
  }).catch(() => toast('Nie udało się skopiować — skopiuj ręcznie z pola tekstowego', 'error'));
}

function openInMailClient() {
  const to      = document.getElementById('emailTo').value || '';
  const subject = encodeURIComponent(document.getElementById('emailSubject').value || '');
  const body    = encodeURIComponent(document.getElementById('emailBody').value || '');
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Start ──────────────────────────────────────────────────────────────────

init();
