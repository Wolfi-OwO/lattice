/**
 * What each language needs in order to actually run — asserted per ecosystem.
 *
 * The existing suites check that templates are internally consistent: the right
 * adapter survives, no placeholder is left behind, the conventions hold. None of
 * them asked the blunter question a user asks first, which is *can I run this*.
 *
 * The gap that prompted these: the Spring Boot template's README and the CLI both
 * say `mvn spring-boot:run`, and the template ships no Maven wrapper — so the
 * project is runnable only if you already have the right Maven installed
 * globally. CI never noticed because `actions/setup-java` puts Maven on PATH. The
 * person who reported it did not have Maven, and for them the scaffold simply did
 * not work.
 *
 * So each ecosystem states its own bar, in its own vocabulary, and each assertion
 * is a thing that breaks a real run rather than a thing that offends a linter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import os from 'node:os';

import { TEMPLATES } from '../src/registry.js';
import { copyTemplate } from '../src/scaffold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STACKS = path.join(ROOT, 'stacks');

const dirOf = (framework) => path.join(STACKS, TEMPLATES.find((t) => t.framework === framework).dir);
const has = (framework, ...parts) => fs.existsSync(path.join(dirOf(framework), ...parts));
const read = (framework, ...parts) => fs.readFileSync(path.join(dirOf(framework), ...parts), 'utf8');

/**
 * Every file a template actually ships, relative to it.
 *
 * Read from git rather than from disk, because "what is in this directory" and
 * "what this template ships" are different questions the moment anyone runs a
 * build: target/ and .gradle/ appear locally, are correctly gitignored, and are
 * not part of the template. Walking the filesystem made these tests fail on any
 * machine that had built a scaffold once, which is a test reporting on the
 * developer rather than on the repository.
 */
function filesOf(framework) {
  const base = dirOf(framework);
  return execFileSync('git', ['ls-files', '-z', '--', base], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((f) => path.relative(base, path.join(ROOT, f)).split(path.sep).join('/'));
}

const MAVEN = ['spring-boot', 'javafx'];
const GRADLE = ['android-compose'];
const PYTHON = ['fastapi', 'ml-project'];

// ---------------------------------------------------------------- Java / Maven

test('every Maven template can be built without Maven installed', () => {
  /*
   * The reported bug. `mvn spring-boot:run` requires a global Maven of a
   * compatible version; the wrapper is how a Java project ships that requirement
   * instead of assuming it. Every Spring Initializr project has shipped one for a
   * decade, and its absence is why a scaffold that CI builds happily did nothing
   * at all on the reporter's machine.
   */
  for (const framework of MAVEN) {
    assert.ok(has(framework, 'mvnw'), `${framework}: no ./mvnw — the project needs a global Maven to run`);
    assert.ok(has(framework, 'mvnw.cmd'), `${framework}: no mvnw.cmd — unusable on Windows`);
    assert.ok(
      has(framework, '.mvn', 'wrapper', 'maven-wrapper.properties'),
      `${framework}: the wrapper cannot resolve a Maven distribution without its properties`,
    );
  }
});

test('the Maven wrapper is a script, never a checked-in binary', () => {
  /*
   * STRUCTURE.md refuses to ship binaries, and that rule stands. Maven's
   * script-only distribution type exists exactly for this: mvnw resolves Maven
   * itself, so there is no maven-wrapper.jar to commit.
   */
  for (const framework of MAVEN) {
    const binaries = filesOf(framework).filter((f) => /\.(jar|class|exe|so|dylib)$/.test(f));
    assert.deepEqual(binaries, [], `${framework}: binaries must not be committed — found ${binaries.join(', ')}`);

    const properties = read(framework, '.mvn', 'wrapper', 'maven-wrapper.properties');
    assert.match(
      properties,
      /distributionType=only-script/,
      `${framework}: the wrapper must be script-only, or it needs a jar`,
    );
    assert.match(properties, /distributionUrl=\S+/, `${framework}: the wrapper must name a Maven distribution`);
  }
});

test('Maven templates use the standard directory layout', () => {
  /*
   * Maven resolves these by convention, not configuration. A source file outside
   * src/main/java is silently not compiled, which is the worst kind of wrong.
   */
  for (const framework of MAVEN) {
    assert.ok(has(framework, 'pom.xml'), `${framework}: no pom.xml`);
    assert.ok(has(framework, 'src', 'main', 'java'), `${framework}: no src/main/java`);
    assert.ok(has(framework, 'src', 'main', 'resources'), `${framework}: no src/main/resources`);
    assert.ok(has(framework, 'src', 'test', 'java'), `${framework}: no src/test/java`);

    const strays = filesOf(framework).filter((f) => f.endsWith('.java') && !f.startsWith('src/') && !f.startsWith('database/'));
    assert.deepEqual(strays, [], `${framework}: .java outside src/ is never compiled — ${strays.join(', ')}`);
  }
});

test('Maven templates declare a wrapper-compatible build, and the run command matches', () => {
  for (const framework of MAVEN) {
    const template = TEMPLATES.find((t) => t.framework === framework);

    /*
     * The steps the CLI prints are the ones the user types first. Telling them to
     * run `mvn` when the project ships `./mvnw` is how a scaffold appears broken
     * to anyone without a global Maven.
     */
    const steps = (template.post ?? []).join('\n');
    assert.match(steps, /\.\/mvnw/, `${framework}: next steps must use ./mvnw, not a global mvn`);

    const readme = read(framework, 'README.md');
    assert.match(readme, /\.\/mvnw/, `${framework}: the README must use ./mvnw too`);
  }
});

// -------------------------------------------------------------- Kotlin / Gradle

test('Gradle templates ship a wrapper and a version catalog', () => {
  for (const framework of GRADLE) {
    assert.ok(has(framework, 'settings.gradle.kts'), `${framework}: no settings.gradle.kts`);
    assert.ok(has(framework, 'build.gradle.kts'), `${framework}: no build.gradle.kts`);
    assert.ok(
      has(framework, 'gradle', 'libs.versions.toml'),
      `${framework}: no version catalog — every dependency version would be inline`,
    );
    /*
     * The full Gradle wrapper ships — all four parts, or none is usable. Gradle
     * has no script-only wrapper the way Maven does, so a working template must
     * commit gradle-wrapper.jar; STRUCTURE.md carves the one exception for it and
     * CI validates its checksum. Shipping gradlew without the jar, or the jar
     * without gradlew, leaves a clone that cannot build — which is the whole
     * failure this template spent its existence in.
     */
    assert.ok(has(framework, 'gradlew'), `${framework}: no gradlew — a clone cannot build`);
    assert.ok(has(framework, 'gradlew.bat'), `${framework}: ships gradlew but not gradlew.bat`);
    assert.ok(
      has(framework, 'gradle', 'wrapper', 'gradle-wrapper.properties'),
      `${framework}: a wrapper without its properties cannot resolve a distribution`,
    );
    assert.ok(
      has(framework, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
      `${framework}: gradlew is inert without gradle-wrapper.jar`,
    );
  }
});

test('no build output is committed to any template', () => {
  /*
   * These are generated, machine-specific and frequently binary. A .gradle cache
   * committed once travels into every project scaffolded from the template.
   * `bin/` is deliberately absent: for a CLI template it is the entry point, not
   * output. The rest are directories no ecosystem ever asks you to write by hand.
   */
  const OUTPUT = ['.gradle', 'build', 'target', 'out', 'dist', 'node_modules', '__pycache__', '.venv'];

  for (const template of TEMPLATES) {
    const offenders = filesOf(template.framework).filter((f) =>
      f.split('/').slice(0, -1).some((seg) => OUTPUT.includes(seg)),
    );
    assert.deepEqual(
      offenders,
      [],
      `${template.framework}: build output must not be committed — ${offenders.slice(0, 3).join(', ')}`,
    );
  }
});

// ---------------------------------------------------------------------- Python

test('Python templates declare their dependencies and a test location', () => {
  for (const framework of PYTHON) {
    assert.ok(has(framework, 'requirements.txt'), `${framework}: no requirements.txt`);
    assert.ok(has(framework, 'requirements-dev.txt'), `${framework}: no requirements-dev.txt`);
    assert.ok(has(framework, 'pyproject.toml'), `${framework}: no pyproject.toml`);

    /*
     * The dev file must pull in the runtime one, or `pip install -r
     * requirements-dev.txt` — which is what the CLI prints — installs a project
     * that cannot import its own dependencies.
     */
    assert.match(
      read(framework, 'requirements-dev.txt'),
      /^-r requirements\.txt$/m,
      `${framework}: requirements-dev.txt must include requirements.txt`,
    );
    assert.ok(has(framework, 'tests'), `${framework}: no tests/ directory`);
  }
});

// ------------------------------------------------------------------- every one

test('every template ships whatever its ecosystem needs to be run at all', () => {
  /*
   * One statement of the rule, so a new template cannot arrive without an answer
   * to "how do I run this".
   */
  const ENTRY_POINT = {
    npm: ['_package.json'],
    maven: ['mvnw', 'pom.xml'],
    /*
     * gradlew is the entry point now: the wrapper ships in full (the Gradle test
     * above enforces all four parts), so a clone runs ./gradlew with no Gradle
     * installed — the same clone-and-run experience mvnw gives the Maven templates.
     */
    gradle: ['gradlew', 'build.gradle.kts', 'settings.gradle.kts'],
    python: ['requirements.txt'],
  };

  for (const template of TEMPLATES) {
    const kind = MAVEN.includes(template.framework)
      ? 'maven'
      : GRADLE.includes(template.framework)
        ? 'gradle'
        : PYTHON.includes(template.framework)
          ? 'python'
          : 'npm';

    for (const required of ENTRY_POINT[kind]) {
      assert.ok(
        has(template.framework, required),
        `${template.framework} (${kind}): missing ${required}, so there is no way to run it`,
      );
    }
  }
});

test('the npm tarball carries no build output', () => {
  /*
   * package.json's `files` is an allowlist and does NOT honour .gitignore, so a
   * .gradle cache sitting in a working copy would be published even though git
   * ignores it. The published 1.0.1 is clean; this keeps it that way.
   */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const negations = (pkg.files ?? []).filter((entry) => entry.startsWith('!'));

  assert.ok(
    negations.some((entry) => entry.includes('.gradle')),
    'package.json "files" must explicitly exclude .gradle — npm ignores .gitignore here',
  );
});

/*
 * Windows has no POSIX permission bits — Node reports a synthetic mode there, and
 * Windows users run mvnw.cmd rather than ./mvnw. These two assertions are about the
 * executable bit, so they only mean anything where one exists.
 */
const posixOnly = { skip: process.platform === 'win32' ? 'no executable bit on Windows' : false };

test('an executable in a template is still executable after scaffolding', posixOnly, () => {
  /*
   * writeFileSync creates 0644, so the render path dropped the bit while the
   * binary path kept it — and `./mvnw` is the very first thing a Java user types.
   * It failed with Permission denied, which reads as a broken scaffold rather than
   * a missing chmod.
   */
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'));

  fs.writeFileSync(path.join(source, 'runner'), '#!/bin/sh\necho {{projectName}}\n');
  fs.chmodSync(path.join(source, 'runner'), 0o755);
  fs.writeFileSync(path.join(source, 'plain.txt'), 'not executable\n');

  copyTemplate(source, target, { projectName: 'demo' });

  assert.ok(fs.statSync(path.join(target, 'runner')).mode & 0o111, 'the executable bit survives');
  assert.ok(!(fs.statSync(path.join(target, 'plain.txt')).mode & 0o111), 'and is not invented');
  assert.match(fs.readFileSync(path.join(target, 'runner'), 'utf8'), /echo demo/, 'still rendered');
});

test('every Maven template scaffolds an executable wrapper', posixOnly, () => {
  for (const framework of MAVEN) {
    const mode = fs.statSync(path.join(dirOf(framework), 'mvnw')).mode;
    assert.ok(mode & 0o111, `${framework}: mvnw is not executable in the template itself`);
  }
});

test('every Gradle template ships an executable gradlew', posixOnly, () => {
  /*
   * Same failure as a non-executable mvnw, and easy to reintroduce: git preserves
   * the bit, but a file recreated by an editor or a careless copy loses it, and
   * then `./gradlew` on a fresh clone is "permission denied" before Gradle is even
   * reached. copyTemplate carries the source mode across, so the template's own
   * bit is what every scaffolded project inherits.
   */
  for (const framework of GRADLE) {
    const mode = fs.statSync(path.join(dirOf(framework), 'gradlew')).mode;
    assert.ok(mode & 0o111, `${framework}: gradlew is not executable in the template itself`);
  }
});
