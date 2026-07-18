import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('POST /api/users', () => {
  it('creates a user and never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'ada@example.com', name: 'Ada', password: 'supersecret' })
      .expect(201);

    assert.equal(res.body.email, 'ada@example.com');
    assert.equal(res.body.passwordHash, undefined);
    assert.ok(res.body.id);
  });

  it('rejects an invalid payload with field-level details', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'not-an-email', name: 'A', password: 'short' })
      .expect(400);

    assert.equal(res.body.error.message, 'Validation failed');
    assert.ok(res.body.error.details.length >= 2);
  });

  it('refuses a duplicate email', async () => {
    const payload = { email: 'dup@example.com', name: 'Dup', password: 'supersecret' };
    await request(app).post('/api/users').send(payload).expect(201);
    await request(app).post('/api/users').send(payload).expect(409);
  });
});

describe('GET /api/users', () => {
  it('paginates', async () => {
    const res = await request(app).get('/api/users?page=1&limit=5').expect(200);
    assert.deepEqual(Object.keys(res.body).sort(), ['items', 'limit', 'page', 'pages', 'total']);
  });
});

describe('DELETE /api/users/:id', () => {
  it('requires authentication', async () => {
    await request(app).delete('/api/users/00000000-0000-0000-0000-000000000000').expect(401);
  });
});
