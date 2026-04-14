const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

test('GET /health returns JSON status ok', async () => {
  const res = await request(app)
    .get('/health')
    .expect(200)
    .expect('Content-Type', /json/);
  assert.deepEqual(res.body, { status: 'ok' });
});
