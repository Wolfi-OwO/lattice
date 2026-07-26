import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTestApp, teardown } from './helpers.js';

let app;

before(async () => {
  app = await buildTestApp();
});
after(() => teardown(app));

test('liveness reports the process alive without consulting storage', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health/liveness' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');

  /*
   * Liveness must say nothing about the database. If it did, a slow database
   * would read as a dead process and the orchestrator would restart a server
   * that was fine — turning a blip into a restart loop.
   */
  assert.equal(response.json().storage, undefined);
});

/**
 * /api/health/readiness has no test here on purpose: terminus registers it on the
 * http.Server, below Fastify, so `app.inject()` — which calls Fastify's router
 * directly and never opens a socket — cannot reach it. That is the point. It has
 * to answer 503 during shutdown, which a route inside the app cannot do.
 *
 * It is exercised against a real booted server instead:
 *   npm run dev
 *   curl -i localhost:{{port}}/api/health/readiness
 */

test('an unknown route returns the one error envelope', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/nope' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.status, 404);
});
