import { createApp } from '../src/app.js';
import { database, connectDatabase, disconnectDatabase } from '../src/database/index.js';
import { signToken } from '../src/plugins/auth.js';

/**
 * Boots the app in-process. `app.inject()` drives a real request through the
 * real router, hooks, schemas and error handler without opening a socket — so
 * the tests exercise the whole HTTP stack and still run in milliseconds.
 */
export async function buildTestApp() {
  await connectDatabase();
  const app = await createApp();
  await app.ready();
  return app;
}

export async function teardown(app) {
  // `before` can fail — a database that will not come up, a migration that throws —
  // and then `app` was never assigned. A teardown that dereferences it anyway
  // replaces the real failure with "Cannot read properties of undefined (reading
  // 'close')", which is the one message that tells you nothing about what broke.
  // The connection still has to be released either way, or the runner hangs.
  if (app) await app.close();
  await disconnectDatabase();
}

/** Every test starts from an empty table, whichever storage is underneath. */
export async function clearUsers() {
  const { items } = await database.users.list({ page: 1, limit: 500, q: '' });
  for (const user of items) await database.users.remove(user.id);
}

export async function clearProducts() {
  const { items } = await database.products.list({ page: 1, limit: 500, q: '' });
  for (const product of items) await database.products.remove(product.id);
}

/**
 * Defaults to admin so every existing call site keeps the access it had. Pass a
 * role to test what a lesser one cannot do — the products suite uses that to
 * prove a plain user is refused a delete rather than merely not offered one.
 */
export function authHeader(role = 'admin') {
  return { authorization: `Bearer ${signToken({ id: 'test', email: 't@e.st', role })}` };
}
