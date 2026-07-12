import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health/live', () => {
  it('reports the process alive without consulting storage', async () => {
    const res = await request(app).get('/api/health/live').expect(200);

    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptime, 'number');

    // Liveness must say nothing about the database. If it did, a slow database
    // would read as a dead process and the orchestrator would restart a server
    // that was fine — turning a blip into a restart loop.
    assert.equal(res.body.storage, undefined);
  });
});

/**
 * /api/health/ready has no test here on purpose: terminus registers it on the
 * http.Server, below Express, so `supertest(createApp())` cannot reach it —
 * and that is the point. It has to answer 503 during shutdown, which a route
 * inside the Express app cannot do.
 *
 * It is exercised against a real booted server instead:
 *   npm run dev
 *   curl -i localhost:{{port}}/api/health/ready
 */
