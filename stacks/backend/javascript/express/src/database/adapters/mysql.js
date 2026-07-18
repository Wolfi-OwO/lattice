import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { toPublicUser, toPublicUsers } from '../serialize.js';
import { logger } from '../../utils/logger.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36)     PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(32)  NOT NULL DEFAULT 'user',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
    createdAt: r.created_at?.toISOString(),
    updatedAt: r.updated_at?.toISOString(),
  };
}

/** Connects without a database selected, so it can create one. Test-only. */
async function ensureDatabase(url) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = '/';

  const conn = await mysql.createConnection(admin.toString());
  try {
    // Backtick-quoted identifier; a backtick in the name is escaped by doubling.
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name.replace(/`/g, '``')}\``);
  } finally {
    await conn.end();
  }
}

export async function createAdapter({ url, autoCreate = false }) {
  if (autoCreate) await ensureDatabase(url);

  const pool = mysql.createPool(url);

  // Same trap as the postgres adapter: a pooled connection dropped by the server
  // surfaces as an `error` event, and an unhandled one kills the process — right
  // when readiness should instead be reporting a degraded database.
  pool.on('error', (error) => {
    logger.error(`mysql pool error: ${error.message}`);
  });

  await pool.query(SCHEMA);

  const users = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name LIKE ? OR email LIKE ?' : '';
      const params = q ? [`%${q}%`, `%${q}%`] : [];

      const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
      const [rows] = await pool.query(
        `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );

      return { items: toPublicUsers(rows.map(row)), total: Number(countRows[0].total) };
    },

    async findById(id) {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      return toPublicUser(row(rows[0]));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [
        String(email).toLowerCase(),
      ]);
      if (!rows[0]) return null;

      const full = row(rows[0]);
      return withPasswordHash ? full : toPublicUser(full);
    },

    async create({ email, name, passwordHash, role = 'user' }) {
      const id = randomUUID();
      await pool.query(
        'INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [id, String(email).toLowerCase(), name, passwordHash, role],
      );
      return users.findById(id);
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in COLUMNS);
      if (entries.length === 0) return users.findById(id);

      const sets = entries.map(([key]) => `${COLUMNS[key]} = ?`);
      const [result] = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [
        ...entries.map(([, value]) => value),
        id,
      ]);
      if (result.affectedRows === 0) return null;
      return users.findById(id);
    },

    async remove(id) {
      const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },
  };

  return { users, close: () => pool.end() };
}
