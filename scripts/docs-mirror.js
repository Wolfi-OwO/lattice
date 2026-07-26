#!/usr/bin/env node
/**
 * Mirrors the long-form markdown that lives at the repository root into the
 * documentation site, just before MkDocs builds it.
 *
 * Those files are not moved, and this is the whole point. ARCHITECTURE.md,
 * CONVENTIONS.md and the ADRs are read far more often on GitHub — in a pull
 * request, in a diff, in an editor — than they ever will be on a docs site, and
 * a file that has to be read through a website is a file that stops being read.
 * They stay where they are. The site borrows them.
 *
 * Which means the copies under documentation/project/ are build output. They are
 * gitignored, they are rewritten from scratch on every run, and editing one is a
 * change that survives exactly until the next build. Every mirrored page says so
 * at the top and links to the real file, and its "edit" pencil points at the
 * source rather than at the copy — otherwise the site would quietly invite people
 * to edit a file that is regenerated.
 *
 * Two things get rewritten on the way in:
 *
 *   - Links between mirrored files. ARCHITECTURE.md links to CONVENTIONS.md and
 *     to docs/adr/0001-*.md as repository-root-relative paths, which is correct
 *     on GitHub and wrong anywhere else. Each link is resolved against the source
 *     file, looked up in the mirror table, and re-expressed relative to where the
 *     copy landed. A link to something not mirrored (LICENSE, a URL) is untouched.
 *
 *   - Front matter, carrying the page title and the edit URL.
 *
 * Run by `npm run docs:build` and `npm run docs:serve`, and by the Documentation
 * workflow. Zero dependencies, like everything else under src/ and scripts/.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCS = path.join(ROOT, 'documentation');

/** Where mirrored copies land, relative to documentation/. Gitignored. */
const INTO = 'project';

const REPO = 'https://github.com/Wolfi-OwO/lattice';

/**
 * The root files worth reading on the site, in the order they should appear.
 *
 * README.md is deliberately absent: the site's own home page is written for
 * someone who arrived at a website, and the README is written for someone who
 * arrived at a repository. Mirroring one over the other would give the site two
 * front doors that drift apart.
 */
export const ROOT_DOCS = [
  { from: 'ARCHITECTURE.md', to: 'architecture.md', title: 'Architecture' },
  { from: 'CONVENTIONS.md', to: 'conventions.md', title: 'Conventions' },
  { from: 'STRUCTURE.md', to: 'structure.md', title: 'Why the templates are shaped this way' },
  { from: 'CONTRIBUTING.md', to: 'contributing.md', title: 'Contributing' },
  { from: 'SECURITY.md', to: 'security.md', title: 'Security policy' },
  { from: 'CHANGELOG.md', to: 'changelog.md', title: 'Changelog' },
];

/**
 * The ADRs are discovered rather than listed, so adding one is adding a file.
 * A decision record that had to be registered in a script somewhere else is a
 * decision record that eventually is not.
 */
function architectureDecisions() {
  const dir = path.join(ROOT, 'docs', 'adr');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const from = `docs/adr/${name}`;

      /*
       * The index has to be called index.md for MkDocs to treat it as the
       * section's landing page rather than a page called "README" inside it.
       */
      if (name === 'README.md') {
        return { from, to: 'adr/index.md', title: 'Architecture decisions' };
      }

      /*
       * "0001-zero-dependency-core.md" -> "ADR-0001 — Zero dependency core".
       * Read off the filename rather than the heading: an ADR's H1 already
       * carries its number, so taking the title from it would print the number
       * twice in the navigation.
       */
      const [, number, slug] = name.match(/^(\d+)-(.+)\.md$/) ?? [];
      if (!number) return { from, to: `adr/${name}`, title: name.replace(/\.md$/, '') };

      const words = slug.replace(/-/g, ' ');
      return {
        from,
        to: `adr/${name}`,
        title: `ADR-${number} — ${words[0].toUpperCase()}${words.slice(1)}`,
      };
    });
}

/** Every file to mirror: `from` repo-relative, `to` relative to documentation/project/. */
export function mirrorTable() {
  const adrs = architectureDecisions();
  // The index first, then the records themselves in numeric order.
  adrs.sort((a, b) => (a.to.endsWith('index.md') ? -1 : b.to.endsWith('index.md') ? 1 : 0));
  return [...ROOT_DOCS, ...adrs].filter((entry) => fs.existsSync(path.join(ROOT, entry.from)));
}

/**
 * Rewrite links that point at another mirrored file.
 *
 * Each link is resolved the way GitHub resolves it — against the directory of
 * the file it appears in — and then, if that lands on something mirrored,
 * re-expressed relative to where this file's copy went. Anything else is left
 * exactly as written, which covers external URLs, anchors, and links to files
 * that only make sense in the repository.
 */
function rewriteLinks(markdown, entry, byFrom) {
  const fromDir = path.posix.dirname(entry.from);
  /*
   * Relative to documentation/, matching the values in `byFrom` — not relative
   * to documentation/project/, or every rewritten link gains a `project/` that
   * resolves one level too deep.
   */
  const toDir = path.posix.dirname(`${INTO}/${entry.to}`);

  return markdown.replace(/\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g, (whole, target, anchor = '') => {
    if (/^(https?:|#|\/)/.test(target)) return whole;

    /*
     * path.posix keeps the separator a forward slash on Windows, where
     * path.join would otherwise write a backslash into a markdown link.
     */
    const resolved = path.posix.normalize(path.posix.join(fromDir, target));
    const destination = byFrom.get(resolved);
    if (!destination) return whole;

    let relative = path.posix.relative(toDir, destination);
    if (!relative.startsWith('.')) relative = `./${relative}`;
    return `](${relative}${anchor})`;
  });
}

/** YAML front matter plus the "this is a copy" banner. */
function header(entry) {
  const source = `${REPO}/blob/main/${entry.from}`;
  const edit = `${REPO}/edit/main/${entry.from}`;

  return [
    '---',
    /*
     * Quoted because several titles contain an em dash and a colon would end
     * the scalar early. Single quotes with doubling is the YAML-safe escape.
     */
    `title: '${entry.title.replace(/'/g, "''")}'`,
    `edit_url: ${edit}`,
    '---',
    '',
    '!!! info "Mirrored from the repository"',
    '',
    `    This page is [\`${entry.from}\`](${source}), rendered here. It is generated`,
    '    on every build, so edit the source rather than this copy — the pencil above',
    '    already points there.',
    '',
    /*
     * Blank line before the mirrored content, or the source's own H1 gets
     * swallowed into the admonition's indented block.
     */
    '',
  ].join('\n');
}

function main() {
  const table = mirrorTable();
  const byFrom = new Map(table.map((entry) => [entry.from, `${INTO}/${entry.to}`]));
  const outDir = path.join(DOCS, INTO);

  /*
   * Rebuilt from nothing each time: a file dropped from the table should leave
   * no orphan behind, and an orphan is indistinguishable from a real page once
   * the navigation is generated from the directory tree.
   */
  fs.rmSync(outDir, { recursive: true, force: true });

  for (const entry of table) {
    const markdown = fs.readFileSync(path.join(ROOT, entry.from), 'utf8');
    const destination = path.join(outDir, entry.to);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, header(entry) + rewriteLinks(markdown, entry, byFrom), 'utf8');
  }

  /*
   * Ordering for the generated section. Without this the navigation is
   * alphabetical, which would open the "About the project" section on the
   * changelog — the one page nobody arrives wanting to read first.
   */
  fs.writeFileSync(
    path.join(outDir, '.nav.yml'),
    ['title: About the project', 'nav:', ...ROOT_DOCS.map((d) => `  - ${d.to}`), '  - adr', ''].join(
      '\n',
    ),
    'utf8',
  );

  /*
   * And a title for the ADR sub-section, which would otherwise be named after
   * its directory and appear in the sidebar as "Adr".
   */
  const adrs = table.filter((entry) => entry.to.startsWith('adr/'));
  if (adrs.length) {
    fs.writeFileSync(
      path.join(outDir, 'adr', '.nav.yml'),
      [
        'title: Architecture decisions',
        'nav:',
        ...adrs.map((entry) => `  - ${path.posix.basename(entry.to)}`),
        '',
      ].join('\n'),
      'utf8',
    );
  }

  const adrCount = adrs.length;
  console.log(
    `mirrored ${table.length} files into documentation/${INTO}/ ` +
      `(${table.length - adrCount} root docs, ${adrCount} ADR pages)`,
  );
}

/*
 * Only when run as a script. tests/docs.test.js imports the table above to check
 * it against the workflow's path filter, and importing must not write files.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
