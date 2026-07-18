/**
 * The external-generator registry and runner. The registry is asserted fully; the
 * runner is tested for its gate (a missing toolchain fails loudly) rather than by
 * running real generators — that is done end to end by hand, and a suite that ran
 * `npx create-vite` on every test would need the network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GENERATORS, findGenerator, generatorChoices } from '../src/generators.js';
import { runGenerator } from '../src/setup.js';

test('every generator is fully specified and non-interactive', () => {
  for (const g of GENERATORS) {
    assert.ok(g.id, 'has an id');
    assert.ok(g.label, `${g.id}: has a label`);
    assert.ok(g.ecosystem, `${g.id}: names an ecosystem`);
    assert.ok(g.requires, `${g.id}: names a required binary`);
    assert.ok(g.bin, `${g.id}: names a binary to run`);
    assert.equal(typeof g.argv, 'function', `${g.id}: argv is a builder`);

    const argv = g.argv('sample');
    assert.ok(Array.isArray(argv) && argv.length > 0, `${g.id}: argv builds a non-empty array`);
    assert.ok(argv.includes('sample'), `${g.id}: the project name reaches the argv`);
    // No generator may drop into an interactive prompt in a scaffolder.
    const joined = argv.join(' ');
    assert.ok(
      !/--interactive(?!=false)/.test(joined),
      `${g.id}: must not run interactively`,
    );
  }
});

test('every generator says how to actually run what it produced', () => {
  // The bug this pins: the CLI printed a hardcoded "npm install", so scaffolding a Go
  // module or a cargo crate told the user to run npm in a project with no package.json.
  for (const g of GENERATORS) {
    assert.ok(Array.isArray(g.next) && g.next.length > 0, `${g.id}: declares next steps`);

    const commands = g.next.filter((step) => !step.startsWith('#'));
    assert.ok(commands.length > 0, `${g.id}: next steps contain a real command`);

    // A next step must belong to the toolchain that produced the project. npm advice
    // in a cargo/go/dotnet project is the exact defect this test exists for.
    if (g.bin !== 'npx' && g.bin !== 'ng') {
      assert.ok(
        !commands.some((step) => /\bnpm\b/.test(step)),
        `${g.id}: is a ${g.bin} project but its next steps mention npm`,
      );
    }
  }
});

test('every generator is exercised by the Generators workflow', () => {
  // The workflow lists ids by hand — it has to, because each toolchain needs its own
  // setup action. That list is exactly the kind that silently falls behind the
  // registry, and a generator nothing ever runs is a generator nobody knows is
  // broken until a user hits it. So the drift is a test failure instead.
  const workflow = fs.readFileSync(
    path.join(import.meta.dirname, '..', '.github', 'workflows', 'generators.yml'),
    'utf8',
  );

  const missing = GENERATORS.map((g) => g.id).filter(
    (id) => !new RegExp(`(^|[\\s\\[,])${id}([\\s\\],]|$)`, 'm').test(workflow),
  );

  assert.deepEqual(
    missing,
    [],
    `these generators are in the registry but never run in CI: ${missing.join(', ')}`,
  );
});

test('generator ids are unique', () => {
  const seen = new Set();
  for (const g of GENERATORS) {
    assert.ok(!seen.has(g.id), `duplicate generator id: ${g.id}`);
    seen.add(g.id);
  }
});

test('the full create-vite template matrix is present', () => {
  // The user asked specifically for "npm create vite, all the languages it offers".
  for (const t of ['vanilla', 'react', 'vue', 'svelte', 'preact', 'lit', 'solid', 'qwik']) {
    assert.ok(findGenerator(`vite-${t}`), `create-vite template "${t}" should be a generator`);
  }
});

test('findGenerator returns null for an unknown id', () => {
  assert.equal(findGenerator('does-not-exist'), null);
});

test('generatorChoices lists every generator with its ecosystem', () => {
  const choices = generatorChoices();
  assert.equal(choices.length, GENERATORS.length);
  assert.ok(choices.every((c) => c.id && c.label && c.ecosystem));
});

test('runGenerator finds a binary that is really on PATH, on every platform', () => {
  // The regression this pins: the lookup used to shell out to `which`, which does not
  // exist on Windows — so on the Windows runner every generator claimed its toolchain
  // was missing. `node` is on PATH wherever this suite can run at all, so a generator
  // requiring it must get past the gate and actually execute.
  const generator = {
    id: 'node-mkdir',
    requires: 'node',
    bin: 'node',
    argv: (name) => ['-e', `require('node:fs').mkdirSync(${JSON.stringify(name)})`, name],
  };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  const projectDir = runGenerator(generator, 'app', cwd);

  assert.equal(projectDir, path.join(cwd, 'app'));
  assert.ok(fs.existsSync(projectDir), 'the generator ran and produced the project directory');
});

test('runGenerator refuses when the required binary is missing', () => {
  const fake = {
    id: 'fake',
    requires: 'definitely-not-a-real-binary-xyz',
    bin: 'definitely-not-a-real-binary-xyz',
    argv: (name) => ['init', name],
  };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  assert.throws(() => runGenerator(fake, 'app', cwd), /not installed/);
});
