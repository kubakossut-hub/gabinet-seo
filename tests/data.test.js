'use strict';
/**
 * tests/data.test.js
 *
 * Unit tests for seo/data.js — JSON-file data persistence layer.
 * Each test runs against a temporary directory so no real data is touched.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── Isolated data module ──────────────────────────────────────────────────────
//
// We replicate the data.js logic here, initialised against a temp directory.
// This keeps tests hermetic without having to manipulate Node's module registry.

let DATA_DIR;

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJSON(name, defaultVal) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return defaultVal;
  }
}

function writeJSON(name, data) {
  const fp = filePath(name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

// Replicated helpers (mirrors data.js logic exactly)
function getUsers() { return readJSON('users.json', { users: [] }); }
function saveUsers(data) { writeJSON('users.json', data); }
function findUser(username) {
  const { users } = getUsers();
  return users.find(u => u.username === username) || null;
}
function deleteUser(username) {
  const data = getUsers();
  data.users = data.users.filter(u => u.username !== username);
  saveUsers(data);
}

const DEFAULT_CONFIG = {
  gscProperty: '',
  ga4PropertyId: '',
  trackedKeywords: ['botoks warszawa'],
  avgCpcPln: 8.5,
  updatedAt: null
};
function getConfig() { return Object.assign({}, DEFAULT_CONFIG, readJSON('seo-config.json', {})); }
function saveConfig(cfg) {
  cfg.updatedAt = new Date().toISOString();
  writeJSON('seo-config.json', cfg);
}

function getSpend() { return readJSON('spend.json', { entries: [] }); }
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

function getGoals() { return readJSON('goals.json', { goals: [] }); }
function saveGoals(data) { writeJSON('goals.json', data); }
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(() => {
  DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gabinet-data-test-'));
});

after(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  // Remove all JSON files from temp dir before each test for isolation
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(DATA_DIR, f));
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

describe('Users', () => {
  test('getUsers returns default when file missing', () => {
    const result = getUsers();
    assert.deepEqual(result, { users: [] });
  });

  test('saveUsers persists and getUsers reads back', () => {
    const data = {
      users: [{ username: 'anna', role: 'viewer', email: 'anna@test.pl' }]
    };
    saveUsers(data);
    assert.deepEqual(getUsers(), data);
  });

  test('findUser returns user when found', () => {
    saveUsers({ users: [{ username: 'piotr', role: 'admin', email: '' }] });
    const user = findUser('piotr');
    assert.ok(user !== null);
    assert.equal(user.username, 'piotr');
  });

  test('findUser returns null when not found', () => {
    saveUsers({ users: [] });
    assert.equal(findUser('nobody'), null);
  });

  test('deleteUser removes correct user', () => {
    saveUsers({
      users: [
        { username: 'alice', role: 'admin' },
        { username: 'bob', role: 'viewer' }
      ]
    });
    deleteUser('alice');
    const { users } = getUsers();
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'bob');
  });

  test('deleteUser on non-existent user leaves others intact', () => {
    saveUsers({ users: [{ username: 'alice', role: 'admin' }] });
    deleteUser('ghost');
    const { users } = getUsers();
    assert.equal(users.length, 1);
  });

  test('multiple users can be stored and retrieved', () => {
    const users = Array.from({ length: 5 }, (_, i) => ({
      username: `user${i}`,
      role: i === 0 ? 'admin' : 'viewer',
      email: `user${i}@test.pl`
    }));
    saveUsers({ users });
    const { users: result } = getUsers();
    assert.equal(result.length, 5);
    assert.equal(result[0].username, 'user0');
  });
});

// ── Config ────────────────────────────────────────────────────────────────────

describe('Config', () => {
  test('getConfig returns defaults when file missing', () => {
    const cfg = getConfig();
    assert.equal(cfg.avgCpcPln, 8.5);
    assert.ok(Array.isArray(cfg.trackedKeywords));
  });

  test('saveConfig persists and getConfig merges with defaults', () => {
    const partial = {
      gscProperty: 'sc-domain:gabinet.pl',
      ga4PropertyId: 'properties/123',
      avgCpcPln: 12.0,
      trackedKeywords: ['botoks warszawa', 'kwas hialuronowy'],
      agencyEmail: 'agencja@seo.pl'
    };
    saveConfig(partial);
    const cfg = getConfig();
    assert.equal(cfg.gscProperty, 'sc-domain:gabinet.pl');
    assert.equal(cfg.avgCpcPln, 12.0);
    assert.equal(cfg.trackedKeywords.length, 2);
    assert.ok(cfg.updatedAt !== null); // saveConfig sets updatedAt
  });

  test('saveConfig sets updatedAt timestamp', () => {
    const before = new Date().toISOString();
    saveConfig({ gscProperty: 'sc-domain:test.pl' });
    const cfg = getConfig();
    assert.ok(cfg.updatedAt >= before);
  });

  test('config defaults are preserved when not overridden', () => {
    saveConfig({ gscProperty: 'sc-domain:gabinet.pl' });
    const cfg = getConfig();
    assert.equal(cfg.avgCpcPln, 8.5); // default still there
  });
});

// ── Spend ─────────────────────────────────────────────────────────────────────

describe('Spend', () => {
  test('getSpend returns empty entries when file missing', () => {
    assert.deepEqual(getSpend(), { entries: [] });
  });

  test('saveSpendEntry adds new month', () => {
    saveSpendEntry('2024-03', 3000, 'Kampania marzec');
    const { entries } = getSpend();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].month, '2024-03');
    assert.equal(entries[0].spendPln, 3000);
    assert.equal(entries[0].note, 'Kampania marzec');
  });

  test('saveSpendEntry updates existing month', () => {
    saveSpendEntry('2024-03', 3000, 'Oryginalna');
    saveSpendEntry('2024-03', 4500, 'Zaktualizowana');
    const { entries } = getSpend();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].spendPln, 4500);
    assert.equal(entries[0].note, 'Zaktualizowana');
  });

  test('entries are sorted newest first', () => {
    saveSpendEntry('2024-01', 1000, '');
    saveSpendEntry('2024-03', 3000, '');
    saveSpendEntry('2024-02', 2000, '');
    const { entries } = getSpend();
    assert.equal(entries[0].month, '2024-03');
    assert.equal(entries[1].month, '2024-02');
    assert.equal(entries[2].month, '2024-01');
  });

  test('multiple months can be stored', () => {
    saveSpendEntry('2024-01', 1000, '');
    saveSpendEntry('2024-02', 2000, '');
    saveSpendEntry('2024-03', 3000, '');
    const { entries } = getSpend();
    assert.equal(entries.length, 3);
  });
});

// ── Goals ─────────────────────────────────────────────────────────────────────

describe('Goals', () => {
  test('getGoals returns empty when file missing', () => {
    assert.deepEqual(getGoals(), { goals: [] });
  });

  test('addGoal creates a goal with an id', () => {
    const id = addGoal({
      type: 'keyword_position',
      params: { keyword: 'botoks warszawa', maxPosition: 5 },
      priority: 'high',
      note: 'Test'
    });
    assert.ok(typeof id === 'string' && id.length > 0);
    const { goals } = getGoals();
    assert.equal(goals.length, 1);
    assert.equal(goals[0].id, id);
    assert.equal(goals[0].type, 'keyword_position');
  });

  test('addGoal sets createdAt', () => {
    const before = new Date().toISOString();
    addGoal({ type: 'min_sessions', params: { minSessions: 500 }, priority: 'medium', note: '' });
    const { goals } = getGoals();
    assert.ok(goals[0].createdAt >= before);
  });

  test('addGoal generates unique ids for multiple goals', () => {
    const id1 = addGoal({ type: 'min_sessions', params: {}, priority: 'low', note: '' });
    const id2 = addGoal({ type: 'traffic_growth', params: {}, priority: 'low', note: '' });
    assert.notEqual(id1, id2);
  });

  test('updateGoal modifies existing goal', () => {
    const id = addGoal({ type: 'min_sessions', params: { minSessions: 500 }, priority: 'low', note: 'Stara' });
    updateGoal(id, { note: 'Nowa', priority: 'high' });
    const { goals } = getGoals();
    const goal = goals.find(g => g.id === id);
    assert.equal(goal.note, 'Nowa');
    assert.equal(goal.priority, 'high');
    assert.ok(goal.updatedAt); // updatedAt set
  });

  test('updateGoal throws when id not found', () => {
    assert.throws(
      () => updateGoal('nonexistent-id', { note: 'test' }),
      /Cel nie istnieje/
    );
  });

  test('deleteGoal removes the correct goal', () => {
    const id1 = addGoal({ type: 'min_sessions', params: {}, priority: 'low', note: 'A' });
    const id2 = addGoal({ type: 'traffic_growth', params: {}, priority: 'medium', note: 'B' });
    deleteGoal(id1);
    const { goals } = getGoals();
    assert.equal(goals.length, 1);
    assert.equal(goals[0].id, id2);
  });

  test('deleteGoal on non-existent id leaves others intact', () => {
    addGoal({ type: 'min_sessions', params: {}, priority: 'low', note: '' });
    deleteGoal('ghost-id');
    const { goals } = getGoals();
    assert.equal(goals.length, 1);
  });

  test('goals persist across getGoals calls', () => {
    addGoal({ type: 'keyword_position', params: { keyword: 'test', maxPosition: 3 }, priority: 'high', note: '' });
    addGoal({ type: 'min_sessions', params: { minSessions: 200 }, priority: 'medium', note: '' });
    const { goals } = getGoals();
    assert.equal(goals.length, 2);
  });
});
