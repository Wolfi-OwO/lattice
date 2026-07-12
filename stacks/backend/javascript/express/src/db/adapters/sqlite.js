import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { toPublicUser, toPublicUsers } from '../serialize.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
`;

const COLUMNS = {
  email: 'email',
  name: 'name',
  passwordHash: 'password_hash',
  role: 'role',
};

function row(r) {
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    passwordHash: r.password_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * better-sqlite3 is synchronous by design — SQLite calls are memory-speed, so
 * there is nothing to await. The methods stay `async` anyway so that this
 * adapter is drop-in interchangeable with the networked ones.
 */
export async function createAdapter({ url }) {
  // Accepts either `file:./data/app.db` or a bare path.
  const file = url.replace(/^file:/, '');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA);

  const users = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name LIKE @q OR email LIKE @q' : '';
      const params = q ? { q: `%${q}%` } : {};

      const { total } = sqlite
        .prepare(`SELECT COUNT(*) AS total FROM users ${where}`)
        .get(params);

      const rows = sqlite
        .prepare(
          `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit, offset: (page - 1) * limit });

      return { items: toPublicUsers(rows.map(row)), total };
    },

    async findById(id) {
      return toPublicUser(row(sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id)));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const found = sqlite.prepare('SELECT * FROM users WHERE email = ?').get(String(email));
      if (!found) return null;

      const full = row(found);
      return withPasswordHash ? full : toPublicUser(full);
    },

    async create({ email, name, passwordHash, role = 'user' }) {
      const now = new Date().toISOString();
      const id = randomUUID();

      sqlite
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, String(email).toLowerCase(), name, passwordHash, role, now, now);

      return users.findById(id);
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in COLUMNS);
      if (entries.length === 0) return users.findById(id);

      const sets = entries.map(([key]) => `${COLUMNS[key]} = ?`);
      const result = sqlite
        .prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, value]) => value), new Date().toISOString(), id);

      if (result.changes === 0) return null;
      return users.findById(id);
    },

    async remove(id) {
      return sqlite.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
    },
  };

  return { users, close: async () => sqlite.close() };
}
