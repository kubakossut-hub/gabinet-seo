const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const cache = require('./cache');
const { getConfig } = require('./data');

// ── Auth ───────────────────────────────────────────────────────────────────

const KEY_FILE = path.join(__dirname, '..', 'data', 'google-service-account.json');

function loadCredentials() {
  // Priority 1: environment variable (Railway production)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim().startsWith('{')) {
    try { return JSON.parse(raw); } catch {} // intentional: fall through to next strategy
  }
  if (raw && !raw.trim().startsWith('{')) {
    // Try base64
    try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch {} // intentional: fall through to file fallback
  }
  // Priority 2: file (local development)
  try {
    if (fs.existsSync(KEY_FILE)) return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  } catch {} // intentional: returns null below if file missing or malformed
  return null;
}

function getAuth() {
  const credentials = loadCredentials();
  if (!credentials) return null;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly'
    ]
  });
}

// ── Date helpers ───────────────────────────────────────────────────────────

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

// Rolling window. GSC data lags ~2 days so we end 2 days ago.
// periodIndex 0 = current window, -1 = previous window of same length
function rollingRange(periodIndex, days) {
  const end = new Date();
  end.setDate(end.getDate() - 2 + periodIndex * days);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: fmt(start), end: fmt(end) };
}

// Build current + previous date ranges from request opts
// opts: { days?: number, from?: string, to?: string }
function buildRanges(opts = {}) {
  const { days = 28, from = null, to = null } = opts;

  if (from && to) {
    const f = new Date(from + 'T12:00:00');
    const t = new Date(to   + 'T12:00:00');
    const len = Math.round((t - f) / 86400000) + 1;
    const prevTo   = new Date(f); prevTo.setDate(f.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - len + 1);
    return {
      curr:      { start: from, end: to },
      prev:      { start: fmt(prevFrom), end: fmt(prevTo) },
      currLabel: `${from} – ${to}`,
      prevLabel: `${fmt(prevFrom)} – ${fmt(prevTo)}`
    };
  }

  const c = rollingRange(0,  days);
  const p = rollingRange(-1, days);
  const d = days >= 365 ? '12 mies.' : days >= 180 ? '6 mies.' : days >= 90 ? '90 dni' : days >= 28 ? '28 dni' : `${days} dni`;
  return {
    curr:      c,
    prev:      p,
    currLabel: `ostatnie ${d} (${c.start} – ${c.end})`,
    prevLabel: `poprzednie ${d} (${p.start} – ${p.end})`
  };
}

// Cache key from period opts
function periodKey(opts = {}) {
  const { days = 28, from = null, to = null } = opts;
  return from ? `${from}_${to}` : `d${days}`;
}

// Calendar quarter — GA4 traffic business comparison
function quarterRange(offset) {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const targetQ = q + offset;
  const adjustedYear = year + Math.floor(targetQ / 4);
  const normalizedQ = ((targetQ % 4) + 4) % 4;
  const startMonth = normalizedQ * 3;
  const endMonth = startMonth + 2;
  const start = new Date(adjustedYear, startMonth, 1);
  const endDay = new Date(adjustedYear, endMonth + 1, 0);
  const end = endDay > now ? now : endDay;
  return { start: fmt(start), end: fmt(end), label: `Q${normalizedQ + 1} ${adjustedYear}` };
}

// ── GSC — Keywords ─────────────────────────────────────────────────────────

async function fetchKeywords(opts = {}) {
  const pk = periodKey(opts);
  const cacheKey = `gsc-keywords-${pk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', keywords: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const { curr, prev, currLabel, prevLabel } = buildRanges(opts);

  async function queryKeywords(dateRange) {
    const res = await webmasters.searchanalytics.query({
      siteUrl: cfg.gscProperty,
      requestBody: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ['query'],
        searchType: 'web',
        dataState: 'all',
        rowLimit: 1000
      }
    });
    return res.data.rows || [];
  }

  const [currRows, prevRows] = await Promise.all([
    queryKeywords(curr),
    queryKeywords(prev)
  ]);

  const prevMap = {};
  for (const r of prevRows) prevMap[r.keys[0].toLowerCase()] = r;

  const keywords = cfg.trackedKeywords.map(kw => {
    const kwLower = kw.toLowerCase();
    const currRow = currRows.find(r => r.keys[0].toLowerCase() === kwLower);
    const prevRow = prevMap[kwLower];
    const position     = currRow ? Math.round(currRow.position * 10) / 10 : null;
    const positionPrev = prevRow ? Math.round(prevRow.position * 10) / 10 : null;
    const clicks       = currRow ? currRow.clicks : 0;
    const clicksPrev   = prevRow ? prevRow.clicks : 0;
    const impressions  = currRow ? currRow.impressions : 0;
    const ctr          = currRow ? Math.round(currRow.ctr * 1000) / 10 : 0;

    let trend = 'stable';
    if (position !== null && positionPrev !== null) {
      const delta = position - positionPrev; // negative = improvement
      if (delta <= -1) trend = 'up';
      else if (delta >= 1) trend = 'down';
    } else if (clicksPrev > 0) {
      const pct = (clicks - clicksPrev) / clicksPrev * 100;
      if (pct >= 10) trend = 'up';
      else if (pct <= -10) trend = 'down';
    }

    return {
      keyword: kw,
      position,
      positionPrev,
      delta: position !== null && positionPrev !== null
        ? Math.round((position - positionPrev) * 10) / 10
        : null,
      clicks,
      clicksPrev,
      impressions,
      ctr,
      trend
    };
  });

  const result = {
    keywords,
    currQuarter: currLabel,
    prevQuarter: prevLabel
  };
  cache.set(cacheKey, result);
  return result;
}

// ── GSC — Top Pages ────────────────────────────────────────────────────────

async function fetchPages(opts = {}) {
  const pk = periodKey(opts);
  const cacheKey = `gsc-pages-${pk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', pages: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const { curr, currLabel } = buildRanges(opts);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: curr.start,
      endDate: curr.end,
      dimensions: ['page'],
      searchType: 'web',
      dataState: 'all',
      rowLimit: 10
    }
  });

  const pages = (res.data.rows || []).map(r => ({
    url: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Math.round(r.ctr * 1000) / 10,
    position: Math.round(r.position * 10) / 10
  }));

  const result = { pages, quarter: currLabel };
  cache.set(cacheKey, result);
  return result;
}

// ── GSC — Devices ──────────────────────────────────────────────────────────

async function fetchDevices(opts = {}) {
  const pk = periodKey(opts);
  const cacheKey = `gsc-devices-${pk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', devices: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const { curr } = buildRanges(opts);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: curr.start,
      endDate: curr.end,
      dimensions: ['device'],
      searchType: 'web',
      dataState: 'all',
      rowLimit: 10
    }
  });

  const devices = (res.data.rows || []).map(r => ({
    device: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions
  }));

  const result = { devices };
  cache.set(cacheKey, result);
  return result;
}

// ── GSC — Chart (impressions vs clicks, 16 weeks) ─────────────────────────

async function fetchChart(opts = {}) {
  const pk = periodKey(opts);
  const cacheKey = `gsc-chart-${pk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', weeks: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const { curr } = buildRanges(opts);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: curr.start,
      endDate: curr.end,
      dimensions: ['date'],
      searchType: 'web',
      dataState: 'all',
      rowLimit: 1000
    }
  });

  // Aggregate by week
  const weekMap = {};
  for (const r of (res.data.rows || [])) {
    const d = new Date(r.keys[0] + 'T12:00:00');
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = fmt(weekStart);
    if (!weekMap[key]) weekMap[key] = { date: key, clicks: 0, impressions: 0 };
    weekMap[key].clicks += r.clicks;
    weekMap[key].impressions += r.impressions;
  }

  const weeks = Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date));
  const result = { weeks };
  cache.set(cacheKey, result);
  return result;
}

// ── GA4 — Traffic ──────────────────────────────────────────────────────────

async function fetchTraffic(opts = {}) {
  const pk = periodKey(opts);
  const cacheKey = `ga4-traffic-${pk}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.ga4PropertyId) return { error: 'Google nie skonfigurowane', traffic: null };

  const client = await auth.getClient();
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: client });

  const { curr: currQ, prev: prevQ, currLabel, prevLabel } = buildRanges(opts);

  async function queryTraffic(dateRange) {
    const res = await analyticsdata.properties.runReport({
      property: cfg.ga4PropertyId,
      requestBody: {
        dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' }
        ]
      }
    });
    const organic = (res.data.rows || []).find(r => r.dimensionValues[0].value === 'Organic Search');
    if (!organic) return { sessions: 0, users: 0, newUsers: 0 };
    return {
      sessions: parseInt(organic.metricValues[0].value) || 0,
      users: parseInt(organic.metricValues[1].value) || 0,
      newUsers: parseInt(organic.metricValues[2].value) || 0
    };
  }

  // Also fetch weekly trend (last 12 weeks)
  async function queryWeeklyTrend() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7 * 12);
    const res = await analyticsdata.properties.runReport({
      property: cfg.ga4PropertyId,
      requestBody: {
        dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
        dimensions: [{ name: 'week' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'week' } }]
      }
    });
    const weekMap = {};
    for (const r of (res.data.rows || [])) {
      if (r.dimensionValues[1].value !== 'Organic Search') continue;
      const w = r.dimensionValues[0].value;
      weekMap[w] = (weekMap[w] || 0) + parseInt(r.metricValues[0].value);
    }
    return Object.entries(weekMap).map(([week, sessions]) => ({ week, sessions })).slice(-12);
  }

  const [currData, prevData, weeklyTrend] = await Promise.all([
    queryTraffic(currQ),
    queryTraffic(prevQ),
    queryWeeklyTrend()
  ]);

  function pct(a, b) {
    if (!b) return null;
    return Math.round((a - b) / b * 100);
  }

  const result = {
    current: currData,
    previous: prevData,
    sessionsDelta:  pct(currData.sessions, prevData.sessions),
    usersDelta:     pct(currData.users,    prevData.users),
    newUsersDelta:  pct(currData.newUsers, prevData.newUsers),
    weeklyTrend,
    currQuarter: currLabel,
    prevQuarter: prevLabel
  };

  cache.set(cacheKey, result);
  return result;
}

module.exports = { fetchKeywords, fetchPages, fetchDevices, fetchChart, fetchTraffic };
