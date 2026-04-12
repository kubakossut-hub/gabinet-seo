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
    try { return JSON.parse(raw); } catch {}
  }
  if (raw && !raw.trim().startsWith('{')) {
    // Try base64
    try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch {}
  }
  // Priority 2: file (local development)
  try {
    if (fs.existsSync(KEY_FILE)) return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  } catch {}
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

// ── Quarter helpers ────────────────────────────────────────────────────────

function quarterRange(offset) {
  // offset 0 = current quarter, -1 = previous quarter
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3); // 0..3
  const targetQ = q + offset;
  const adjustedYear = year + Math.floor(targetQ / 4);
  const normalizedQ = ((targetQ % 4) + 4) % 4;
  const startMonth = normalizedQ * 3;
  const endMonth = startMonth + 2;
  const start = new Date(adjustedYear, startMonth, 1);
  const endDay = new Date(adjustedYear, endMonth + 1, 0);
  // Don't go beyond today
  const end = endDay > now ? now : endDay;
  return {
    start: fmt(start),
    end: fmt(end),
    label: `Q${normalizedQ + 1} ${adjustedYear}`
  };
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

// ── GSC — Keywords ─────────────────────────────────────────────────────────

async function fetchKeywords() {
  const cached = cache.get('gsc-keywords');
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', keywords: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });

  const currQ = quarterRange(0);
  const prevQ = quarterRange(-1);

  async function queryKeywords(dateRange) {
    const res = await webmasters.searchanalytics.query({
      siteUrl: cfg.gscProperty,
      requestBody: {
        startDate: dateRange.start,
        endDate: dateRange.end,
        dimensions: ['query'],
        rowLimit: 100
      }
    });
    return res.data.rows || [];
  }

  const [currRows, prevRows] = await Promise.all([queryKeywords(currQ), queryKeywords(prevQ)]);

  const prevMap = {};
  for (const r of prevRows) prevMap[r.keys[0]] = r;

  const keywords = cfg.trackedKeywords.map(kw => {
    const curr = currRows.find(r => r.keys[0] === kw);
    const prev = prevMap[kw];
    const position = curr ? Math.round(curr.position * 10) / 10 : null;
    const positionPrev = prev ? Math.round(prev.position * 10) / 10 : null;
    const clicks = curr ? curr.clicks : 0;
    const clicksPrev = prev ? prev.clicks : 0;
    const impressions = curr ? curr.impressions : 0;
    const ctr = curr ? Math.round(curr.ctr * 1000) / 10 : 0; // %

    let trend = 'stable';
    if (position !== null && positionPrev !== null) {
      const delta = position - positionPrev; // negative = improvement
      if (delta <= -2) trend = 'up';
      else if (delta >= 2) trend = 'down';
    } else if (clicksPrev > 0) {
      const pct = (clicks - clicksPrev) / clicksPrev * 100;
      if (pct >= 10) trend = 'up';
      else if (pct <= -10) trend = 'down';
    }

    return {
      keyword: kw,
      position,
      positionPrev,
      delta: position !== null && positionPrev !== null ? Math.round((position - positionPrev) * 10) / 10 : null,
      clicks,
      clicksPrev,
      impressions,
      ctr,
      trend
    };
  });

  const result = { keywords, currQuarter: currQ.label, prevQuarter: prevQ.label };
  cache.set('gsc-keywords', result);
  return result;
}

// ── GSC — Top Pages ────────────────────────────────────────────────────────

async function fetchPages() {
  const cached = cache.get('gsc-pages');
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', pages: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const currQ = quarterRange(0);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: currQ.start,
      endDate: currQ.end,
      dimensions: ['page'],
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

  const result = { pages, quarter: currQ.label };
  cache.set('gsc-pages', result);
  return result;
}

// ── GSC — Devices ──────────────────────────────────────────────────────────

async function fetchDevices() {
  const cached = cache.get('gsc-devices');
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', devices: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });
  const currQ = quarterRange(0);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: currQ.start,
      endDate: currQ.end,
      dimensions: ['device'],
      rowLimit: 10
    }
  });

  const devices = (res.data.rows || []).map(r => ({
    device: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions
  }));

  const result = { devices };
  cache.set('gsc-devices', result);
  return result;
}

// ── GSC — Chart (impressions vs clicks, 16 weeks) ─────────────────────────

async function fetchChart() {
  const cached = cache.get('gsc-chart');
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.gscProperty) return { error: 'Google nie skonfigurowane', weeks: [] };

  const client = await auth.getClient();
  const webmasters = google.webmasters({ version: 'v3', auth: client });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7 * 16);

  const res = await webmasters.searchanalytics.query({
    siteUrl: cfg.gscProperty,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ['date'],
      rowLimit: 500
    }
  });

  // Aggregate by week
  const weekMap = {};
  for (const r of (res.data.rows || [])) {
    const d = new Date(r.keys[0]);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = fmt(weekStart);
    if (!weekMap[key]) weekMap[key] = { date: key, clicks: 0, impressions: 0 };
    weekMap[key].clicks += r.clicks;
    weekMap[key].impressions += r.impressions;
  }

  const weeks = Object.values(weekMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-16);
  const result = { weeks };
  cache.set('gsc-chart', result);
  return result;
}

// ── GA4 — Traffic ──────────────────────────────────────────────────────────

async function fetchTraffic() {
  const cached = cache.get('ga4-traffic');
  if (cached) return cached;

  const cfg = getConfig();
  const auth = getAuth();
  if (!auth || !cfg.ga4PropertyId) return { error: 'Google nie skonfigurowane', traffic: null };

  const client = await auth.getClient();
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: client });

  const currQ = quarterRange(0);
  const prevQ = quarterRange(-1);

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

  const [curr, prev, weeklyTrend] = await Promise.all([
    queryTraffic(currQ),
    queryTraffic(prevQ),
    queryWeeklyTrend()
  ]);

  function pct(a, b) {
    if (!b) return null;
    return Math.round((a - b) / b * 100);
  }

  const result = {
    current: curr,
    previous: prev,
    sessionsDelta: pct(curr.sessions, prev.sessions),
    usersDelta: pct(curr.users, prev.users),
    newUsersDelta: pct(curr.newUsers, prev.newUsers),
    weeklyTrend,
    currQuarter: currQ.label,
    prevQuarter: prevQ.label
  };

  cache.set('ga4-traffic', result);
  return result;
}

module.exports = { fetchKeywords, fetchPages, fetchDevices, fetchChart, fetchTraffic };
