/**
 * Regression tests for the CLI surface.
 *
 * Every test here corresponds to a bug that shipped. The scaffolding tests prove
 * the templates are right; these prove that *getting to* them is right — that a
 * scripted run finishes instead of hanging, that a flag typo is not silently
 * obeyed, and that a large install is not killed by the code watching it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';

import { parseArgs } from '../src/args.js';
import { install } from '../src/setup.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'bin', 'lattice.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-cli-'));
}

/** Run the CLI with stdin already at EOF — a scripted / CI invocation. */
function runCli(args, cwd) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 20_000,
    // eslint-disable-next-line no-undef
    env: { ...process.env, NO_COLOR: '1' },
  });
}

// ------------------------------------------------------------------ arguments

test('a switch does not swallow the project name', () => {
  const args = parseArgs(['--force', 'myapp', '--stack', 'express']);

  // The bug: --force consumed "myapp" as its value, so the project got built
  // under the prompt's default name instead.
  assert.equal(args.flags.force, true);
  assert.deepEqual(args._, ['myapp']);
  assert.equal(args.flags.stack, 'express');
});

test('an unknown flag is an error, not a silent no-op', () => {
  assert.throws(() => parseArgs(['--stak', 'express']), /Unknown option "--stak"/);
});

test('a value flag with no value is an error', () => {
  assert.throws(() => parseArgs(['--stack', '--force']), /--stack needs a value/);
  assert.throws(() => parseArgs(['--db']), /--db needs a value/);
});

test('--key=value is accepted', () => {
  const args = parseArgs(['app', '--stack=express', '--db=file', '--format=ndjson']);
  assert.deepEqual(args._, ['app']);
  assert.equal(args.flags.stack, 'express');
  assert.equal(args.flags.db, 'file');
  assert.equal(args.flags.format, 'ndjson');
});

// -------------------------------------------------------------------- install

test('capturing a big install does not kill it', () => {
  // execFileSync's default maxBuffer is 1 MB, and blowing it does not truncate
  // the output — it kills the child with ENOBUFS. A native build (better-sqlite3
  // runs node-gyp) prints past 1 MB, so the install died half-written and the
  // scaffolded project was missing packages its own tests needed.
  const dir = tempDir();
  const noisy = path.join(dir, 'noisy-pm');

  fs.writeFileSync(
    noisy,
    `#!/bin/sh\nnode -e "process.stdout.write('x'.repeat(3 * 1024 * 1024))"\nexit 0\n`,
    { mode: 0o755 },
  );

  const result = install(dir, noisy, true);
  assert.equal(result.ok, true, `install reported failure: ${result.error}`);
});

test('a failing install is reported, not thrown', () => {
  const dir = tempDir();
  const broken = path.join(dir, 'broken-pm');
  fs.writeFileSync(broken, '#!/bin/sh\necho "boom" >&2\nexit 1\n', { mode: 0o755 });

  const result = install(dir, broken, true);
  assert.equal(result.ok, false);
  assert.match(result.error, /boom/);
});

// ------------------------------------------------------- non-interactive runs

test('a scripted run with two text prompts finishes instead of hanging', () => {
  // A readline interface created on an already-ended stdin never emits `line`
  // and never emits `close`. The first prompt after EOF fell back to its default
  // and the second hung forever, so `--stack spring-boot` (which needs both a
  // package and a port) hung in CI rather than completing.
  const cwd = tempDir();
  const result = runCli(
    ['svc', '--stack', 'spring-boot', '--no-install', '--no-db-start'],
    cwd,
  );

  assert.notEqual(result.signal, 'SIGTERM', 'the CLI hung and had to be killed');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scaffolded/);
  assert.ok(fs.existsSync(path.join(cwd, 'svc', 'pom.xml')));
});

test('a scripted run keeps the name it was given', () => {
  const cwd = tempDir();
  const result = runCli(
    ['--force', 'keepme', '--stack', 'node-cli', '--no-install', '--no-db-start'],
    cwd,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(cwd, 'keepme')), 'scaffolded under the wrong name');
});

test('an unanswerable choice fails loudly rather than picking the first option', () => {
  // No --db, no TTY. Silently taking option 1 would hand back a MongoDB project
  // because Mongo happens to sort first.
  const cwd = tempDir();
  const result = runCli(['api', '--stack', 'express', '--no-install', '--no-db-start'], cwd);

  assert.notEqual(result.status, 0, 'an underspecified run should not succeed');
  assert.match(result.stdout + result.stderr, /stdin is not interactive|needs an answer/);
});

test('--db on a stack whose database is fixed is an error', () => {
  const cwd = tempDir();
  const result = runCli(
    ['api', '--stack', 'fastapi', '--db', 'postgres', '--no-install', '--no-db-start'],
    cwd,
  );

  assert.notEqual(result.status, 0, 'the flag was silently ignored');
  assert.match(result.stderr + result.stdout, /does not take a --db/);
});

test('--format outside --db file is an error', () => {
  const cwd = tempDir();
  const result = runCli(
    ['api', '--stack', 'express', '--db', 'memory', '--format', 'yaml', '--no-install'],
    cwd,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /--format only means something with --db file/);
});

// --------------------------------------------------------------------- basics

test('--version prints the version in package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const out = execFileSync('node', [CLI, '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), pkg.version);
});

test('--list names every stack and every database', () => {
  const out = execFileSync('node', [CLI, '--list'], {
    encoding: 'utf8',
    // eslint-disable-next-line no-undef
    env: { ...process.env, NO_COLOR: '1' },
  });

  for (const stack of ['express', 'spring-boot', 'fastapi', 'react-vite-ts', 'javafx']) {
    assert.match(out, new RegExp(stack), `--list omits ${stack}`);
  }
  for (const db of ['mongodb', 'postgres', 'mysql', 'sqlite', 'file', 'memory']) {
    assert.match(out, new RegExp(db), `--list omits ${db}`);
  }
});
