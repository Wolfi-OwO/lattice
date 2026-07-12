import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { toPublicUser, toPublicUsers } from '../serialize.js';
import { logger } from '../../utils/logger.js';

/**
 * The schema is created on boot so a fresh clone runs with no migration step.
 * The moment this table needs to *change*, that is the signal to adopt a real
 * migration tool — edit-in-place on a live table is how schemas drift.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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
    createdAt: r.created_at?.toISOString(),
    updatedAt: r.updated_at?.toISOString(),
  };
}

/**
 * CREATE DATABASE cannot run from a connection to the database being created,
 * so this connects to the `postgres` maintenance database to do it. Called only
 * when config.db.autoCreate is set, which is test-only.
 */
async function ensureDatabase(url) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    // Identifiers cannot be bound as parameters; the name comes from our own
    // connection string, and doubling any quote closes the injection path.
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export async function createAdapter({ url, autoCreate = false }) {
  if (autoCreate) await ensureDatabase(url);

  const pool = new pg.Pool({ connectionString: url });

  /**
   * An idle pooled client can drop at any time — the database restarts, a
   * failover happens, an admin terminates the backend. `pg` surfaces that as an
   * `error` event on the pool, and an unhandled `error` event on an EventEmitter
   * takes the entire process down.
   *
   * So without this listener the server *crashes* the moment the database
   * blips — which is exactly the situation the readiness probe exists to report.
   * Swallow it and log: the pool discards the dead client and reconnects on the
   * next query, and until it can, /api/health/ready answers 503.
   */
  pool.on('error', (error) => {
    logger.error(`postgres pool error: ${error.message}`);
  });

  await pool.query(SCHEMA);

  const users = {
    async list({ page, limit, q }) {
      // ILIKE keeps the search in the database; the `%` wrapping is a bound
      // parameter, never string-concatenated into the SQL.
      const where = q ? 'WHERE name ILIKE $1 OR email ILIKE $1' : '';
      const params = q ? [`%${q}%`] : [];

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM users ${where}`,
        params,
      );

      const { rows } = await pool.query(
        `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit],
      );

      return { items: toPublicUsers(rows.map(row)), total: countRows[0].total };
    },

    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return toPublicUser(row(rows[0]));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [
        String(email).toLowerCase(),
      ]);
      if (!rows[0]) return null;

      const full = row(rows[0]);
      return withPasswordHash ? full : toPublicUser(full);
    },

    async create({ email, name, passwordHash, role = 'user' }) {
      const { rows } = await pool.query(
        `INSERT INTO users (id, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [randomUUID(), String(email).toLowerCase(), name, passwordHash, role],
      );
      return toPublicUser(row(rows[0]));
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in COLUMNS);
      if (entries.length === 0) return users.findById(id);

      // Column names come from the COLUMNS allowlist, never from the request.
      const sets = entries.map(([key], i) => `${COLUMNS[key]} = $${i + 2}`);
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, ...entries.map(([, value]) => value)],
      );
      return toPublicUser(row(rows[0]));
    },

    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };

  return { users, close: () => pool.end() };
}
