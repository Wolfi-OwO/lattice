import { MODELS, user, product } from '../../models/index.js';
import { createTables, columnsOf } from '../schema.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { toPublicUser, toPublicUsers, toPublicProduct, toPublicProducts } from '../serialize.js';

/**
 * The tables are described in src/models/; this adapter only says how SQLite
 * spells them.
 *
 * Timestamps are TEXT with no default: SQLite has no timestamp type, and the
 * adapter writes ISO-8601 strings so they sort lexically the way they sort
 * chronologically.
 */
const DIALECT = {
  types: {
    id: () => 'TEXT PRIMARY KEY',
    string: () => 'TEXT',
    enum: () => 'TEXT',
    integer: () => 'INTEGER',
  },
  timestamp: () => 'TEXT NOT NULL',
  caseInsensitiveUnique: true,
};

const SCHEMA = createTables(MODELS, DIALECT).join('\n\n  ');

const COLUMNS = columnsOf(user);

const PRODUCT_COLUMNS = columnsOf(product);

function productRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    stock: r.stock,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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
/** better-sqlite3 is synchronous, so the wait has to be too. */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * WAL lets readers and a writer work at the same time instead of locking each other
 * out. Turning it on is one pragma, and it is the one pragma that cannot simply be
 * called.
 *
 * `PRAGMA journal_mode = WAL` needs an exclusive lock on the file, and SQLite does
 * NOT run the busy handler for it: it returns SQLITE_BUSY at once, no matter what
 * `busy_timeout` says. So the timeout above — which correctly covers every other
 * statement — does nothing for this one, and two processes opening a fresh database
 * at the same instant means the loser throws before it has done anything.
 *
 * Mocha runs this suite in one process, so it is not reachable from the tests. It is
 * reachable the moment a scaffolded project runs `database:seed` beside a live
 * server, and it is how the Fastify template — same seam, process-per-test-file
 * runner — failed in CI.
 *
 * The saving grace is that `journal_mode` is persisted *in the database file*, not
 * per connection. It therefore only has to be set once, by whoever gets there first:
 * read it, and if someone already won, there is nothing to do and no lock to take.
 * Retry only for the genuinely-contended fresh-file case.
 */
function enableWriteAheadLogging(sqlite, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (sqlite.pragma('journal_mode', { simple: true }) === 'wal') return;

    try {
      sqlite.pragma('journal_mode = WAL');
      return;
    } catch (error) {
      if (error.code !== 'SQLITE_BUSY') throw error;
      /*
       * Someone else holds the exclusive lock — almost certainly to set WAL, which
       * means the next read of journal_mode will find it already done.
       */
      sleepSync(25);
    }
  }

  throw new Error('Could not enable WAL on the SQLite database: it stayed locked.');
}

export async function createAdapter({ url }) {
  // Accepts either `file:./data/app.db` or a bare path.
  const file = url.replace(/^file:/, '');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const sqlite = new Database(file);

  /*
   * FIRST, before any statement that writes. Without it SQLite does not wait for a
   * held lock — it fails immediately with SQLITE_BUSY — and one other process
   * touching the same file is enough. It covers the schema creation below, and
   * every write the app makes afterwards.
   */
  sqlite.pragma('busy_timeout = 5000');

  enableWriteAheadLogging(sqlite);

  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA);

  const users = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name LIKE @q OR email LIKE @q' : '';
      const params = q ? { q: `%${q}%` } : {};

      const { total } = sqlite.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(params);

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

  const products = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name LIKE @q OR sku LIKE @q' : '';
      const params = q ? { q: `%${q}%` } : {};

      const { total } = sqlite
        .prepare(`SELECT COUNT(*) AS total FROM products ${where}`)
        .get(params);

      const rows = sqlite
        .prepare(
          `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit, offset: (page - 1) * limit });

      return { items: toPublicProducts(rows.map(productRow)), total };
    },

    async findById(id) {
      return toPublicProduct(
        productRow(sqlite.prepare('SELECT * FROM products WHERE id = ?').get(id)),
      );
    },

    async findBySku(sku) {
      const found = sqlite
        .prepare('SELECT * FROM products WHERE sku = ?')
        .get(String(sku).toUpperCase());
      return toPublicProduct(productRow(found));
    },

    async create({ sku, name, description = '', priceCents, stock = 0 }) {
      const now = new Date().toISOString();
      const id = randomUUID();

      sqlite
        .prepare(
          `INSERT INTO products (id, sku, name, description, price_cents, stock, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, String(sku).toUpperCase(), name, description, priceCents, stock, now, now);

      return products.findById(id);
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in PRODUCT_COLUMNS);
      if (entries.length === 0) return products.findById(id);

      const sets = entries.map(([key]) => `${PRODUCT_COLUMNS[key]} = ?`);
      const values = entries.map(([key, value]) =>
        key === 'sku' ? String(value).toUpperCase() : value,
      );

      const result = sqlite
        .prepare(`UPDATE products SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), id);

      if (result.changes === 0) return null;
      return products.findById(id);
    },

    async remove(id) {
      return sqlite.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
    },
  };

  return { users, products, close: async () => sqlite.close() };
}
