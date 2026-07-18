import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { toPublicUser, toPublicUsers, matchesQuery, paginate } from '../serialize.js';

/**
 * Rows on disk, no database.
 *
 * Two things make this safe enough to actually use rather than just demo:
 *
 * 1. Writes are atomic — serialise to a temp file, then rename. A rename is
 *    atomic on POSIX, so a crash mid-write leaves the previous file intact
 *    instead of a half-written one. A plain overwrite can lose everything.
 *
 * 2. Writes are serialised — every mutation goes through one promise chain, so
 *    two concurrent requests cannot both read the same array, each append one
 *    row, and each write back a file missing the other's row.
 *
 * What it is not: concurrent across *processes*. One server, one data dir. Past
 * that, pick SQLite — it is the same "just a file" deal with real locking.
 */

const CODECS = {
  json: {
    ext: 'json',
    parse: (text) => (text.trim() ? JSON.parse(text) : []),
    stringify: (rows) => `${JSON.stringify(rows, null, 2)}\n`,
  },

  ndjson: {
    ext: 'ndjson',
    parse: (text) =>
      text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line)),
    stringify: (rows) =>
      rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
  },

  yaml: {
    ext: 'yaml',
    // Loaded lazily: `yaml` is only a dependency when this format is chosen.
    async load() {
      const { parse, stringify } = await import('yaml');
      return {
        parse: (text) => parse(text) ?? [],
        stringify: (rows) => stringify(rows),
      };
    },
  },
};

export async function createAdapter({ dir, format = 'json' }) {
  const codec = CODECS[format];
  if (!codec) {
    throw new Error(
      `Unknown DATA_FORMAT "${format}". Expected one of: ${Object.keys(CODECS).join(', ')}`,
    );
  }

  const { parse, stringify } = codec.load ? await codec.load() : codec;

  const dataDir = path.resolve(dir);
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, `users.${codec.ext}`);

  async function readAll() {
    try {
      return parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeAll(rows) {
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, stringify(rows), 'utf8');
    await fs.rename(temp, file);
  }

  // The write queue. Each mutation waits for the previous one to land, so a
  // read-modify-write can never interleave with another.
  let queue = Promise.resolve();

  function mutate(fn) {
    const next = queue.then(async () => {
      const rows = await readAll();
      const [result, changed] = await fn(rows);
      if (changed) await writeAll(rows);
      return result;
    });

    // Keep the chain alive even if this mutation rejects, or every subsequent
    // write would inherit the rejection.
    queue = next.catch(() => {});
    return next;
  }

  const users = {
    async list({ page, limit, q }) {
      const rows = (await readAll()).filter((row) => matchesQuery(row, q));
      const { items, total } = paginate(rows, { page, limit });
      return { items: toPublicUsers(items), total };
    },

    async findById(id) {
      const rows = await readAll();
      return toPublicUser(rows.find((row) => row.id === id));
    },

    async findByEmail(email, { withPasswordHash = false } = {}) {
      const rows = await readAll();
      const found = rows.find(
        (row) => String(row.email).toLowerCase() === String(email).toLowerCase(),
      );
      if (!found) return null;
      return withPasswordHash ? found : toPublicUser(found);
    },

    create({ email, name, passwordHash, role = 'user' }) {
      return mutate((rows) => {
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
        rows.push(row);
        return [toPublicUser(row), true];
      });
    },

    update(id, patch) {
      return mutate((rows) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return [null, false];

        Object.assign(row, patch, { updatedAt: new Date().toISOString() });
        if (patch.email) row.email = String(patch.email).toLowerCase();

        return [toPublicUser(row), true];
      });
    },

    remove(id) {
      return mutate((rows) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index === -1) return [false, false];

        rows.splice(index, 1);
        return [true, true];
      });
    },
  };

  return { users, close: async () => queue };
}
