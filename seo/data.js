const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJSON(name, defaultVal) {
  const fp = filePath(name);
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return defaultVal;
  }
}

function writeJSON(name, data) {
  const fp = filePath(name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

// ── Users ──────────────────────────────────────────────────────────────────

// SECURITY: change this password immediately after first login via the Admin panel.
const DEFAULT_ADMIN_PASSWORD = 'admin123';

async function initUsers() {
  const fp = filePath('users.json');
  if (fs.existsSync(fp)) return;
  console.warn('[SECURITY] Initialising default admin account with password "admin123" — change it immediately after first login.');
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  writeJSON('users.json', {
    firstRun: true,
    users: [{ username: 'admin', passwordHash: hash, role: 'admin', email: '', createdAt: new Date().toISOString() }]
  });
}

function getUsers() {
  return readJSON('users.json', { users: [] });
}

function saveUsers(data) {
  writeJSON('users.json', data);
}

function findUser(username) {
  const { users } = getUsers();
  return users.find(u => u.username === username) || null;
}

async function changePassword(username, newPassword) {
  const data = getUsers();
  const user = data.users.find(u => u.username === username);
  if (!user) throw new Error('User not found');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(data);
}

async function createUser(username, password, role, email) {
  const data = getUsers();
  if (data.users.find(u => u.username === username)) throw new Error('User already exists');
  const hash = await bcrypt.hash(password, 10);
  data.users.push({ username, passwordHash: hash, role, email: email || '', createdAt: new Date().toISOString() });
  saveUsers(data);
}

function deleteUser(username) {
  const data = getUsers();
  data.users = data.users.filter(u => u.username !== username);
  saveUsers(data);
}

// ── SEO Config ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  gscProperty: process.env.GSC_PROPERTY || '',
  ga4PropertyId: process.env.GA4_PROPERTY_ID || '',
  trackedKeywords: [
    'botoks warszawa',
    'wolumetria warszawa',
    'laser frakcyjny warszawa',
    'powiększanie ust warszawa',
    'kwas hialuronowy warszawa',
    'mezoterapia warszawa',
    'lipoliza warszawa',
    'lifting warszawa'
  ],
  avgCpcPln: 8.5,
  updatedAt: null
};

function getConfig() {
  const saved = readJSON('seo-config.json', {});
  return Object.assign({}, DEFAULT_CONFIG, saved);
}

function saveConfig(cfg) {
  cfg.updatedAt = new Date().toISOString();
  writeJSON('seo-config.json', cfg);
}

// ── Spend ──────────────────────────────────────────────────────────────────

function getSpend() {
  return readJSON('spend.json', { entries: [] });
}

function saveSpendEntry(month, spendPln, note) {
  const data = getSpend();
  const idx = data.entries.findIndex(e => e.month === month);
  if (idx >= 0) {
    data.entries[idx] = { month, spendPln, note };
  } else {
    data.entries.push({ month, spendPln, note });
  }
  data.entries.sort((a, b) => b.month.localeCompare(a.month));
  writeJSON('spend.json', data);
}

// ── Supplier ───────────────────────────────────────────────────────────────

function getSupplier() {
  return readJSON('supplier.json', { entries: [] });
}

function saveSupplierEntry(month, entry) {
  const data = getSupplier();
  const idx = data.entries.findIndex(e => e.month === month);
  if (idx >= 0) {
    data.entries[idx] = Object.assign({ month }, entry);
  } else {
    data.entries.push(Object.assign({ month }, entry));
  }
  data.entries.sort((a, b) => b.month.localeCompare(a.month));
  writeJSON('supplier.json', data);
}

// ── Goals ──────────────────────────────────────────────────────────────────

function getGoals() {
  return readJSON('goals.json', { goals: [] });
}

function saveGoals(data) {
  writeJSON('goals.json', data);
}

function addGoal(goal) {
  const data = getGoals();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  data.goals.push({ id, ...goal, createdAt: new Date().toISOString() });
  saveGoals(data);
  return id;
}

function updateGoal(id, updates) {
  const data = getGoals();
  const goal = data.goals.find(g => g.id === id);
  if (!goal) throw new Error('Cel nie istnieje');
  Object.assign(goal, updates, { updatedAt: new Date().toISOString() });
  saveGoals(data);
}

function deleteGoal(id) {
  const data = getGoals();
  data.goals = data.goals.filter(g => g.id !== id);
  saveGoals(data);
}

module.exports = {
  initUsers, findUser, getUsers, saveUsers, changePassword, createUser, deleteUser,
  getConfig, saveConfig,
  getSpend, saveSpendEntry,
  getSupplier, saveSupplierEntry,
  getGoals, saveGoals, addGoal, updateGoal, deleteGoal
};
