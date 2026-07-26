import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT_DOCS, mirrorTable } from '../scripts/docs-mirror.js';

/**
 * The documentation site, checked without MkDocs being installed.
 *
 * `npm test` has to run on a clone with nothing but Node — that is the whole
 * point of the zero-dependency rule — so nothing here builds the site. The
 * build is CI's job (.github/workflows/docs.yml), and `strict: true` in
 * mkdocs.yml makes a broken link fail it.
 *
 * What is left is the part a build would *not* catch: whether the pieces still
 * refer to each other correctly. The mirror script, the workflow's path filter,
 * the navigation files and .gitignore each encode the same handful of facts, and
 * every one of them is a file somebody could edit without touching the others.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCS = path.join(ROOT, 'documentation');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'docs.yml');

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * The `paths:` lists out of docs.yml, one array per occurrence.
 *
 * Hand-parsed rather than pulled from a YAML library, for the same reason the
 * arg parser is hand-written: this reads two flat lists of strings out of a file
 * whose shape is fixed, and a dependency to do it would be the first one in the
 * repository.
 */
function workflowPathFilters() {
  const lines = read('.github/workflows/docs.yml').split('\n');
  const filters = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*paths:\s*$/.test(lines[i])) continue;

    const entries = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const entry = lines[j].match(/^\s+- (\S+)\s*$/);
      if (entry) {
        entries.push(entry[1]);
        continue;
      }
      // Comments and blank lines sit inside the list; anything else ends it.
      if (/^\s*#/.test(lines[j]) || lines[j].trim() === '') continue;
      break;
    }
    filters.push(entries);
  }

  return filters;
}

/** Every file listed in a .nav.yml, paired with the directory it was listed in. */
function navEntries(dir) {
  const file = path.join(dir, '.nav.yml');
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.match(/^\s+- (.+?)\s*$/)?.[1])
    .filter(Boolean)
    .map((entry) => entry.replace(/^'(.*)'$/, '$1'))
    .map((entry) => ({ dir, entry }));
}

// ------------------------------------------------------------------- mirroring

test('every document the site mirrors actually exists', () => {
  for (const doc of ROOT_DOCS) {
    assert.ok(
      fs.existsSync(path.join(ROOT, doc.from)),
      `docs-mirror.js mirrors ${doc.from}, which is not in the repository`,
    );
  }
});

test('the ADRs are discovered rather than listed', () => {
  /*
   * Adding an ADR must be adding a file. If this ever has to be kept in step
   * with a list in the script, the list is what stops being updated.
   */
  const onDisk = fs
    .readdirSync(path.join(ROOT, 'docs', 'adr'))
    .filter((name) => name.endsWith('.md'));

  const mirrored = mirrorTable().filter((entry) => entry.from.startsWith('docs/adr/'));

  assert.equal(
    mirrored.length,
    onDisk.length,
    'docs/adr holds a file the mirror does not pick up, or the other way round',
  );
});

test('the ADR index is mirrored as index.md, not as README', () => {
  /*
   * MkDocs treats index.md as a section's landing page. Left as README.md it
   * becomes a page called "README" *inside* the section, and the section itself
   * is a heading nobody can click.
   */
  const index = mirrorTable().find((entry) => entry.from === 'docs/adr/README.md');
  assert.equal(index?.to, 'adr/index.md');
});

test('mirrored copies are gitignored', () => {
  /*
   * They are build output. Committing one means the next build overwrites it and
   * the change is lost, which is a confusing way to find out.
   */
  const ignored = read('.gitignore');
  assert.match(ignored, /^\/documentation\/project\/$/m);
  assert.match(ignored, /^\/site\/$/m);
});

test('no mirrored copy is tracked by git', () => {
  /*
   * Being in .gitignore is not the same as being untracked, and the difference
   * has already cost once: the styling branch was cut before that ignore rule
   * existed, so a `git add -A` on it swept all twelve generated files onto main.
   * Nothing complained — an ignore rule has no effect on a file already staged.
   *
   * So this asks git what it is actually tracking rather than what it was told
   * to ignore.
   */
  const { status, stdout } = spawnSync('git', ['ls-files', 'documentation/project'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // Not a git checkout — an npm tarball, say. Nothing to check.
  if (status !== 0) return;

  const tracked = stdout.split('\n').filter(Boolean);
  assert.deepEqual(
    tracked,
    [],
    `documentation/project/ is build output, but git is tracking:\n  ${tracked.join('\n  ')}\n` +
      'Run: git rm -r --cached documentation/project',
  );
});

test('the site never mirrors the README', () => {
  /*
   * The README is written for someone looking at a repository and the site's
   * home page for someone looking at a website. Mirroring one over the other
   * gives the site two front doors that drift apart.
   */
  assert.ok(!ROOT_DOCS.some((doc) => doc.from === 'README.md'));
});

// -------------------------------------------------------------------- workflow

test('the workflow rebuilds the site for every file it mirrors', () => {
  const [pushPaths] = workflowPathFilters();
  assert.ok(pushPaths?.length, 'no paths: filter found in docs.yml');

  for (const entry of mirrorTable()) {
    const covered = pushPaths.some(
      (pattern) => pattern === entry.from || entry.from.startsWith(pattern.replace(/\*\*$/, '')),
    );
    assert.ok(
      covered,
      `docs.yml would not rebuild when ${entry.from} changes, but that file is a published page`,
    );
  }
});

test('the push and pull_request path filters are identical', () => {
  /*
   * GitHub Actions has no YAML anchors, so the list is written twice. If they
   * drift, a change is checked on one event and not the other — and the one that
   * silently stops being checked is whichever was not being looked at.
   */
  const filters = workflowPathFilters();
  assert.equal(filters.length, 2, 'expected exactly two paths: filters in docs.yml');
  assert.deepEqual(filters[0], filters[1]);
});

test('the workflow rebuilds when its own machinery changes', () => {
  const [paths] = workflowPathFilters();
  for (const machinery of [
    'documentation/**',
    'mkdocs.yml',
    'mkdocs-requirements.txt',
    'scripts/docs-mirror.js',
    'scripts/mkdocs_hooks.py',
    '.github/workflows/docs.yml',
  ]) {
    assert.ok(paths.includes(machinery), `docs.yml ignores changes to ${machinery}`);
  }
});

test('a pull request builds the site but never deploys it', () => {
  const workflow = read('.github/workflows/docs.yml');
  assert.match(
    workflow,
    /if: github\.event_name != 'pull_request'/,
    'the deploy job must be gated — a fork could otherwise publish to the site',
  );
});

test('the docs toolchain is pinned', () => {
  /*
   * The site is rebuilt by CI on merges nobody is watching. A floating range
   * means a theme release can turn the build red on a morning when nothing here
   * changed.
   */
  const lines = read('mkdocs-requirements.txt')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  assert.ok(lines.length > 0, 'mkdocs-requirements.txt lists nothing');
  for (const line of lines) {
    assert.match(line, /^[\w-]+==\d+\.\d+/, `${line} is not pinned to an exact version`);
  }
});

test('the docs toolchain is not an npm dependency', () => {
  /*
   * ADR-0001 covers dev dependencies too. A docs toolchain in package.json would
   * be that rule broken with a different label on it.
   */
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

// ------------------------------------------------------------------ navigation

test('every .nav.yml entry names something that exists', () => {
  /*
   * A name that matches nothing is dropped from the navigation silently, so the
   * page is live at its URL and reachable from nowhere.
   */
  const directories = [DOCS, ...fs.readdirSync(DOCS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(DOCS, entry.name))];

  for (const dir of directories) {
    for (const { entry } of navEntries(dir)) {
      if (entry === '*') continue;
      assert.ok(
        fs.existsSync(path.join(dir, entry)),
        `${path.relative(ROOT, dir)}/.nav.yml lists "${entry}", which does not exist`,
      );
    }
  }
});

test('every page is reachable from the navigation', () => {
  /*
   * The top-level .nav.yml lists its sections explicitly and ends with '*'. A
   * section listed by name that is later renamed would vanish from the sidebar
   * while its pages stayed live.
   */
  const listed = navEntries(DOCS).map(({ entry }) => entry);
  assert.ok(listed.includes('*'), "documentation/.nav.yml must end with '*' so new folders appear");

  const onDisk = fs
    .readdirSync(DOCS, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'project')
    .map((entry) => entry.name);

  for (const name of onDisk) {
    assert.ok(
      listed.includes(name),
      `documentation/${name} is not named in .nav.yml — it would be ordered by '*' instead`,
    );
  }
});

test('every section has a landing page', () => {
  for (const entry of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'project') continue;
    assert.ok(
      fs.existsSync(path.join(DOCS, entry.name, 'index.md')),
      `documentation/${entry.name} has no index.md, so clicking the section does nothing`,
    );
  }
});
