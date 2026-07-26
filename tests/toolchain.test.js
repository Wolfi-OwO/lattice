import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkToolchain,
  detectJava,
  detectPython,
  meets,
  requiredJava,
  requiredPython,
} from '../src/toolchain.js';
import { TEMPLATES, nextSteps } from '../src/registry.js';

/**
 * Toolchain detection, which decides whether lattice installs a project's
 * dependencies or explains why it did not.
 *
 * Almost nothing here runs a real install. Whether `pip install` succeeds is
 * about the network and the machine; what these tests are for is the reasoning
 * around it — that the version floors come from the templates rather than from a
 * constant that can drift, that a too-old runtime is refused rather than tried,
 * and that the steps printed afterwards describe the project that actually
 * exists.
 */

const STACK_ROOT = path.resolve(import.meta.dirname, '..', 'stacks');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-toolchain-'));
}

// ------------------------------------------------------------------- detection

test('detecting a runtime never throws, whatever is installed', () => {
  /*
   * Both of these shell out to a command that may not exist. A scaffolder that
   * crashes because the user has no JDK is worse than one that says so.
   */
  for (const detect of [detectJava, detectPython]) {
    const result = detect();
    assert.equal(typeof result.present, 'boolean');
    if (result.present) assert.ok(result.version, 'a present runtime must report a version');
  }
});

test('Java 8 is read as 8, not as 1', () => {
  /*
   * Java's version string has two eras — 1.8.0_402 for 8 and below, 17.0.19 for
   * 9 and up. Reading the first component would report "Java 1 is too old",
   * which is true and useless.
   */
  assert.equal(meets([8, 0], [17, 0]), false);
  assert.equal(meets([17, 0], [17, 0]), true);
  assert.equal(meets([21, 0], [17, 0]), true);
});

test('version comparison handles the minor component', () => {
  assert.equal(meets([3, 12], [3, 12]), true);
  assert.equal(meets([3, 14], [3, 12]), true);
  assert.equal(meets([3, 9], [3, 12]), false);
  assert.equal(meets([4, 0], [3, 12]), true);
  assert.equal(meets([null, null], [3, 12]), false);
});

// ------------------------------------------------------------------ the floors

test('every Maven template declares the Java version it needs', () => {
  /*
   * Read from the pom rather than restated in src/toolchain.js. A template that
   * stops declaring one would otherwise be installed against any JDK at all, and
   * fail at compile time instead of being refused with a reason.
   */
  for (const template of TEMPLATES.filter((t) => t.installer === 'maven')) {
    const required = requiredJava(path.join(STACK_ROOT, template.dir));
    assert.ok(required, `${template.framework} has no <java.version> or <maven.compiler.release>`);
    assert.ok(required[0] >= 17, `${template.framework} asks for Java ${required[0]}`);
  }
});

test('every Python template declares the Python version it needs', () => {
  for (const template of TEMPLATES.filter((t) => t.installer === 'python')) {
    const required = requiredPython(path.join(STACK_ROOT, template.dir));
    assert.ok(required, `${template.framework} has no requires-python in pyproject.toml`);
    assert.equal(required[0], 3);
    assert.ok(required[1] >= 12, `${template.framework} asks for Python 3.${required[1]}`);
  }
});

test('a project declaring nothing is not assigned a floor', () => {
  /*
   * Better to install and let the build complain than to invent a requirement
   * and refuse a project that would have worked.
   */
  const empty = tempDir();
  assert.equal(requiredJava(empty), null);
  assert.equal(requiredPython(empty), null);
});

// ------------------------------------------------------------------- the check

test('a missing or too-old runtime is refused with a reason, not attempted', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'pom.xml'), '<project><properties><java.version>99</java.version></properties></project>');

  const result = checkToolchain('maven', dir);
  assert.equal(result.ok, false, 'Java 99 does not exist yet, so this cannot pass');
  assert.match(result.reason, /Java/);
  /*
   * The reason has to be actionable on its own — a user reading it should not
   * have to go and find out what the project wanted.
   */
  assert.match(result.reason, /99/);
});

test('the Python check names both versions when it refuses', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'pyproject.toml'), 'requires-python = ">=99.0"\n');

  const result = checkToolchain('python', dir);
  const python = detectPython();

  assert.equal(result.ok, false);
  assert.match(result.reason, /99/);
  if (python.present) {
    assert.match(result.reason, new RegExp(python.version.replace('.', '\\.')));
  }
});

test('an unknown toolchain is refused rather than guessed at', () => {
  /*
   * Gradle/Android is deliberately not auto-installed: its build needs the
   * Android SDK and accepted licences, which is not a scaffolder's business.
   */
  const result = checkToolchain('gradle', tempDir());
  assert.equal(result.ok, false);
  assert.match(result.reason, /gradle/);
});

test('lattice never claims to install a runtime', () => {
  /*
   * The whole design rests on this: dependencies go into the project, runtimes
   * are the machine's business. If a "reason" ever started offering to install
   * Java, that line would be the place it happened.
   */
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'toolchain.js'), 'utf8');
  for (const forbidden of ['apt-get', 'brew install', 'choco install', 'winget install']) {
    assert.ok(!source.includes(forbidden), `src/toolchain.js reaches for ${forbidden}`);
  }
});

// -------------------------------------------------------------- what is printed

test('the steps printed match whether the install actually happened', () => {
  for (const template of TEMPLATES.filter((t) => t.postInstalled)) {
    const before = nextSteps(template, false);
    const after = nextSteps(template, true);

    assert.notDeepEqual(before, after, `${template.framework} has postInstalled that changes nothing`);

    /*
     * The point of the second list is that the install is done. Telling someone
     * to run it again is the same wasted minute as not having installed at all.
     */
    assert.ok(
      !after.some((step) => /pip install|python -m venv/.test(step)),
      `${template.framework} still tells an installed project to install`,
    );
    /*
     * And the first must not assume a virtualenv nobody made — the exact bug
     * that made scripts/print-next-steps.js necessary.
     */
    assert.ok(
      before.some((step) => step.includes('venv')),
      `${template.framework} tells a fresh project to activate a .venv it has no way to have`,
    );
  }
});

test('every template that can be auto-installed says what to do once it is', () => {
  for (const template of TEMPLATES.filter((t) => t.installer === 'python')) {
    assert.ok(
      template.postInstalled?.length,
      `${template.framework} is auto-installed but only documents the manual path`,
    );
  }
});
