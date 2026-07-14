import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTestApp, teardown } from './helpers.js';

let app;

before(async () => {
  app = await buildTestApp();
});
after(() => teardown(app));

test('liveness reports the process alive without consulting storage', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health/live' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
});

test('readiness reports the storage it can actually reach', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health/ready' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().storage, 'up');
});

test('an unknown route returns the one error envelope', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/nope' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.status, 404);
});
