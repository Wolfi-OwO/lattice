import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';

const app = createApp();

/**
 * The template ships JWT verification but no endpoint that issues one — how a
 * token is obtained is an application decision, not a scaffold decision. So the
 * tests sign their own against the same secret the app verifies with, which is
 * also the honest thing to assert: these routes trust a valid bearer token and
 * nothing more.
 */
const tokenFor = (role) => jwt.sign({ sub: `test-${role}`, role }, config.jwt.secret);

const auth = (req, role = 'user') => req.set('Authorization', `Bearer ${tokenFor(role)}`);

/** A unique SKU per call, so one test's catalogue never collides with another's. */
let counter = 0;
const nextSku = () => `TEST-${(counter += 1)}`;

async function createProduct(overrides = {}) {
  const res = await auth(request(app).post('/api/products'))
    .send({ sku: nextSku(), name: 'Widget', priceCents: 1999, ...overrides })
    .expect(201);
  return res.body;
}

describe('POST /api/products', () => {
  it('creates a product', async () => {
    const sku = nextSku();
    const product = await createProduct({ sku, name: 'Anvil', priceCents: 4500, stock: 3 });

    assert.equal(product.sku, sku.toUpperCase());
    assert.equal(product.priceCents, 4500);
    assert.equal(product.stock, 3);
    assert.ok(product.id);
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/api/products')
      .send({ sku: nextSku(), name: 'Widget', priceCents: 100 })
      .expect(401);
  });

  it('defaults stock to zero', async () => {
    const product = await createProduct();
    assert.equal(product.stock, 0);
  });

  it('rejects a float price', async () => {
    /*
     * The whole reason money is stored as integer cents. If this ever passes,
     * prices have started drifting somewhere downstream.
     */
    await auth(request(app).post('/api/products'))
      .send({ sku: nextSku(), name: 'Widget', priceCents: 19.99 })
      .expect(400);
  });

  it('rejects a negative price', async () => {
    await auth(request(app).post('/api/products'))
      .send({ sku: nextSku(), name: 'Widget', priceCents: -1 })
      .expect(400);
  });

  it('rejects a malformed sku', async () => {
    await auth(request(app).post('/api/products'))
      .send({ sku: 'no spaces allowed', name: 'Widget', priceCents: 100 })
      .expect(400);
  });

  it('refuses a duplicate sku', async () => {
    const sku = nextSku();
    await createProduct({ sku });
    await auth(request(app).post('/api/products'))
      .send({ sku, name: 'Other', priceCents: 100 })
      .expect(409);
  });

  it('treats sku case-insensitively when refusing a duplicate', async () => {
    /*
     * The adapters uppercase on write, so `abc-1` and `ABC-1` are one product.
     * Without this the memory and file adapters would happily store both.
     */
    const sku = nextSku();
    await createProduct({ sku });
    await auth(request(app).post('/api/products'))
      .send({ sku: sku.toLowerCase(), name: 'Other', priceCents: 100 })
      .expect(409);
  });
});

describe('GET /api/products', () => {
  it('is public', async () => {
    await request(app).get('/api/products').expect(200);
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/products?page=1&limit=5').expect(200);
    assert.deepEqual(Object.keys(res.body).sort(), ['items', 'limit', 'page', 'pages', 'total']);
    assert.ok(res.body.items.length <= 5);
  });

  it('finds a product by sku fragment', async () => {
    const sku = nextSku();
    await createProduct({ sku, name: 'Findable' });

    const res = await request(app).get(`/api/products?q=${sku}`).expect(200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].sku, sku.toUpperCase());
  });

  it('404s an unknown id', async () => {
    await request(app).get('/api/products/00000000-0000-0000-0000-000000000000').expect(404);
  });
});

describe('PATCH /api/products/:id', () => {
  it('updates a field', async () => {
    const product = await createProduct({ name: 'Before' });

    const res = await auth(request(app).patch(`/api/products/${product.id}`))
      .send({ name: 'After' })
      .expect(200);

    assert.equal(res.body.name, 'After');
    assert.equal(res.body.sku, product.sku);
  });

  it('requires authentication', async () => {
    const product = await createProduct();
    await request(app).patch(`/api/products/${product.id}`).send({ name: 'X' }).expect(401);
  });

  it('refuses a sku already taken by another product', async () => {
    const first = await createProduct();
    const second = await createProduct();

    await auth(request(app).patch(`/api/products/${second.id}`))
      .send({ sku: first.sku })
      .expect(409);
  });

  it('allows a product to keep its own sku', async () => {
    /*
     * The conflict check excludes the row being edited; without that exclusion
     * any PATCH carrying the unchanged sku would 409 against itself.
     */
    const product = await createProduct();
    await auth(request(app).patch(`/api/products/${product.id}`))
      .send({ sku: product.sku, name: 'Renamed' })
      .expect(200);
  });

  it('will not set stock directly', async () => {
    /*
     * Stock moves through /stock as a delta. If PATCH ever accepts it, a
     * concurrent sale can be overwritten by a stale absolute value.
     */
    const product = await createProduct({ stock: 5 });
    await auth(request(app).patch(`/api/products/${product.id}`))
      .send({ stock: 999 })
      .expect(400);
  });
});

describe('POST /api/products/:id/stock', () => {
  it('adds stock', async () => {
    const product = await createProduct({ stock: 2 });

    const res = await auth(request(app).post(`/api/products/${product.id}/stock`))
      .send({ delta: 3 })
      .expect(200);

    assert.equal(res.body.stock, 5);
  });

  it('removes stock', async () => {
    const product = await createProduct({ stock: 5 });

    const res = await auth(request(app).post(`/api/products/${product.id}/stock`))
      .send({ delta: -2 })
      .expect(200);

    assert.equal(res.body.stock, 3);
  });

  it('refuses to take stock below zero', async () => {
    const product = await createProduct({ stock: 1 });
    await auth(request(app).post(`/api/products/${product.id}/stock`))
      .send({ delta: -2 })
      .expect(409);
  });

  it('leaves stock untouched when it refuses', async () => {
    // A rejected movement that still wrote would be worse than no check at all.
    const product = await createProduct({ stock: 1 });
    await auth(request(app).post(`/api/products/${product.id}/stock`))
      .send({ delta: -2 })
      .expect(409);

    const res = await request(app).get(`/api/products/${product.id}`).expect(200);
    assert.equal(res.body.stock, 1);
  });

  it('rejects a zero delta', async () => {
    const product = await createProduct();
    await auth(request(app).post(`/api/products/${product.id}/stock`))
      .send({ delta: 0 })
      .expect(400);
  });

  it('requires authentication', async () => {
    const product = await createProduct();
    await request(app).post(`/api/products/${product.id}/stock`).send({ delta: 1 }).expect(401);
  });
});

describe('DELETE /api/products/:id', () => {
  it('requires authentication', async () => {
    const product = await createProduct();
    await request(app).delete(`/api/products/${product.id}`).expect(401);
  });

  it('refuses a non-admin', async () => {
    const product = await createProduct();
    await auth(request(app).delete(`/api/products/${product.id}`), 'user').expect(403);
  });

  it('lets an admin delete', async () => {
    const product = await createProduct();
    await auth(request(app).delete(`/api/products/${product.id}`), 'admin').expect(204);
    await request(app).get(`/api/products/${product.id}`).expect(404);
  });
});
