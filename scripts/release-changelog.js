#!/usr/bin/env node
/**
 * Cut the `[Unreleased]` section of CHANGELOG.md into a dated release section.
 *
 * This is a script and not four lines of `sed` in the release workflow because a
 * release edits the changelog exactly once, unattended, with npm already holding
 * the tarball — there is no second chance and nobody watching. A regex that
 * mangles the file in that window is a bad afternoon. So the surgery lives here,
 * where tests/changelog.test.js can run it against a real file and check what
 * came out.
 *
 *   --check                      is there anything to release? (exit 1 if not)
 *   --version X.Y.Z --date D     do the cut; print the notes to stdout
 *   --notes X.Y.Z                print the notes of an already-cut section
 *
 * The notes go to stdout so the workflow can pipe them straight into the GitHub
 * Release body — the release page and the changelog then say the same thing by
 * construction, rather than because someone pasted carefully.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEADING = /^##\s+\[([^\]]+)\]/;
const LINK_DEFINITION = /^\[([^\]]+)\]:\s*\S+/;
const ENTRY = /^\s*[-*+]\s+\S/;

/**
 * Keep a Changelog puts its link definitions in a block at the bottom. They are
 * the one part of the file that is regenerated rather than carried over, so they
 * are peeled off before anything else looks at the document.
 */
function splitTrailingLinks(lines) {
  let end = lines.length;

  while (end > 0) {
    const line = lines[end - 1];
    if (line.trim() === '' || LINK_DEFINITION.test(line)) {
      end--;
      continue;
    }
    break;
  }

  return {
    body: lines.slice(0, end),
    links: lines.slice(end).filter((line) => LINK_DEFINITION.test(line)),
  };
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

export function parseChangelog(text) {
  const { body, links } = splitTrailingLinks(text.split('\n'));

  const headings = [];
  body.forEach((line, index) => {
    const match = line.match(HEADING);
    if (match) headings.push({ index, name: match[1] });
  });

  const unreleasedAt = headings.findIndex((h) => h.name.toLowerCase() === 'unreleased');
  if (unreleasedAt === -1) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" heading — nothing to cut a release from.');
  }

  const unreleased = headings[unreleasedAt];
  const next = headings[unreleasedAt + 1];
  const sectionEnd = next ? next.index : body.length;

  return {
    body,
    links,
    // Everything before the heading: the title and the how-to-use paragraph.
    preamble: body.slice(0, unreleased.index),
    notes: trimBlankEdges(body.slice(unreleased.index + 1, sectionEnd)),
    // The version most recently released, or null on the very first release.
    previousVersion: next ? next.name : null,
    // Older release sections, carried over untouched.
    rest: body.slice(sectionEnd),
  };
}

/** A heading with no bullets under it is not a release note. */
export function hasEntries(notes) {
  return notes.some((line) => ENTRY.test(line));
}

/**
 * Read the notes for an already-released version back out of the changelog.
 *
 * The counterpart to `cut`. Under the prepare-then-release flow the changelog is
 * cut in a reviewed pull request, so by the time the release publishes the notes
 * are already sitting in the file — they need reading, not writing. The release
 * page is then filled from the same text that was reviewed, which is the property
 * `cut` used to provide by doing both in one step.
 */
export function notesFor(text, version) {
  const { body } = splitTrailingLinks(text.split('\n'));

  const headings = [];
  body.forEach((line, index) => {
    const match = line.match(HEADING);
    if (match) headings.push({ index, name: match[1] });
  });

  const at = headings.findIndex((h) => h.name === version);
  if (at === -1) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section.\n` +
        'The release PR that cuts it has to be merged before the Release is published.',
    );
  }

  const next = headings[at + 1];
  const notes = trimBlankEdges(body.slice(headings[at].index + 1, next ? next.index : body.length));

  if (!hasEntries(notes)) {
    throw new Error(`CHANGELOG.md's [${version}] section has no entries.`);
  }
  return notes.join('\n');
}

export function cut(text, { version, date, repository }) {
  const { preamble, notes, previousVersion, rest, links } = parseChangelog(text);

  if (!hasEntries(notes)) {
    throw new Error(
      'CHANGELOG.md has no entries under [Unreleased]. A release has to say what changed —\n' +
        'add them under "## [Unreleased]" and re-run the release.',
    );
  }

  const rebuilt = [
    ...preamble,
    '## [Unreleased]',
    '',
    `## [${version}] - ${date}`,
    '',
    ...notes,
    '',
    ...trimBlankEdges(rest),
  ];

  // The first release has nothing to compare against, so it points at the tag.
  const compare = previousVersion
    ? `${repository}/compare/v${previousVersion}...v${version}`
    : `${repository}/releases/tag/v${version}`;

  const carried = links.filter((line) => {
    const name = line.match(LINK_DEFINITION)[1].toLowerCase();
    return name !== 'unreleased' && name !== version.toLowerCase();
  });

  const rebuiltLinks = [
    `[Unreleased]: ${repository}/compare/v${version}...HEAD`,
    `[${version}]: ${compare}`,
    ...carried,
  ];

  return {
    text: `${[...trimBlankEdges(rebuilt), '', ...rebuiltLinks].join('\n')}\n`,
    notes: notes.join('\n'),
  };
}

/** `git+https://github.com/x/y.git` is not a URL you can browse to. */
export function repositoryUrl(packageJson) {
  const raw = packageJson.repository?.url ?? packageJson.repository ?? '';
  return raw.replace(/^git\+/, '').replace(/\.git$/, '');
}

function main(argv) {
  const changelogPath = path.join(ROOT, 'CHANGELOG.md');
  const text = fs.readFileSync(changelogPath, 'utf8');

  if (argv.includes('--check')) {
    const { notes } = parseChangelog(text);
    if (!hasEntries(notes)) {
      console.error(
        'CHANGELOG.md has no entries under [Unreleased].\n' +
          'A release has to say what changed. Add them under "## [Unreleased]", then release again.',
      );
      process.exit(1);
    }
    console.log('CHANGELOG.md has entries to release.');
    return;
  }

  const valueOf = (flag) => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : argv[at + 1];
  };

  // Read the notes for a version already cut into the file. stdout is the notes and
  // only the notes, so the release workflow can pipe it into the Release body.
  //
  // The failure is caught and printed rather than thrown: this runs unattended in
  // release.yml, where a stack trace in the log buries the one line that says what
  // to do about it. Every other path in this script exits the same way.
  if (argv.includes('--notes')) {
    try {
      console.log(notesFor(text, valueOf('--notes')));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }

  const version = valueOf('--version');
  const date = valueOf('--date');

  if (!version || !date) {
    console.error(
      'usage: release-changelog.js --version X.Y.Z --date YYYY-MM-DD  |  --check  |  --notes X.Y.Z',
    );
    process.exit(2);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const result = cut(text, { version, date, repository: repositoryUrl(packageJson) });

  fs.writeFileSync(changelogPath, result.text);
  // stdout is the release notes, and only the release notes — the workflow reads it.
  console.log(result.notes);
}

// Only run when invoked as a command; the tests import the functions above.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
