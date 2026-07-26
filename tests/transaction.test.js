/**
 * Generation is all-or-nothing.
 *
 * These assert the property directly rather than through the CLI: that a failure
 * anywhere during generation leaves the working directory exactly as it was. The
 * defect this closes left a half-written project on disk, which then blocked its
 * own retry — `isEmptyDir` correctly saw a non-empty directory and demanded
 * --force, so one transient error cost both the scaffold and the obvious recovery.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beginGeneration } from '../src/transaction.js';

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tx-'));
}

test('nothing appears at the target until commit', () => {
  const cwd = workspace();
  const target = path.join(cwd, 'app');

  const generation = beginGeneration(target);
  fs.writeFileSync(path.join(generation.path, 'package.json'), '{}\n');

  assert.ok(!fs.existsSync(target), 'the target must not exist mid-generation');

  generation.commit();
  assert.ok(fs.existsSync(path.join(target, 'package.json')), 'commit publishes the tree');
});

test('a rollback leaves the working directory exactly as it was', () => {
  const cwd = workspace();
  fs.writeFileSync(path.join(cwd, 'unrelated.txt'), 'do not touch me\n');
  const before = fs.readdirSync(cwd).sort();

  const generation = beginGeneration(path.join(cwd, 'app'));
  fs.mkdirSync(path.join(generation.path, 'src'), { recursive: true });
  fs.writeFileSync(path.join(generation.path, 'src', 'index.js'), 'half a project\n');
  generation.rollback();

  assert.deepEqual(fs.readdirSync(cwd).sort(), before, 'no residue, and nothing else disturbed');
  assert.equal(fs.readFileSync(path.join(cwd, 'unrelated.txt'), 'utf8'), 'do not touch me\n');
});

test('a failure partway through does not block the retry', () => {
  /*
   * The whole point. Generate, fail, roll back, and the next attempt must see a
   * directory it is willing to scaffold into — not one that needs --force.
   */
  const cwd = workspace();
  const target = path.join(cwd, 'app');

  try {
    const generation = beginGeneration(target);
    fs.writeFileSync(path.join(generation.path, 'partial.js'), 'x\n');
    try {
      throw new Error('template unreadable');
    } catch (error) {
      generation.rollback();
      throw error;
    }
  } catch {
    // expected
  }

  assert.ok(!fs.existsSync(target), 'the failed attempt left nothing at the target');

  const retry = beginGeneration(target);
  fs.writeFileSync(path.join(retry.path, 'package.json'), '{}\n');
  retry.commit();
  assert.ok(fs.existsSync(path.join(target, 'package.json')), 'the retry succeeds unaided');
});

test('committing into an existing directory keeps what was already there', () => {
  /*
   * The --force path. It cannot be a rename, and it must never delete what it
   * finds — a scaffolder that removes a directory it did not create is a bug
   * report about lost work.
   */
  const cwd = workspace();
  const target = path.join(cwd, 'app');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'keep-me.txt'), 'mine\n');

  const generation = beginGeneration(target);
  fs.mkdirSync(path.join(generation.path, 'src'));
  fs.writeFileSync(path.join(generation.path, 'src', 'index.js'), 'generated\n');
  generation.commit();

  assert.equal(fs.readFileSync(path.join(target, 'keep-me.txt'), 'utf8'), 'mine\n');
  assert.ok(fs.existsSync(path.join(target, 'src', 'index.js')), 'the scaffold landed too');
});

test('staging sits beside the target, so the rename cannot cross a filesystem', () => {
  /*
   * rename() is only atomic within one device. A system temp directory is often a
   * different mount, and the failure mode is EXDEV at commit time — after all the
   * work is done.
   */
  const cwd = workspace();
  const generation = beginGeneration(path.join(cwd, 'app'));

  assert.equal(path.dirname(generation.path), cwd, 'staging is a sibling of the target');
  generation.rollback();
});

test('a settled transaction refuses to be settled again', () => {
  const cwd = workspace();
  const generation = beginGeneration(path.join(cwd, 'app'));
  generation.commit();

  assert.throws(() => generation.commit(), /already been settled/);
  generation.rollback(); // must be harmless, not a second commit
});
