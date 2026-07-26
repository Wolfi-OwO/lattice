/**
 * A project is only installed if its storage driver actually works.
 *
 * `npm install` exiting 0 is not the same as a working project, and for a native
 * addon the two came apart badly: better-sqlite3 compiles a binding during
 * install, and when lattice spawned npm the install script was silently skipped.
 * npm reported success, lattice reported success, and the scaffold died on its
 * first command with "Could not locate the bindings file".
 *
 * The subtle part, and the reason a naive check passed a broken project: for
 * better-sqlite3 `require()` succeeds regardless. The binding is only loaded when
 * a Database is constructed. So the check has to exercise the driver, not import
 * it — which is what the per-storage `smoke` expression is for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { driverLoads } from '../src/setup.js';
import { STORAGE } from '../src/storage.js';

const workspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'driver-'));

test('a storage with no dependencies needs no smoke check', () => {
  // memory and file have nothing to load, so there is nothing that can be broken.
  for (const id of ['memory', 'file']) {
    assert.equal(STORAGE[id].smoke, undefined, `${id}: has no driver, so no smoke expression`);
    assert.equal(driverLoads(workspace(), undefined), true, 'nothing to verify passes');
  }
});

test('every storage that installs a driver declares how to prove it works', () => {
  /*
   * Without this, adding a storage silently opts out of the check that exists
   * because a driver installed-but-unusable is what shipped broken.
   */
  for (const [id, spec] of Object.entries(STORAGE)) {
    const drivers = Object.keys(spec.deps ?? {});
    if (drivers.length === 0) continue;

    assert.ok(spec.smoke, `${id}: installs ${drivers.join(', ')} but declares no smoke expression`);
    assert.match(spec.smoke, /require\(/, `${id}: the smoke expression must load the driver`);
  }
});

test('the sqlite check constructs a database rather than merely importing', () => {
  /*
   * The regression this pins. `require('better-sqlite3')` succeeds even when the
   * native binding is missing, so an import-only check reports a broken project
   * as healthy — which is exactly what happened.
   */
  assert.match(
    STORAGE.sqlite.smoke,
    /new .*better-sqlite3.*\(':memory:'\)/,
    'sqlite must open a database, because require() alone does not load the binding',
  );
});

test('a missing driver is reported as not loading', () => {
  // The failure path: an empty project cannot resolve anything.
  assert.equal(
    driverLoads(workspace(), "require('better-sqlite3')"),
    false,
    'a driver that is not installed must not report as loading',
  );
});

test('a driver that is present and working reports as loading', () => {
  /*
   * Uses a module guaranteed to resolve anywhere, so the positive case is tested
   * without depending on a native build in the test environment.
   */
  assert.equal(driverLoads(workspace(), "require('node:path')"), true);
});
