#!/usr/bin/env node
/**
 * Loads database/data/<domain>.json into whatever storage this project was
 * scaffolded with.
 *
 *   npm run database:seed              add what is missing
 *   npm run database:seed -- --reset   delete everything first
 *
 * It goes through `database.users` — the same repository the services use — and not
 * through a driver. That is what makes one seeder work unchanged against
 * {{databaseLabel}} and against every other storage the template supports: the seeder
 * does not know which one is underneath, and does not need to.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';

import { database, connectDatabase, disconnectDatabase } from '../src/database/index.js';
import { logger } from '../src/utils/logger.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

/**
 * How a row in data/<domain>.json becomes a row in the database.
 *
 * One entry per domain. A data file with no entry here is a mistake worth
 * hearing about, so it is reported rather than skipped quietly.
 */
const DOMAINS = {
  users: seedUsers,
  products: seedProducts,
};

/**
 * Matched on email, which is the natural key the API already enforces as
 * unique. Re-running therefore updates the name and role of a demo user rather
 * than failing on a duplicate — seeding is not a once-per-database event.
 */
async function seedProducts(rows, { reset }) {
  if (reset) {
    const { items } = await database.products.list({ page: 1, limit: 1000, q: '' });
    for (const product of items) await database.products.remove(product.id);
  }

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    /*
     * Matched on SKU, the natural key the API already enforces as unique — so a
     * second run adjusts price and stock rather than failing on a duplicate.
     */
    const existing = await database.products.findBySku(row.sku);

    if (existing) {
      await database.products.update(existing.id, row);
      updated += 1;
    } else {
      await database.products.create(row);
      created += 1;
    }
  }

  return { created, updated };
}

async function seedUsers(rows, { reset }) {
  if (reset) {
    const { items } = await database.users.list({ page: 1, limit: 1000, q: '' });
    for (const user of items) await database.users.remove(user.id);
  }

  let created = 0;
  let updated = 0;

  for (const { email, name, password, role = 'user' } of rows) {
    const existing = await database.users.findByEmail(email);

    if (existing) {
      await database.users.update(existing.id, { name, role });
      updated++;
      continue;
    }

    /*
     * Hashed here, the same way the API hashes it, so a demo account can
     * actually log in. The plaintext in the JSON never reaches the database.
     */
    await database.users.create({
      email,
      name,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    });
    created++;
  }

  return { created, updated };
}

function readDomain(file) {
  const rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  if (!Array.isArray(rows)) {
    throw new Error(`database/data/${file} must contain a JSON array.`);
  }
  return rows;
}

async function main() {
  const reset = process.argv.includes('--reset');

  await connectDatabase();

  if (reset) logger.warn('--reset: existing rows will be deleted');

  const files = fs.existsSync(DATA_DIR)
    ? fs
        .readdirSync(DATA_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];

  for (const file of files) {
    const domain = path.basename(file, '.json');
    const seed = DOMAINS[domain];

    if (!seed) {
      logger.warn(`No seeder registered for "${domain}" — add it to DOMAINS in fill-demo-data.js`);
      continue;
    }

    const { created, updated } = await seed(readDomain(file), { reset });
    logger.info(`${domain}: ${created} created, ${updated} already there`);
  }

  await disconnectDatabase();
}

main().catch(async (error) => {
  logger.error(`Seeding failed: ${error.message}`);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
