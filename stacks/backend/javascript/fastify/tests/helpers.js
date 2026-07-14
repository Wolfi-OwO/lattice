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
  await app.close();
  await disconnectDatabase();
}

/** Every test starts from an empty table, whichever storage is underneath. */
export async function clearUsers() {
  const { items } = await database.users.list({ page: 1, limit: 500, q: '' });
  for (const user of items) await database.users.remove(user.id);
}

export function authHeader() {
  return { authorization: `Bearer ${signToken({ id: 'test', email: 't@e.st', role: 'admin' })}` };
}
