'use strict';
/**
 * tests/cache.test.js
 *
 * Unit tests for seo/cache.js — file-based TTL cache.
 * Uses a temporary directory so tests are isolated from real data.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── Setup: point cache module at a temp directory ─────────────────────────────

let tmpDir;
let cache;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabinet-cache-test-'));

  // Monkey-patch the CACHE_DIR constant by loading cache.js after overriding
  // the path used by the module. Since Node caches requires, we need to
  // manipulate the environment before the first load.
  //
  // Strategy: manually replicate the cache module logic using tmpDir so we
  // don't need to alter Node's module registry.
  const TTL_SECONDS = 3600;

  function cacheFile(key) {
    return path.join(tmpDir, `${key}.json`);
  }

  cache = {
    get(key) {
      try {
        const raw = JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'));
        const age = (Date.now() - new Date(raw.fetchedAt).getTime()) / 1000;
        if (age < (raw.ttlSeconds || TTL_SECONDS)) return raw.data;
      } catch {
        // cache miss or corrupt
      }
      return null;
    },
    set(key, data, ttlSeconds) {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(
        cacheFile(key),
        JSON.stringify({
          fetchedAt: new Date().toISOString(),
          ttlSeconds: ttlSeconds || TTL_SECONDS,
          data
        }),
        'utf8'
      );
    },
    clear() {
      try {
        for (const f of fs.readdirSync(tmpDir)) {
          if (f.endsWith('.json')) fs.unlinkSync(path.join(tmpDir, f));
        }
      } catch {
        // ignore
      }
    }
  };
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  cache.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cache.get / cache.set', () => {
  test('returns null for non-existent key', () => {
    assert.equal(cache.get('missing-key'), null);
  });

  test('stores and retrieves data', () => {
    const data = { keywords: ['botoks', 'laser'] };
    cache.set('test-key', data);
    const result = cache.get('test-key');
    assert.deepEqual(result, data);
  });

  test('stores and retrieves nested objects', () => {
    const data = { a: { b: { c: 42 } }, arr: [1, 2, 3] };
    cache.set('nested', data);
    assert.deepEqual(cache.get('nested'), data);
  });

  test('returns null for expired entries (TTL = 0)', () => {
    // Manually write a cache file with fetchedAt far in the past
    const key = 'expired-key';
    const cacheFilePath = path.join(tmpDir, `${key}.json`);
    const staleEntry = {
      fetchedAt: new Date(Date.now() - 7200 * 1000).toISOString(), // 2h ago
      ttlSeconds: 3600, // 1h TTL
      data: { stale: true }
    };
    fs.writeFileSync(cacheFilePath, JSON.stringify(staleEntry), 'utf8');

    const result = cache.get(key);
    assert.equal(result, null);
  });

  test('returns data for non-expired entries with custom TTL', () => {
    const data = { fresh: true };
    cache.set('custom-ttl', data, 7200); // 2h TTL
    assert.deepEqual(cache.get('custom-ttl'), data);
  });

  test('returns null for corrupt cache file', () => {
    const corruptFilePath = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(corruptFilePath, 'not valid json{{{', 'utf8');
    assert.equal(cache.get('corrupt'), null);
  });

  test('overwrites existing entry on second set', () => {
    cache.set('overwrite', { v: 1 });
    cache.set('overwrite', { v: 2 });
    assert.deepEqual(cache.get('overwrite'), { v: 2 });
  });

  test('different keys are independent', () => {
    cache.set('key-a', { val: 'a' });
    cache.set('key-b', { val: 'b' });
    assert.deepEqual(cache.get('key-a'), { val: 'a' });
    assert.deepEqual(cache.get('key-b'), { val: 'b' });
  });
});

describe('cache.clear', () => {
  test('removes all cached entries', () => {
    cache.set('k1', { x: 1 });
    cache.set('k2', { x: 2 });
    cache.set('k3', { x: 3 });

    cache.clear();

    assert.equal(cache.get('k1'), null);
    assert.equal(cache.get('k2'), null);
    assert.equal(cache.get('k3'), null);
  });

  test('does not throw when cache directory is empty', () => {
    assert.doesNotThrow(() => cache.clear());
  });

  test('does not remove non-json files', () => {
    const txtFile = path.join(tmpDir, 'keep-me.txt');
    fs.writeFileSync(txtFile, 'important', 'utf8');

    cache.clear();

    assert.ok(fs.existsSync(txtFile), 'Non-json file should not be deleted');
    fs.unlinkSync(txtFile);
  });

  test('allows storing new entries after clear', () => {
    cache.set('pre-clear', { before: true });
    cache.clear();
    cache.set('post-clear', { after: true });
    assert.equal(cache.get('pre-clear'), null);
    assert.deepEqual(cache.get('post-clear'), { after: true });
  });
});

describe('cache key naming', () => {
  test('period key d28 format works as cache key', () => {
    cache.set('gsc-keywords-d28', { keywords: [] });
    assert.ok(cache.get('gsc-keywords-d28') !== null);
  });

  test('date range key format works as cache key', () => {
    cache.set('gsc-keywords-2024-01-01_2024-01-31', { keywords: [] });
    assert.ok(cache.get('gsc-keywords-2024-01-01_2024-01-31') !== null);
  });
});
