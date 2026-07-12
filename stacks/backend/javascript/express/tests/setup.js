import { connectDatabase, disconnectDatabase, db } from '../src/db/index.js';

/**
 * Root hooks — mocha applies these once around the whole run.
 *
 * The wipe goes through the repository rather than through a driver
 * (`collection.deleteMany`, `TRUNCATE`, …), so this file stays correct for
 * whichever storage the project was scaffolded with.
 */
export const mochaHooks = {
  async beforeAll() {
    await connectDatabase();
  },

  async afterEach() {
    // Drain in pages, so ordering never matters and no test leaks state.
    for (;;) {
      const { items } = await db.users.list({ page: 1, limit: 100, q: '' });
      if (items.length === 0) break;
      await Promise.all(items.map((user) => db.users.remove(user.id)));
    }
  },

  async afterAll() {
    await disconnectDatabase();
  },
};
