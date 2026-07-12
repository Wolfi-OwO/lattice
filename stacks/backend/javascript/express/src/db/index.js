/**
 * The storage seam.
 *
 * Everything above this file — routes, controllers, services — talks to `db`
 * and never imports a driver. Swapping {{dbLabel}} for another store means
 * changing the adapter import below and nothing else.
 *
 * An adapter implements:
 *
 *   users.list({ page, limit, q })          -> { items, total }
 *   users.findById(id)                      -> user | null
 *   users.findByEmail(email, { withPasswordHash })
 *   users.create({ email, name, passwordHash, role })
 *   users.update(id, patch)                 -> user | null
 *   users.remove(id)                        -> boolean
 *   close()
 *
 * Users returned from an adapter are always public-shaped: `passwordHash` is
 * present only when `findByEmail` is asked for it explicitly, which is the one
 * place authentication needs it.
 */

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createAdapter } from './adapters/{{dbAdapter}}.js';

/** Populated by connectDatabase(). Imported by services as `db.users`. */
export const db = {
  users: null,
  close: async () => {},
};

export async function connectDatabase() {
  const adapter = await createAdapter(config.db);

  db.users = adapter.users;
  db.close = adapter.close ?? (async () => {});

  logger.info(`Storage ready — {{dbLabel}}`);
  return db;
}

export async function disconnectDatabase() {
  await db.close();
  db.users = null;
  logger.info('Storage closed');
}

/**
 * Readiness probe. Rather than asking a driver for a connection flag — which
 * every driver spells differently, and which can report "connected" on a socket
 * that no longer works — this issues the cheapest real query the repository
 * offers. If it comes back, the storage can genuinely serve traffic.
 */
export async function ping() {
  if (!db.users) return false;
  try {
    await db.users.list({ page: 1, limit: 1, q: '' });
    return true;
  } catch {
    return false;
  }
}
