import { randomUUID } from 'node:crypto';
import { toPublicUser, toPublicUsers, matchesQuery, paginate } from '../serialize.js';

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
      const found = [...rows.values()].find(
        (row) => row.email === String(email).toLowerCase(),
      );
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

  return { users, close: async () => rows.clear() };
}
