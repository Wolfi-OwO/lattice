/**
 * The structural gate.
 *
 * Two properties matter here and they pull in opposite directions: it has to
 * catch a file whose placement makes it silently dead, and it must never fire on
 * a project that is correctly laid out. The second is the harder one — a gate
 * that cries wolf is a gate people pass `--force` to, and then it protects
 * nothing. Every rule was calibrated by running it against all ten templates
 * first, which is how the Alembic exemption below was found rather than guessed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { verifyStructure, describeViolations } from '../src/verify.js';

/** Build a throwaway project tree from a list of paths. */
function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
  for (const file of files) {
    const full = path.join(dir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
  }
  return dir;
}

// ------------------------------------------------------------------ it catches

test('a Java source outside src/ is rejected, because Maven never compiles it', () => {
  /*
   * The worst kind of wrong: the file exists, the editor is happy, and the class
   * simply does not exist at runtime. No compiler error points at it.
   */
  const target = project(['pom.xml', 'src/main/java/app/Main.java', 'Stray.java']);
  const { ok, violations } = verifyStructure(target, 'maven');

  assert.equal(ok, false);
  assert.deepEqual(violations.map((v) => v.file), ['Stray.java']);
  assert.match(violations[0].why, /silently does not exist at runtime/);
});

test('a test under src/main is rejected, because it ships inside the artifact', () => {
  const target = project([
    'pom.xml',
    'src/main/java/app/Main.java',
    'src/main/java/app/UserServiceTest.java',
  ]);
  const { ok, violations } = verifyStructure(target, 'maven');

  assert.equal(ok, false);
  assert.ok(violations.some((v) => /packaged into the built artifact/.test(v.why)));
});

test('a loose module at a Python project root is rejected', () => {
  const target = project(['pyproject.toml', 'app/main.py', 'helper.py']);
  const { violations } = verifyStructure(target, 'python');

  assert.deepEqual(violations.map((v) => v.file), ['helper.py']);
});

test('a loose source at a Node project root is rejected', () => {
  const target = project(['package.json', 'src/index.js', 'stray.js']);
  const { violations } = verifyStructure(target, 'node');

  assert.deepEqual(violations.map((v) => v.file), ['stray.js']);
});

// ----------------------------------------------------- and what it must not do

test('root configuration files are not mistaken for stray sources', () => {
  /*
   * These belong at the root by their own tool's convention. A gate that rejected
   * vite.config.ts would be wrong about every Vite project ever generated.
   */
  const target = project([
    'package.json',
    'src/main.tsx',
    'vite.config.ts',
    'eslint.config.js',
    'vitest.config.ts',
    'tailwind.config.js',
  ]);

  assert.deepEqual(verifyStructure(target, 'node').violations, []);
});

test('a migration tool keeps its own directory', () => {
  /*
   * Alembic loads env.py and versions/* itself rather than importing them as part
   * of the package. This exemption exists because the gate rejected the real
   * fastapi template on its first run — the rule was wrong, not the template.
   */
  const target = project([
    'pyproject.toml',
    'app/main.py',
    'alembic/env.py',
    'alembic/versions/0001_create_users.py',
  ]);

  assert.deepEqual(verifyStructure(target, 'python').violations, []);
});

test('the Java demo-data loader is exempt, as CONVENTIONS rule 5 requires', () => {
  /*
   * database/FillDemoData.java is run standalone through a Spring profile and is
   * never compiled into the application, so it is outside src/ on purpose.
   */
  const target = project(['pom.xml', 'src/main/java/app/Main.java', 'database/FillDemoData.java']);

  assert.deepEqual(verifyStructure(target, 'maven').violations, []);
});

test('build output is never inspected', () => {
  /*
   * target/ and node_modules/ are full of files that would each trip a rule, and
   * none of them are the project's own.
   */
  const target = project([
    'pom.xml',
    'src/main/java/app/Main.java',
    'target/classes/app/Main.class',
    'target/generated-sources/Anything.java',
  ]);

  assert.deepEqual(verifyStructure(target, 'maven').violations, []);
});

test('an unrecognised toolchain is not judged against invented rules', () => {
  /*
   * Guessing at a layout nobody declared would reject correct projects in
   * ecosystems this repository has no opinion about.
   */
  const target = project(['main.go', 'go.mod']);

  assert.deepEqual(verifyStructure(target, null), { ok: true, violations: [] });
  assert.deepEqual(verifyStructure(target, 'elixir'), { ok: true, violations: [] });
});

// ------------------------------------------------------------------ the report

test('the report says what is wrong, where, and that nothing was written', () => {
  /*
   * A gate that only says "invalid" makes the user guess. Each line names the
   * file and the consequence, and the last line answers the question they will
   * actually have: is there a mess to clean up.
   */
  const target = project(['pom.xml', 'Stray.java']);
  const report = describeViolations(verifyStructure(target, 'maven').violations);

  assert.match(report, /Stray\.java/);
  assert.match(report, /silently does not exist at runtime/);
  assert.match(report, /rolled back/);
});
