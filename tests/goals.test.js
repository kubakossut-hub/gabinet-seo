'use strict';
/**
 * tests/goals.test.js
 *
 * Unit tests for seo/goals.js — goal type definitions and evaluation logic.
 * Tests use Node.js built-in test runner (node:test) — no external deps needed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { GOAL_TYPES } = require('../seo/goals');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKwData(keywords = []) {
  return { keywords };
}

function makeTrafficData({ sessions = 0, sessionsDelta = null } = {}) {
  return { current: { sessions }, sessionsDelta };
}

// ── keyword_position ──────────────────────────────────────────────────────────

describe('GOAL_TYPES.keyword_position', () => {
  const { evaluate } = GOAL_TYPES.keyword_position;

  test('status ok when position <= maxPosition', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', position: 4.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.status, 'ok');
    assert.equal(result.current, 4.0);
    assert.equal(result.target, 5);
    assert.ok(result.progress === 100);
  });

  test('status warn when position is up to 30% above target', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', position: 6.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.status, 'warn');
  });

  test('status fail when position > 130% of target', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', position: 20 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.status, 'fail');
  });

  test('status unknown when keyword not in data', () => {
    const kwData = makeKwData([]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.status, 'unknown');
    assert.equal(result.current, null);
  });

  test('case-insensitive keyword matching', () => {
    const kwData = makeKwData([{ keyword: 'BOTOKS WARSZAWA', position: 3.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.status, 'ok');
  });

  test('progress is clamped to 100 when target exactly met', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', position: 5.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.equal(result.progress, 100);
  });

  test('progress < 100 when far from target', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', position: 50 }]);
    const result = evaluate({ keyword: 'botoks warszawa', maxPosition: 5 }, kwData);
    assert.ok(result.progress < 100);
    assert.ok(result.progress >= 0);
  });
});

// ── keywords_in_top_n ─────────────────────────────────────────────────────────

describe('GOAL_TYPES.keywords_in_top_n', () => {
  const { evaluate } = GOAL_TYPES.keywords_in_top_n;

  test('counts keywords within topN correctly', () => {
    const kwData = makeKwData([
      { keyword: 'a', position: 3 },
      { keyword: 'b', position: 8 },
      { keyword: 'c', position: 15 },
      { keyword: 'd', position: null },
    ]);
    const result = evaluate({ topN: '10', minCount: 2 }, kwData);
    assert.equal(result.current, 2);
    assert.equal(result.target, 2);
    assert.equal(result.status, 'ok');
  });

  test('status ok when count >= minCount', () => {
    const kwData = makeKwData([
      { keyword: 'a', position: 1 },
      { keyword: 'b', position: 2 },
      { keyword: 'c', position: 3 },
    ]);
    const result = evaluate({ topN: '10', minCount: 3 }, kwData);
    assert.equal(result.status, 'ok');
    assert.equal(result.progress, 100);
  });

  test('status warn when count is 80-99% of minCount', () => {
    const kwData = makeKwData([
      { keyword: 'a', position: 1 },
      { keyword: 'b', position: 2 },
      { keyword: 'c', position: 15 }, // outside top 10
    ]);
    // 2 in top 10, minCount = 3 → 2/3 ≈ 67% → fail (not warn)
    const result = evaluate({ topN: '10', minCount: 3 }, kwData);
    assert.equal(result.status, 'fail');
  });

  test('status warn when count is between 80% and 100% of target', () => {
    // 4 out of 5 = 80% exactly → warn threshold
    const kwData = makeKwData([
      { keyword: 'a', position: 1 },
      { keyword: 'b', position: 2 },
      { keyword: 'c', position: 3 },
      { keyword: 'd', position: 4 },
      { keyword: 'e', position: 15 },
    ]);
    const result = evaluate({ topN: '10', minCount: 5 }, kwData);
    assert.equal(result.status, 'warn');
  });

  test('status unknown when minCount is missing', () => {
    const kwData = makeKwData([{ keyword: 'a', position: 1 }]);
    const result = evaluate({ topN: '10' }, kwData);
    assert.equal(result.status, 'unknown');
  });
});

// ── traffic_growth ────────────────────────────────────────────────────────────

describe('GOAL_TYPES.traffic_growth', () => {
  const { evaluate } = GOAL_TYPES.traffic_growth;

  test('status ok when growth >= target', () => {
    const traffic = makeTrafficData({ sessionsDelta: 25 });
    const result = evaluate({ minGrowthPct: 20 }, null, traffic);
    assert.equal(result.status, 'ok');
    assert.equal(result.current, 25);
    assert.equal(result.target, 20);
    assert.equal(result.progress, 100);
  });

  test('status warn when within 5 percentage points below target', () => {
    const traffic = makeTrafficData({ sessionsDelta: 16 });
    const result = evaluate({ minGrowthPct: 20 }, null, traffic);
    assert.equal(result.status, 'warn');
  });

  test('status fail when well below target', () => {
    const traffic = makeTrafficData({ sessionsDelta: 5 });
    const result = evaluate({ minGrowthPct: 20 }, null, traffic);
    assert.equal(result.status, 'fail');
  });

  test('status unknown when no traffic data', () => {
    const result = evaluate({ minGrowthPct: 20 }, null, null);
    assert.equal(result.status, 'unknown');
  });

  test('negative growth target: ok if growth >= 0', () => {
    const traffic = makeTrafficData({ sessionsDelta: 0 });
    const result = evaluate({ minGrowthPct: -10 }, null, traffic);
    // target is negative, current 0 >= -10 → ok
    assert.equal(result.status, 'ok');
  });

  test('progress is proportional when below target', () => {
    const traffic = makeTrafficData({ sessionsDelta: 10 });
    const result = evaluate({ minGrowthPct: 20 }, null, traffic);
    assert.equal(result.progress, 50); // 10/20 = 50%
  });
});

// ── min_sessions ──────────────────────────────────────────────────────────────

describe('GOAL_TYPES.min_sessions', () => {
  const { evaluate } = GOAL_TYPES.min_sessions;

  test('status ok when sessions >= minSessions', () => {
    const traffic = makeTrafficData({ sessions: 600 });
    const result = evaluate({ minSessions: 500 }, null, traffic);
    assert.equal(result.status, 'ok');
    assert.equal(result.current, 600);
    assert.equal(result.progress, 100);
  });

  test('status warn when sessions in 80-99% of target', () => {
    const traffic = makeTrafficData({ sessions: 420 });
    const result = evaluate({ minSessions: 500 }, null, traffic);
    assert.equal(result.status, 'warn');
  });

  test('status fail when sessions < 80% of target', () => {
    const traffic = makeTrafficData({ sessions: 200 });
    const result = evaluate({ minSessions: 500 }, null, traffic);
    assert.equal(result.status, 'fail');
  });

  test('status unknown when sessions data missing', () => {
    const result = evaluate({ minSessions: 500 }, null, { current: {} });
    assert.equal(result.status, 'unknown');
    assert.equal(result.current, null);
  });

  test('status unknown when minSessions param missing', () => {
    const traffic = makeTrafficData({ sessions: 300 });
    const result = evaluate({}, null, traffic);
    assert.equal(result.status, 'unknown');
  });

  test('progress capped at 100', () => {
    const traffic = makeTrafficData({ sessions: 1000 });
    const result = evaluate({ minSessions: 500 }, null, traffic);
    assert.equal(result.progress, 100);
  });
});

// ── keyword_ctr ───────────────────────────────────────────────────────────────

describe('GOAL_TYPES.keyword_ctr', () => {
  const { evaluate } = GOAL_TYPES.keyword_ctr;

  test('status ok when ctr >= minCtr', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', ctr: 6.5 }]);
    const result = evaluate({ keyword: 'botoks warszawa', minCtr: 5 }, kwData);
    assert.equal(result.status, 'ok');
    assert.equal(result.current, 6.5);
    assert.equal(result.progress, 100);
  });

  test('status warn when ctr is 80-99% of minCtr', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', ctr: 4.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', minCtr: 5 }, kwData);
    assert.equal(result.status, 'warn');
  });

  test('status fail when ctr < 80% of minCtr', () => {
    const kwData = makeKwData([{ keyword: 'botoks warszawa', ctr: 1.5 }]);
    const result = evaluate({ keyword: 'botoks warszawa', minCtr: 5 }, kwData);
    assert.equal(result.status, 'fail');
  });

  test('status unknown when keyword not found', () => {
    const kwData = makeKwData([]);
    const result = evaluate({ keyword: 'botoks warszawa', minCtr: 5 }, kwData);
    assert.equal(result.status, 'unknown');
  });

  test('case-insensitive matching', () => {
    const kwData = makeKwData([{ keyword: 'BOTOKS WARSZAWA', ctr: 8.0 }]);
    const result = evaluate({ keyword: 'botoks warszawa', minCtr: 5 }, kwData);
    assert.equal(result.status, 'ok');
  });
});

// ── min_impressions ───────────────────────────────────────────────────────────

describe('GOAL_TYPES.min_impressions', () => {
  const { evaluate } = GOAL_TYPES.min_impressions;

  test('sums impressions across all keywords', () => {
    const kwData = makeKwData([
      { keyword: 'a', impressions: 5000 },
      { keyword: 'b', impressions: 3000 },
      { keyword: 'c', impressions: 2000 },
    ]);
    const result = evaluate({ minImpressions: 10000 }, kwData);
    assert.equal(result.current, 10000);
    assert.equal(result.status, 'ok');
  });

  test('status warn when 80-99% of target', () => {
    const kwData = makeKwData([
      { keyword: 'a', impressions: 8500 },
    ]);
    const result = evaluate({ minImpressions: 10000 }, kwData);
    assert.equal(result.status, 'warn');
  });

  test('status fail when below 80% of target', () => {
    const kwData = makeKwData([
      { keyword: 'a', impressions: 2000 },
    ]);
    const result = evaluate({ minImpressions: 10000 }, kwData);
    assert.equal(result.status, 'fail');
  });

  test('treats missing impressions as 0', () => {
    const kwData = makeKwData([
      { keyword: 'a' }, // no impressions field
    ]);
    const result = evaluate({ minImpressions: 5000 }, kwData);
    assert.equal(result.current, 0);
    assert.equal(result.status, 'fail');
  });

  test('status unknown when minImpressions param missing', () => {
    const kwData = makeKwData([{ keyword: 'a', impressions: 1000 }]);
    const result = evaluate({}, kwData);
    assert.equal(result.status, 'unknown');
  });
});

// ── GOAL_TYPES structure ──────────────────────────────────────────────────────

describe('GOAL_TYPES structure', () => {
  const expectedKeys = [
    'keyword_position',
    'keywords_in_top_n',
    'traffic_growth',
    'min_sessions',
    'keyword_ctr',
    'min_impressions',
  ];

  test('exports all expected goal types', () => {
    for (const key of expectedKeys) {
      assert.ok(key in GOAL_TYPES, `Missing goal type: ${key}`);
    }
  });

  test('each goal type has required fields', () => {
    for (const [key, type] of Object.entries(GOAL_TYPES)) {
      assert.ok(typeof type.label === 'string', `${key}: missing label`);
      assert.ok(typeof type.hint === 'string', `${key}: missing hint`);
      assert.ok(Array.isArray(type.fields), `${key}: fields must be array`);
      assert.ok(typeof type.evaluate === 'function', `${key}: missing evaluate function`);
      assert.ok(typeof type.desc === 'function', `${key}: desc must be a function`);
      assert.ok(typeof type.unit === 'string', `${key}: missing unit`);
    }
  });

  test('desc function returns non-empty string', () => {
    const testParams = {
      keyword_position:   { keyword: 'botoks', maxPosition: 5 },
      keywords_in_top_n:  { topN: '10', minCount: 5 },
      traffic_growth:     { minGrowthPct: 20 },
      min_sessions:       { minSessions: 500 },
      keyword_ctr:        { keyword: 'botoks', minCtr: 5 },
      min_impressions:    { minImpressions: 10000 },
    };
    for (const [key, params] of Object.entries(testParams)) {
      const desc = GOAL_TYPES[key].desc(params);
      assert.ok(typeof desc === 'string' && desc.length > 0, `${key}: desc() returned empty string`);
    }
  });
});
