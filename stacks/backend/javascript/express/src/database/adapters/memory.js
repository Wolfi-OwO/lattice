import { randomUUID } from 'node:crypto';
import {
  toPublicUser,
  toPublicUsers,
  toPublicProduct,
  toPublicProducts,
  matchesQuery,
  paginate,
} from '../serialize.js';

/**
 * A Map. Nothing is persisted — restart the process and it is empty.
 *
 * This is the adapter the test suite runs against, which is the point: the same
 * routes, services and tests that pass here pass against Mongo or Postgres,
 * because none of them know which adapter is underneath.
 */
export async function createAdapter() {
  /** @type {Map<string, object>} */
  const rows = new Map();
  /** @type {Map<string, object>} */
  const productRows = new Map();

  const users = {
    async list({ page, limit, q }) {
      const matched = [...rows.values()].filter((row) => matchesQuery(row, q));
      const { items, total } = paginate(matched, { page, limit });
      return { items: toPublicUsers(items), total };
    },

    async findById(id) {
      return toPublicUser(rows.get(id));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const found = [...rows.values()].find((row) => row.email === String(email).toLowerCase());
      if (!found) return null;
      return withPasswordHash ? { ...found } : toPublicUser(found);
    },

    async create({ email, name, passwordHash, role = 'user' }) {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        email: String(email).toLowerCase(),
        name,
        passwordHash,
        role,
        createdAt: now,
        updatedAt: now,
      };

      rows.set(row.id, row);
      return toPublicUser(row);
    },

    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;

      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      if (patch.email) row.email = String(patch.email).toLowerCase();

      return toPublicUser(row);
    },

    async remove(id) {
      return rows.delete(id);
    },
  };

  const products = {
    async list({ page, limit, q }) {
      const matched = [...productRows.values()].filter((row) => matchesQuery(row, q, ['name', 'sku']));
      const { items, total } = paginate(matched, { page, limit });
      return { items: toPublicProducts(items), total };
    },

    async findById(id) {
      return toPublicProduct(productRows.get(id));
    },

    /** SKU is the product's natural key, the way email is the user's. */
    async findBySku(sku) {
      const found = [...productRows.values()].find((row) => row.sku === String(sku).toUpperCase());
      return toPublicProduct(found);
    },

    async create({ sku, name, description = '', priceCents, stock = 0 }) {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        sku: String(sku).toUpperCase(),
        name,
        description,
        priceCents,
        stock,
        createdAt: now,
        updatedAt: now,
      };

      productRows.set(row.id, row);
      return toPublicProduct(row);
    },

    async update(id, patch) {
      const row = productRows.get(id);
      if (!row) return null;

      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      if (patch.sku) row.sku = String(patch.sku).toUpperCase();

      return toPublicProduct(row);
    },

    async remove(id) {
      return productRows.delete(id);
    },
  };

  return {
    users,
    products,
    close: async () => {
      rows.clear();
      productRows.clear();
    },
  };
}
