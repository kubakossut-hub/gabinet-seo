const express = require('express');
const session = require('express-session');
const path = require('path');
const router = express.Router();

const auth = require('./auth');
const data = require('./data');
const cache = require('./cache');
const google = require('./google');
const { evaluateGoals, GOAL_TYPES } = require('./goals');

// ── Session ────────────────────────────────────────────────────────────────

router.use(session({
  secret: process.env.SESSION_SECRET || 'seo-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000 // 8h
  }
}));

// ── Static assets ──────────────────────────────────────────────────────────

router.use('/static', express.static(path.join(__dirname, '..', 'public', 'seo')));

// ── Page routes ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.redirect(req.session.user ? '/seo/dashboard' : '/seo/login');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/seo/dashboard');
  res.sendFile(path.join(__dirname, '..', 'public', 'seo', 'login.html'));
});

router.get('/dashboard', auth.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'seo', 'dashboard.html'));
});

router.get('/admin', auth.requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'seo', 'admin.html'));
});

// ── Auth API ───────────────────────────────────────────────────────────────

router.post('/api/login', auth.login);
router.post('/api/logout', auth.logout);
router.get('/api/me', auth.me);

// ── Data API (all logged-in users) ─────────────────────────────────────────

function parsePeriod(req) {
  const days = Math.min(Math.max(parseInt(req.query.days) || 28, 1), 365);
  const from = req.query.from || null;
  const to   = req.query.to   || null;
  return { days, from, to };
}

router.get('/api/keywords', auth.requireAuth, async (req, res) => {
  try { res.json(await google.fetchKeywords(parsePeriod(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/api/traffic', auth.requireAuth, async (req, res) => {
  try { res.json(await google.fetchTraffic(parsePeriod(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/api/pages', auth.requireAuth, async (req, res) => {
  try { res.json(await google.fetchPages(parsePeriod(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/api/devices', auth.requireAuth, async (req, res) => {
  try { res.json(await google.fetchDevices(parsePeriod(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/api/chart', auth.requireAuth, async (req, res) => {
  try { res.json(await google.fetchChart(parsePeriod(req))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/supplier', auth.requireAuth, (req, res) => {
  res.json(data.getSupplier());
});

router.get('/api/spend', auth.requireAuth, (req, res) => {
  const cfg = data.getConfig();
  const spendData = data.getSpend();
  const avgCpc = cfg.avgCpcPln || 8.5;
  const result = spendData.entries.map(e => {
    return {
      ...e,
      organicValue: null, // calculated on frontend using traffic data
      avgCpc
    };
  });
  res.json({ entries: result, avgCpc });
});

// ── Admin API ──────────────────────────────────────────────────────────────

router.get('/api/admin/users', auth.requireAdmin, (req, res) => {
  const { users } = data.getUsers();
  res.json(users.map(u => ({ username: u.username, role: u.role, email: u.email || '', createdAt: u.createdAt })));
});

router.post('/api/admin/users', auth.requireAdmin, async (req, res) => {
  const { username, password, role, email } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: 'Wymagane: username, password, role' });
  if (!['admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Rola musi być: admin lub viewer' });
  try {
    await data.createUser(username, password, role, email);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/api/admin/users/:username', auth.requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { password, role, email } = req.body || {};
  try {
    if (password) await data.changePassword(username, password);
    const d = data.getUsers();
    const user = d.users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
    if (role) {
      if (!['admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Nieprawidłowa rola' });
      user.role = role;
    }
    if (email !== undefined) user.email = email;
    data.saveUsers(d);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/api/admin/users/:username', auth.requireAdmin, (req, res) => {
  const { username } = req.params;
  if (username === req.session.user.username) {
    return res.status(400).json({ error: 'Nie możesz usunąć własnego konta' });
  }
  data.deleteUser(username);
  res.json({ ok: true });
});

router.get('/api/admin/config', auth.requireAdmin, (req, res) => {
  res.json(data.getConfig());
});

router.post('/api/admin/config', auth.requireAdmin, (req, res) => {
  const { gscProperty, ga4PropertyId, trackedKeywords, avgCpcPln, agencyEmail } = req.body || {};
  const cfg = data.getConfig();
  if (gscProperty !== undefined) cfg.gscProperty = gscProperty;
  if (ga4PropertyId !== undefined) cfg.ga4PropertyId = ga4PropertyId;
  if (Array.isArray(trackedKeywords)) cfg.trackedKeywords = trackedKeywords.filter(Boolean);
  if (avgCpcPln !== undefined) cfg.avgCpcPln = parseFloat(avgCpcPln) || 8.5;
  if (agencyEmail !== undefined) cfg.agencyEmail = agencyEmail;
  data.saveConfig(cfg);
  cache.clear(); // Config changed — invalidate cache
  res.json({ ok: true });
});

router.get('/api/public/config', auth.requireAuth, (req, res) => {
  const cfg = data.getConfig();
  res.json({ agencyEmail: cfg.agencyEmail || '' });
});

router.post('/api/admin/spend', auth.requireAdmin, (req, res) => {
  const { month, spendPln, note } = req.body || {};
  if (!month || spendPln === undefined) return res.status(400).json({ error: 'Wymagane: month (YYYY-MM), spendPln' });
  data.saveSpendEntry(month, parseFloat(spendPln), note || '');
  res.json({ ok: true });
});

// NOTE Q5: `month` z URL nie jest walidowany pod kątem formatu YYYY-MM.
// Niskie ryzyko (admin-only), ale przy dodaniu bazy danych warto dodać regex: /^\d{4}-\d{2}$/.
router.put('/api/admin/supplier/:month', auth.requireAdmin, (req, res) => {
  const { month } = req.params;
  const entry = req.body || {};
  data.saveSupplierEntry(month, entry);
  res.json({ ok: true });
});

router.post('/api/admin/cache/clear', auth.requireAdmin, (req, res) => {
  cache.clear();
  res.json({ ok: true, message: 'Cache wyczyszczony' });
});

// ── Goals API ──────────────────────────────────────────────────────────────

// All authenticated users can read evaluated goals
router.get('/api/goals', auth.requireAuth, async (req, res) => {
  try {
    const { goals } = data.getGoals();
    const evaluated = await evaluateGoals(goals, parsePeriod(req));
    res.json({ goals: evaluated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Goal type definitions (for admin form)
router.get('/api/admin/goal-types', auth.requireAdmin, (req, res) => {
  const types = Object.entries(GOAL_TYPES).map(([key, t]) => ({
    key, label: t.label, hint: t.hint, fields: t.fields, suggestions: t.suggestions || []
  }));
  res.json({ types });
});

// Create goal
router.post('/api/admin/goals', auth.requireAdmin, (req, res) => {
  const { type, params, priority, note } = req.body || {};
  if (!type || !GOAL_TYPES[type]) return res.status(400).json({ error: 'Nieznany typ celu' });
  try {
    const id = data.addGoal({ type, params: params || {}, priority: priority || 'medium', note: note || '' });
    res.json({ ok: true, id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update goal
router.put('/api/admin/goals/:id', auth.requireAdmin, (req, res) => {
  try {
    data.updateGoal(req.params.id, req.body || {});
    res.json({ ok: true });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// Delete goal
router.delete('/api/admin/goals/:id', auth.requireAdmin, (req, res) => {
  try {
    data.deleteGoal(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// ── First-run check ────────────────────────────────────────────────────────

router.get('/api/firstrun', (req, res) => {
  const d = data.getUsers();
  res.json({ firstRun: !!d.firstRun });
});

module.exports = router;
