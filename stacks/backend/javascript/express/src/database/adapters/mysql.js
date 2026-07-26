import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { toPublicUser, toPublicUsers, toPublicProduct, toPublicProducts } from '../serialize.js';
import { logger } from '../../utils/logger.js';
import { MODELS, user, product } from '../../models/index.js';
import { createTables, columnsOf } from '../schema.js';

/**
 * The tables are described in src/models/; this adapter only says how MySQL
 * spells them.
 *
 * VARCHAR needs a length and TEXT cannot be indexed without a prefix, so a
 * bounded string becomes VARCHAR(n) and an unbounded one becomes TEXT. That is
 * why every unique field in the models carries a maxLength — without one, the
 * UNIQUE constraint below would not build.
 */
const DIALECT = {
  types: {
    id: () => 'CHAR(36) PRIMARY KEY',
    string: (spec) => (spec.maxLength ? `VARCHAR(${spec.maxLength})` : 'TEXT'),
    enum: (spec) => `VARCHAR(${spec.maxLength ?? 32})`,
    integer: () => 'INT',
  },
  /*
   * updated_at maintains itself. created_at must not, or an edit would rewrite
   * when the row was created.
   */
  timestamp: (field) =>
    field === 'updatedAt'
      ? 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      : 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
  tableSuffix: ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
  /*
   * An unbounded string is TEXT here, and MySQL refuses a DEFAULT on TEXT.
   * The column stays NOT NULL; the adapter supplies the value on insert.
   */
  supportsDefault: (spec) => !(spec.type === 'string' && !spec.maxLength),
};

const SCHEMA = createTables(MODELS, DIALECT);

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
    createdAt: r.created_at?.toISOString(),
    updatedAt: r.updated_at?.toISOString(),
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

  /*
   * Same trap as the postgres adapter: a pooled connection dropped by the server
   * surfaces as an `error` event, and an unhandled one kills the process — right
   * when readiness should instead be reporting a degraded database.
   */
  pool.on('error', (error) => {
    logger.error(`mysql pool error: ${error.message}`);
  });

  /*
   * One statement per call. MySQL rejects multiple statements in a single query
   * unless the connection opts into `multipleStatements`, and opting in widens the
   * SQL-injection surface for every query the pool ever runs — a steep price for a
   * convenience needed exactly once at startup. Postgres and SQLite accept the
   * whole script, which is why this only bites here.
   *
   * createTables hands them over already separate, so unlike the previous version
   * there is no script to split on ';' — and no chance of splitting on one that
   * lives inside a string literal.
   */
  for (const statement of SCHEMA) {
    await pool.query(statement);
  }

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

  const products = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name LIKE ? OR sku LIKE ?' : '';
      const params = q ? [`%${q}%`, `%${q}%`] : [];

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM products ${where}`,
        params,
      );
      const [rows] = await pool.query(
        `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );

      return { items: toPublicProducts(rows.map(productRow)), total: countRows[0].total };
    },

    async findById(id) {
      const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
      return toPublicProduct(productRow(rows[0]));
    },

    async findBySku(sku) {
      const [rows] = await pool.query('SELECT * FROM products WHERE sku = ?', [
        String(sku).toUpperCase(),
      ]);
      return toPublicProduct(productRow(rows[0]));
    },

    async create({ sku, name, description = '', priceCents, stock = 0 }) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO products (id, sku, name, description, price_cents, stock)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, String(sku).toUpperCase(), name, description, priceCents, stock],
      );
      return products.findById(id);
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in PRODUCT_COLUMNS);
      if (entries.length === 0) return products.findById(id);

      const sets = entries.map(([key]) => `${PRODUCT_COLUMNS[key]} = ?`);
      const values = entries.map(([key, value]) =>
        key === 'sku' ? String(value).toUpperCase() : value,
      );

      const [result] = await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, [
        ...values,
        id,
      ]);

      if (result.affectedRows === 0) return null;
      return products.findById(id);
    },

    async remove(id) {
      const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },
  };

  return { users, products, close: () => pool.end() };
}
