import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { authHeader, buildTestApp, clearProducts, teardown } from './helpers.js';

let app;

before(async () => {
  app = await buildTestApp();
});
after(() => teardown(app));
beforeEach(clearProducts);

const WIDGET = { sku: 'WIDGET-1', name: 'Widget', priceCents: 1999 };

function post(url, payload, headers = authHeader()) {
  return app.inject({ method: 'POST', url, payload, headers });
}

async function createWidget(overrides = {}) {
  const response = await post('/api/products', { ...WIDGET, ...overrides });
  assert.equal(response.statusCode, 201, `create failed: ${response.body}`);
  return response.json();
}

test('creates a product', async () => {
  const product = await createWidget({ name: 'Anvil', priceCents: 4500, stock: 3 });

  assert.equal(product.sku, 'WIDGET-1');
  assert.equal(product.priceCents, 4500);
  assert.equal(product.stock, 3);
  assert.ok(product.id);
});

test('defaults stock to zero', async () => {
  assert.equal((await createWidget()).stock, 0);
});

test('requires authentication to create', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/products', payload: WIDGET });
  assert.equal(response.statusCode, 401);
});

test('rejects a float price', async () => {
  // The whole reason money is stored as integer cents. ajv rejects it before a
  // handler runs; if this ever passes, prices have started drifting downstream.
  const response = await post('/api/products', { ...WIDGET, priceCents: 19.99 });
  assert.equal(response.statusCode, 400);
});

test('rejects a negative price', async () => {
  const response = await post('/api/products', { ...WIDGET, priceCents: -1 });
  assert.equal(response.statusCode, 400);
});

test('rejects a malformed sku', async () => {
  const response = await post('/api/products', { ...WIDGET, sku: 'no spaces allowed' });
  assert.equal(response.statusCode, 400);
});

test('refuses a duplicate sku', async () => {
  await createWidget();
  const response = await post('/api/products', WIDGET);
  assert.equal(response.statusCode, 409);
});

test('treats sku case-insensitively when refusing a duplicate', async () => {
  // The adapters uppercase on write, so `widget-1` and `WIDGET-1` are one
  // product. Postgres would refuse the second on a UNIQUE index regardless;
  // memory and file refuse it only because of that uppercasing, and nothing
  // else checks the difference.
  await createWidget();
  const response = await post('/api/products', { ...WIDGET, sku: 'widget-1' });
  assert.equal(response.statusCode, 409);
});

test('lists publicly and paginates', async () => {
  await createWidget();
  await createWidget({ sku: 'WIDGET-2' });

  const response = await app.inject({ method: 'GET', url: '/api/products?page=1&limit=1' });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.total, 2);
  assert.equal(body.pages, 2);
});

test('finds a product by sku fragment', async () => {
  await createWidget();
  await createWidget({ sku: 'OTHER-9', name: 'Other' });

  const response = await app.inject({ method: 'GET', url: '/api/products?q=OTHER' });
  const body = response.json();

  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].sku, 'OTHER-9');
});

test('404s an unknown id', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/products/00000000-0000-0000-0000-000000000000',
  });
  assert.equal(response.statusCode, 404);
});

test('updates a field', async () => {
  const { id, sku } = await createWidget({ name: 'Before' });

  const response = await app.inject({
    method: 'PATCH',
    url: `/api/products/${id}`,
    payload: { name: 'After' },
    headers: authHeader(),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().name, 'After');
  assert.equal(response.json().sku, sku);
});

test('requires authentication to update', async () => {
  const { id } = await createWidget();
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/products/${id}`,
    payload: { name: 'Nobody' },
  });
  assert.equal(response.statusCode, 401);
});

test('refuses a sku already taken by another product', async () => {
  const first = await createWidget();
  const second = await createWidget({ sku: 'WIDGET-2' });

  const response = await app.inject({
    method: 'PATCH',
    url: `/api/products/${second.id}`,
    payload: { sku: first.sku },
    headers: authHeader(),
  });
  assert.equal(response.statusCode, 409);
});

test('allows a product to keep its own sku', async () => {
  // The conflict check excludes the row being edited; without that exclusion any
  // PATCH carrying the unchanged sku would 409 against itself.
  const { id, sku } = await createWidget();

  const response = await app.inject({
    method: 'PATCH',
    url: `/api/products/${id}`,
    payload: { sku, name: 'Renamed' },
    headers: authHeader(),
  });
  assert.equal(response.statusCode, 200);
});

test('will not set stock directly', async () => {
  // Stock moves through /stock as a delta. additionalProperties:false is what
  // makes this a 400 rather than a silent drop — a caller who thinks they set
  // stock and did not is worse off than one who is told no.
  const { id } = await createWidget({ stock: 5 });

  const response = await app.inject({
    method: 'PATCH',
    url: `/api/products/${id}`,
    payload: { stock: 999 },
    headers: authHeader(),
  });
  assert.equal(response.statusCode, 400);
});

test('adds and removes stock', async () => {
  const { id } = await createWidget({ stock: 2 });

  const added = await post(`/api/products/${id}/stock`, { delta: 3 });
  assert.equal(added.json().stock, 5);

  const removed = await post(`/api/products/${id}/stock`, { delta: -2 });
  assert.equal(removed.json().stock, 3);
});

test('refuses to take stock below zero, and leaves it untouched', async () => {
  // A rejected movement that still wrote would be worse than no check at all.
  const { id } = await createWidget({ stock: 1 });

  const response = await post(`/api/products/${id}/stock`, { delta: -2 });
  assert.equal(response.statusCode, 409);

  const after = await app.inject({ method: 'GET', url: `/api/products/${id}` });
  assert.equal(after.json().stock, 1);
});

test('rejects a zero delta', async () => {
  const { id } = await createWidget();
  const response = await post(`/api/products/${id}/stock`, { delta: 0 });
  assert.equal(response.statusCode, 400);
});

test('requires authentication to move stock', async () => {
  const { id } = await createWidget();
  const response = await app.inject({
    method: 'POST',
    url: `/api/products/${id}/stock`,
    payload: { delta: 1 },
  });
  assert.equal(response.statusCode, 401);
});

test('deletes only for an admin', async () => {
  const { id } = await createWidget();

  const anonymous = await app.inject({ method: 'DELETE', url: `/api/products/${id}` });
  assert.equal(anonymous.statusCode, 401);

  const plainUser = await app.inject({
    method: 'DELETE',
    url: `/api/products/${id}`,
    headers: authHeader('user'),
  });
  assert.equal(plainUser.statusCode, 403);

  const admin = await app.inject({
    method: 'DELETE',
    url: `/api/products/${id}`,
    headers: authHeader('admin'),
  });
  assert.equal(admin.statusCode, 204);

  const gone = await app.inject({ method: 'GET', url: `/api/products/${id}` });
  assert.equal(gone.statusCode, 404);
});
