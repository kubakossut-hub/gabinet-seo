const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const TTL_SECONDS = 3600; // 1 hour

function cacheFile(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function get(key) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(key), 'utf8'));
    const age = (Date.now() - new Date(raw.fetchedAt).getTime()) / 1000;
    if (age < (raw.ttlSeconds || TTL_SECONDS)) return raw.data;
  } catch {
    // cache miss or corrupt
  }
  return null;
}

function set(key, data, ttlSeconds) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    cacheFile(key),
    JSON.stringify({ fetchedAt: new Date().toISOString(), ttlSeconds: ttlSeconds || TTL_SECONDS, data }),
    'utf8'
  );
}

function clear() {
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(CACHE_DIR, f));
    }
  } catch {
    // ignore
  }
}

module.exports = { get, set, clear };
