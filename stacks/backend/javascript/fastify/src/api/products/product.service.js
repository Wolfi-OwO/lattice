import { database } from '../../database/index.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Business logic for the products domain. The same two boundaries the users
 * service keeps: no Fastify types cross into this file, and no driver types
 * either — it talks to `database.products`, so this code runs unchanged against
 * every storage the template supports.
 */

export async function listProducts({ page = 1, limit = 20, q = '' } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const { items, total } = await database.products.list({ page: safePage, limit: safeLimit, q });

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
}

export async function getProduct(id) {
  const product = await database.products.findById(id);
  if (!product) throw ApiError.notFound(`Product ${id} not found`);
  return product;
}

export async function createProduct({ sku, name, description, priceCents, stock }) {
  if (await database.products.findBySku(sku)) {
    throw ApiError.conflict(`A product with SKU ${sku} already exists`);
  }

  return database.products.create({ sku, name, description, priceCents, stock });
}

export async function updateProduct(id, patch) {
  /*
   * Checked before writing, for the same reason as users: the file and memory
   * adapters have no unique index to fall back on.
   */
  if (patch.sku) {
    const existing = await database.products.findBySku(patch.sku);
    if (existing && existing.id !== id) {
      throw ApiError.conflict(`A product with SKU ${patch.sku} already exists`);
    }
  }

  const product = await database.products.update(id, patch);
  if (!product) throw ApiError.notFound(`Product ${id} not found`);
  return product;
}

export async function deleteProduct(id) {
  const deleted = await database.products.remove(id);
  if (!deleted) throw ApiError.notFound(`Product ${id} not found`);
}

/**
 * Stock movement, expressed as a delta rather than a new absolute value.
 *
 * "Set stock to 7" loses a concurrent sale; "subtract 1" does not. This is the
 * one product operation with a real invariant — stock must not go negative — and
 * it belongs here rather than in a controller, where a caller could skip it by
 * PATCHing `stock` directly. That is also why `stock` is not an updatable field
 * in the update schema.
 */
export async function adjustStock(id, delta) {
  const product = await database.products.findById(id);
  if (!product) throw ApiError.notFound(`Product ${id} not found`);

  const next = product.stock + delta;
  if (next < 0) {
    throw ApiError.conflict(
      `Cannot remove ${Math.abs(delta)} from stock — only ${product.stock} of ${product.sku} remain`,
    );
  }

  return database.products.update(id, { stock: next });
}
