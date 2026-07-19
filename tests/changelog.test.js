/**
 * The release edits CHANGELOG.md unattended, with npm already holding the
 * tarball. These tests are what stands between that and a mangled file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cut, notesFor, parseChangelog, hasEntries, repositoryUrl } from '../scripts/release-changelog.js';
import { tagFor } from '../scripts/publish-tag.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'https://github.com/Wolfi-OwO/lattice';

/** The text under one `## [heading]`, up to the next one. */
function sectionOf(text, heading) {
  const start = text.indexOf(`## [${heading}]`);
  assert.notEqual(start, -1, `no section "## [${heading}]" in the file`);
  const next = text.indexOf('\n## [', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const CHANGELOG = `# Changelog

Some standing preamble that must survive every release.

## [Unreleased]

### Added

- A thing.

### Fixed

- Another thing.

[Unreleased]: ${REPOSITORY}/commits/main
`;

test('a release moves [Unreleased] under the version, dated, and leaves [Unreleased] empty', () => {
  const { text, notes } = cut(CHANGELOG, { version: '1.0.0', date: '2026-07-14', repository: REPOSITORY });

  assert.match(text, /## \[1\.0\.0\] - 2026-07-14/);
  assert.match(text, /## \[Unreleased\]\n\n## \[1\.0\.0\]/, 'the next change needs an empty [Unreleased] to land in');

  // The entries moved — they are under the version now, and not above it.
  assert.match(sectionOf(text, '1.0.0'), /- A thing\./);
  assert.match(sectionOf(text, '1.0.0'), /- Another thing\./);
  assert.doesNotMatch(sectionOf(text, 'Unreleased'), /- A thing\./);

  assert.match(text, /Some standing preamble/, 'the preamble is not a release note and must not be eaten');
  assert.equal(notes.includes('- A thing.'), true, 'stdout carries the notes for the GitHub Release body');
});

test('the first release links to its tag; the next one links to a compare range', () => {
  const first = cut(CHANGELOG, { version: '1.0.0', date: '2026-07-14', repository: REPOSITORY }).text;

  assert.match(first, new RegExp(`\\[1\\.0\\.0\\]: ${REPOSITORY}/releases/tag/v1\\.0\\.0`));
  assert.match(first, new RegExp(`\\[Unreleased\\]: ${REPOSITORY}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));

  // Now someone adds a change on top of the released file, and cuts 1.1.0.
  const withNewWork = first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n\n- Something newer.\n');
  const second = cut(withNewWork, { version: '1.1.0', date: '2026-08-01', repository: REPOSITORY }).text;

  assert.match(second, new RegExp(`\\[1\\.1\\.0\\]: ${REPOSITORY}/compare/v1\\.0\\.0\\.\\.\\.v1\\.1\\.0`));
  assert.match(second, new RegExp(`\\[1\\.0\\.0\\]: ${REPOSITORY}/releases/tag/v1\\.0\\.0`), 'old links are carried, not dropped');

  // Both releases are in the file, newest first, and 1.0.0 kept its own notes.
  assert.ok(second.indexOf('## [1.1.0]') < second.indexOf('## [1.0.0]'), 'newest release first');
  assert.match(sectionOf(second, '1.1.0'), /- Something newer\./);
  assert.match(sectionOf(second, '1.0.0'), /- A thing\./, '1.0.0 keeps its own notes');
});

test('a release with nothing under [Unreleased] is refused', () => {
  // This is the whole reason --check runs *before* npm publish. If it ran after,
  // the tarball would be on a registry that never forgets, and the file recording
  // what was in it would be the thing that failed.
  const released = cut(CHANGELOG, { version: '1.0.0', date: '2026-07-14', repository: REPOSITORY }).text;

  assert.throws(
    () => cut(released, { version: '1.0.1', date: '2026-07-15', repository: REPOSITORY }),
    /no entries under \[Unreleased\]/,
    'releasing twice with no new notes must fail, not produce an empty section',
  );
});

test('a heading with no bullets under it is not a release note', () => {
  // "### Added" and nothing beneath it is someone who started and stopped.
  assert.equal(hasEntries(['### Added', '']), false);
  assert.equal(hasEntries(['### Added', '', '- A real one.']), true);
});

test('the repository URL is browsable, not the git+…​.git form npm stores', () => {
  assert.equal(
    repositoryUrl({ repository: { url: 'git+https://github.com/Wolfi-OwO/lattice.git' } }),
    REPOSITORY,
  );
});

test('the real CHANGELOG.md parses and has an [Unreleased] heading to write into', () => {
  // Not "has entries" — right after a release it is legitimately empty. The
  // invariant that always holds is that the heading is there for the next change.
  const text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.doesNotThrow(() => parseChangelog(text));
});

test('notesFor reads back a section that has already been cut', () => {
  // The prepare-then-release split means the notes are written in a reviewed pull
  // request and read at publish time, rather than both happening in one unattended
  // step. This is the read half, and it is what fills the Release page.
  const cutResult = cut(CHANGELOG, { version: '2.1.0', date: '2026-07-18', repository: REPOSITORY });

  assert.equal(notesFor(cutResult.text, '2.1.0'), cutResult.notes);
});

test('notesFor refuses a version the changelog has no section for', () => {
  // This is the signal that the release pull request was never merged — the exact
  // mistake the two-step flow makes possible, so it must fail loudly rather than
  // publish with an empty Release body.
  assert.throws(
    () => notesFor(CHANGELOG, '9.9.9'),
    /has no "## \[9\.9\.9\]" section/,
    'a missing section names the merge that did not happen',
  );
});

test('a version below the registry\'s latest is published under an explicit tag', () => {
  // npm refuses to apply `latest` implicitly to a version lower than one already
  // published, which is exactly where this package sits: 0.0.1 restarting beneath
  // an orphaned 1.0.0 that only npm support can remove. Getting this wrong means
  // either a refused publish, or `latest` left pointing at pre-restart code — and
  // the second is worse, because it is silent.
  assert.equal(tagFor('0.0.1', '1.0.0'), 'previous');
  assert.equal(tagFor('1.2.3', '1.10.0'), 'previous', 'compared numerically, not as strings');

  // Every ordinary case stays a plain publish.
  assert.equal(tagFor('1.0.1', '1.0.0'), 'latest');
  assert.equal(tagFor('2.0.0', '1.9.9'), 'latest');
  assert.equal(tagFor('1.0.0', '1.0.0'), 'latest');

  // And this all becomes a no-op once 1.0.0 is gone from the registry.
  assert.equal(tagFor('0.0.1', null), 'latest', 'nothing higher exists — publish normally');
});

test('the release workflow uses the tag the script chooses, and moves latest', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'release.yml'),
    'utf8',
  );
  assert.match(workflow, /publish-tag\.js --version/, 'the tag must be derived, not hardcoded');
  assert.match(workflow, /npm dist-tag add/, 'latest must be moved when a fallback tag was used');
  assert.match(
    workflow,
    /npm publish --provenance --access public --tag/,
    'provenance must survive the change',
  );
});
