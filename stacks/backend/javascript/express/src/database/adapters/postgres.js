import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { toPublicUser, toPublicUsers, toPublicProduct, toPublicProducts } from '../serialize.js';
import { logger } from '../../utils/logger.js';
/**
 * The schema is created on boot so a fresh clone runs with no migration step.
 * The moment a table needs to *change*, that is the signal to adopt a real
 * migration tool — edit-in-place on a live table is how schemas drift.
 *
 * The tables themselves are described in src/models/, one file per record, and
 * this adapter only applies what they declare. It deliberately does not carry a
 * second copy: the seam knows how to talk to Postgres, the model knows what the
 * row looks like, and nothing knows both.
 */
import { MODELS } from '../../models/index.js';

/** How this driver spells each of the model's declared types. */
const COLUMN_TYPE = {
  id: 'TEXT PRIMARY KEY',
  string: 'TEXT',
  enum: 'TEXT',
  integer: 'INTEGER',
  timestamp: 'TIMESTAMPTZ',
};

/** One model's CREATE TABLE, derived from what the model declares. */
function createTable(model) {
  const columns = Object.entries(model.FIELDS).map(([field, spec]) => {
    const name = spec.column ?? field;
    const parts = [name.padEnd(13), COLUMN_TYPE[spec.type]];

    if (spec.type !== 'id') {
      // A column with a default is never null: the default is what makes that
      // true. Emitting one without NOT NULL would let an explicit NULL through
      // the gap and put a row in the table the model says cannot exist.
      const defaulted = spec.default !== undefined || spec.type === 'timestamp';
      if (spec.required || defaulted) parts.push('NOT NULL');
      if (spec.unique) parts.push('UNIQUE');

      if (spec.type === 'timestamp') parts.push('DEFAULT now()');
      else if (spec.default !== undefined) {
        // Quote text, never numbers. Postgres would coerce '0' into an integer
        // column and hide the mistake here, but SQLite stores it as the string
        // it looks like — so one adapter's tolerance becomes another's bug.
        const literal = spec.type === 'integer' ? spec.default : `'${spec.default}'`;
        parts.push(`DEFAULT ${literal}`);
      }
    }

    return `    ${parts.join(' ')}`;
  });

  return `CREATE TABLE IF NOT EXISTS ${model.NAME} (\n${columns.join(',\n')}\n  );`;
}

const SCHEMA = MODELS.map(createTable).join('\n\n  ');

/**
 * An arbitrary but fixed key. Advisory locks are just numbers Postgres agrees to
 * queue on; nothing else in this application takes one, so any constant does — it
 * only has to be the *same* constant in every process.
 */
const SCHEMA_LOCK = 4_021_977;

/**
 * `CREATE TABLE IF NOT EXISTS` is not safe to run concurrently, which is not what
 * the name suggests. The existence check and the create are not one atomic step:
 * two connections can both find no table, both proceed, and the loser dies on the
 * unique index behind `pg_type` — the table's row type is inserted there, so the
 * collision surfaces as `pg_type_typname_nsp_index`, a message that says nothing
 * about tables at all.
 *
 * Mocha runs this suite's files sequentially in one process, so the race is not
 * reachable from here today. It is reachable the moment anything else boots the
 * app twice at once — a second worker, a seed script running beside the server —
 * and it is reachable from Fastify, which shares this seam and whose runner uses
 * a process per file. That is where it failed in CI. The adapter is what has to
 * be right, not the test runner that happens to hide it.
 *
 * An advisory lock makes the DDL serial across processes: the second one waits,
 * then finds the table and does nothing. The lock is *session*-scoped, so it has
 * to be taken and released on one pinned connection — taking it on a pool would
 * be free to unlock on a different connection than it locked, which releases
 * nothing and holds the original forever.
 */
async function ensureSchema(pool) {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK]);
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK]);
    client.release();
  }
}

const COLUMNS = {
  email: 'email',
  name: 'name',
  passwordHash: 'password_hash',
  role: 'role',
};

const PRODUCT_COLUMNS = {
  sku: 'sku',
  name: 'name',
  description: 'description',
  priceCents: 'price_cents',
  stock: 'stock',
};

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

/**
 * CREATE DATABASE cannot run from a connection to the database being created,
 * so this connects to the `postgres` maintenance database to do it. Called only
 * when config.database.autoCreate is set, which is test-only.
 */
async function ensureDatabase(url) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    // Identifiers cannot be bound as parameters; the name comes from our own
    // connection string, and doubling any quote closes the injection path.
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } catch (error) {
    // Postgres has no CREATE DATABASE IF NOT EXISTS, and the obvious stand-in —
    // SELECT from pg_database, then create if absent — is a check-then-act race:
    // two runners can both look, both see nothing, and both create. Trying and
    // forgiving is the only form of this that is actually atomic, since the
    // uniqueness is enforced by the index over pg_database.datname rather than by
    // our check. The loser is reported as 42P04, or as a raw 23505 on that index
    // when the two CREATEs collide inside the same instant.
    //
    // Mocha runs this suite's files sequentially in one process, so the race is
    // not reachable from here today — but the seam is shared with Fastify, whose
    // node:test runner uses a process per file, and there it failed in CI. The
    // adapter, not the test runner, is what has to be right.
    if (error.code !== '42P04' && error.code !== '23505') throw error;
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
   * next query, and until it can, /api/health/readiness answers 503.
   */
  pool.on('error', (error) => {
    logger.error(`postgres pool error: ${error.message}`);
  });

  await ensureSchema(pool);

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

  const products = {
    async list({ page, limit, q }) {
      const where = q ? 'WHERE name ILIKE $1 OR sku ILIKE $1' : '';
      const params = q ? [`%${q}%`] : [];

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM products ${where}`,
        params,
      );

      const { rows } = await pool.query(
        `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit],
      );

      return { items: toPublicProducts(rows.map(productRow)), total: countRows[0].total };
    },

    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
      return toPublicProduct(productRow(rows[0]));
    },

    async findBySku(sku) {
      const { rows } = await pool.query('SELECT * FROM products WHERE sku = $1', [
        String(sku).toUpperCase(),
      ]);
      return toPublicProduct(productRow(rows[0]));
    },

    async create({ sku, name, description = '', priceCents, stock = 0 }) {
      const { rows } = await pool.query(
        `INSERT INTO products (id, sku, name, description, price_cents, stock)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), String(sku).toUpperCase(), name, description, priceCents, stock],
      );
      return toPublicProduct(productRow(rows[0]));
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([key]) => key in PRODUCT_COLUMNS);
      if (entries.length === 0) return products.findById(id);

      const sets = entries.map(([key], i) => `${PRODUCT_COLUMNS[key]} = $${i + 1}`);
      const values = entries.map(([key, value]) =>
        key === 'sku' ? String(value).toUpperCase() : value,
      );

      const { rows } = await pool.query(
        `UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length + 1} RETURNING *`,
        [...values, id],
      );

      return toPublicProduct(productRow(rows[0]));
    },

    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };

  return { users, products, close: () => pool.end() };
}
