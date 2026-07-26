import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildVars, copyTemplate } from '../src/scaffold.js';
import { STORAGE, STORAGE_ORDER, depsFor } from '../src/storage.js';
import { mergeDeps, pruneAdapters, writeCompose, writeEnv } from '../src/setup.js';

const STACK_ROOT = path.resolve(import.meta.dirname, '..', 'stacks');
const EXPRESS = path.join(STACK_ROOT, 'backend/javascript/express');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-storage-'));
}

/** Scaffold express with a storage choice, exactly as bin/lattice.js does. */
function scaffold(storage, fileFormat = 'json') {
  const target = tempDir();
  const vars = buildVars({
    projectName: 'shop',
    port: '3000',
    storage,
    fileFormat,
    databasePort: STORAGE[storage].defaultPort,
  });

  copyTemplate(EXPRESS, target, vars);
  pruneAdapters(target, STORAGE[storage].adapter);
  mergeDeps(target, depsFor(storage, fileFormat));
  writeEnv(target, { base: { NODE_ENV: 'development' }, storage, vars: { ...vars, fileFormat } });
  writeCompose(target, { storage, vars });

  return { target, vars };
}

test('every storage has an adapter file in the express stack', () => {
  for (const id of STORAGE_ORDER) {
    const adapter = path.join(EXPRESS, 'src/database/adapters', `${STORAGE[id].adapter}.js`);
    assert.ok(fs.existsSync(adapter), `missing adapter for ${id}: ${STORAGE[id].adapter}.js`);
  }
});

test('scaffolding keeps exactly one adapter and drops the rest', () => {
  for (const id of STORAGE_ORDER) {
    const { target } = scaffold(id);
    const kept = fs.readdirSync(path.join(target, 'src/database/adapters'));

    assert.deepEqual(kept, [`${STORAGE[id].adapter}.js`], `${id} should keep only its own adapter`);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('no driver is imported outside src/database/adapters', () => {
  /*
   * The invariant the whole design rests on: the service layer cannot reach a
   * driver, so swapping the database cannot break it.
   */
  const DRIVERS = /from '(mongoose|pg|mysql2\/promise|better-sqlite3|yaml)'/;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'adapters') continue;
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8');
        assert.doesNotMatch(content, DRIVERS, `${full} imports a driver outside the seam`);
      }
    }
  };

  walk(path.join(EXPRESS, 'src'));
});

test('only the chosen storage’s dependencies are installed', () => {
  const cases = [
    ['mongodb', 'mongoose'],
    ['postgres', 'pg'],
    ['mysql', 'mysql2'],
    ['sqlite', 'better-sqlite3'],
  ];

  for (const [id, driver] of cases) {
    const { target } = scaffold(id);
    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));

    assert.ok(pkg.dependencies[driver], `${id} should depend on ${driver}`);
    for (const [, other] of cases) {
      if (other === driver) continue;
      assert.ok(!pkg.dependencies[other], `${id} must not pull in ${other}`);
    }

    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('the file adapter only pulls in yaml when the format is yaml', () => {
  assert.deepEqual(depsFor('file', 'json'), {});
  assert.deepEqual(depsFor('file', 'ndjson'), {});
  assert.ok(depsFor('file', 'yaml').yaml, 'yaml format needs the yaml package');
  assert.deepEqual(depsFor('memory'), {});
});

test('.env gets a generated secret, .env.example keeps a placeholder', () => {
  const { target } = scaffold('postgres');

  const env = fs.readFileSync(path.join(target, '.env'), 'utf8');
  const example = fs.readFileSync(path.join(target, '.env.example'), 'utf8');

  const secret = env.match(/^JWT_SECRET=(.+)$/m)[1];
  assert.ok(secret.length >= 40, 'the real secret should be long and random');
  assert.match(example, /^JWT_SECRET=a-long-random-string$/m);

  // Both must carry the connection string, or the app cannot boot.
  assert.match(env, /^DATABASE_URL=postgres:\/\//m);

  fs.rmSync(target, { recursive: true, force: true });
});

test('storages with no server get no compose file', () => {
  for (const id of ['sqlite', 'file', 'memory']) {
    const { target } = scaffold(id);
    assert.ok(
      !fs.existsSync(path.join(target, 'docker-compose.yml')),
      `${id} needs no database container, so it should ship no compose file`,
    );
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('compose publishes the port that .env actually points at', () => {
  for (const id of ['mongodb', 'postgres', 'mysql']) {
    const target = tempDir();
    // Simulate the conventional port being taken: the CLI picks the next one.
    const databasePort = STORAGE[id].defaultPort + 1;
    const vars = buildVars({ projectName: 'shop', port: '3000', storage: id, databasePort });

    copyTemplate(EXPRESS, target, vars);
    writeEnv(target, { base: {}, storage: id, vars });
    writeCompose(target, { storage: id, vars });

    const env = fs.readFileSync(path.join(target, '.env'), 'utf8');
    const compose = fs.readFileSync(path.join(target, 'docker-compose.yml'), 'utf8');

    assert.match(env, new RegExp(`DATABASE_URL=.*:${databasePort}/`), `${id} .env should use ${databasePort}`);
    assert.match(compose, new RegExp(`'${databasePort}:`), `${id} compose should publish ${databasePort}`);

    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('config demands a connection string only when the storage has one', () => {
  const needs = scaffold('postgres');
  const doesNot = scaffold('file');

  const withUrl = fs.readFileSync(path.join(needs.target, 'src/config/index.js'), 'utf8');
  const withoutUrl = fs.readFileSync(path.join(doesNot.target, 'src/config/index.js'), 'utf8');

  assert.match(withUrl, /const DATABASE_NEEDS_URL = true;/);
  assert.match(withoutUrl, /const DATABASE_NEEDS_URL = false;/);

  fs.rmSync(needs.target, { recursive: true, force: true });
  fs.rmSync(doesNot.target, { recursive: true, force: true });
});
