import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { authHeader, buildTestApp, clearUsers, teardown } from './helpers.js';

let app;

before(async () => {
  app = await buildTestApp();
});
after(() => teardown(app));
beforeEach(clearUsers);

const ADA = { email: 'ada@example.com', name: 'Ada Lovelace', password: 'correct-horse' };

async function createAda() {
  return app.inject({ method: 'POST', url: '/api/users', payload: ADA });
}

test('creates a user and never returns the password hash', async () => {
  const response = await createAda();
  const body = response.json();

  assert.equal(response.statusCode, 201);
  assert.equal(body.email, ADA.email);

  // The response schema has no passwordHash property, so Fastify drops it on the
  // way out even if a bug were to put it there. This asserts that seam holds.
  assert.equal(body.passwordHash, undefined);
  assert.equal(body.password, undefined);
});

test('rejects an invalid payload with field-level details', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/users',
    payload: { email: 'not-an-email', name: 'A', password: 'short' },
  });

  assert.equal(response.statusCode, 400);

  const { error } = response.json();
  assert.equal(error.status, 400);
  assert.ok(error.details.length > 0, 'a validation failure names the fields that failed');
});

test('refuses a duplicate email', async () => {
  await createAda();
  const response = await createAda();

  assert.equal(response.statusCode, 409);
});

test('paginates', async () => {
  await createAda();
  await app.inject({
    method: 'POST',
    url: '/api/users',
    payload: { ...ADA, email: 'grace@example.com', name: 'Grace Hopper' },
  });

  const response = await app.inject({ method: 'GET', url: '/api/users?page=1&limit=1' });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.total, 2);
  assert.equal(body.pages, 2);
});

test('requires authentication to modify', async () => {
  const { id } = (await createAda()).json();

  const anonymous = await app.inject({
    method: 'PATCH',
    url: `/api/users/${id}`,
    payload: { name: 'Nobody' },
  });
  assert.equal(anonymous.statusCode, 401);

  const authorised = await app.inject({
    method: 'PATCH',
    url: `/api/users/${id}`,
    payload: { name: 'Ada King' },
    headers: authHeader(),
  });
  assert.equal(authorised.statusCode, 200);
  assert.equal(authorised.json().name, 'Ada King');
});
