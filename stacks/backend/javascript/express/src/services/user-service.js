import bcrypt from 'bcryptjs';
import { database } from '../database/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Business logic lives here. Two boundaries are enforced:
 *
 *   - No Express types cross into this file (no `req`, no `res`), which is what
 *     makes these functions testable without booting a server.
 *   - No driver types either. This talks to `database.users`, so the same code runs
 *     unchanged against MongoDB, Postgres, MySQL, SQLite, files or memory.
 */

export async function listUsers({ page = 1, limit = 20, q = '' } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const { items, total } = await database.users.list({ page: safePage, limit: safeLimit, q });

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
}

export async function getUser(id) {
  const user = await database.users.findById(id);
  if (!user) throw ApiError.notFound(`User ${id} not found`);
  return user;
}

export async function createUser({ email, name, password, role }) {
  if (await database.users.findByEmail(email)) {
    throw ApiError.conflict(`A user with email ${email} already exists`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return database.users.create({ email, name, passwordHash, role });
}

export async function updateUser(id, patch) {
  /*
   * Check the uniqueness invariant before writing: not every adapter has a
   * unique index to fall back on (the file and memory ones do not).
   */
  if (patch.email) {
    const existing = await database.users.findByEmail(patch.email);
    if (existing && existing.id !== id) {
      throw ApiError.conflict(`A user with email ${patch.email} already exists`);
    }
  }

  const user = await database.users.update(id, patch);
  if (!user) throw ApiError.notFound(`User ${id} not found`);
  return user;
}

export async function deleteUser(id) {
  const deleted = await database.users.remove(id);
  if (!deleted) throw ApiError.notFound(`User ${id} not found`);
}

/**
 * The only caller that ever sees a password hash. It is stripped here rather
 * than in a controller, so the hash never travels further up than it must.
 */
export async function verifyCredentials(email, password) {
  const user = await database.users.findByEmail(email, { withPasswordHash: true });
  if (!user) return null;

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) return null;

  const { passwordHash, ...safe } = user;
  return safe;
}
