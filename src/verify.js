/**
 * The structural gate: does the generated project obey its ecosystem's layout?
 *
 * Checked after everything is written and before the transaction commits, so a
 * violation rolls the whole generation back rather than leaving a rejected tree on
 * disk for someone to clean up. That ordering is the reason this and
 * src/transaction.js were built in that order.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 * It is not a linter and it is not a style opinion. Every rule here describes a
 * placement that is *silently* wrong — where the file exists, looks fine in an
 * editor, and is simply never used:
 *
 *   - a .java outside src/main/java is not compiled by Maven. No error, no
 *     warning; the class just does not exist at runtime.
 *   - a test under src/main is compiled into the shipped artifact, taking its
 *     test-only dependencies with it.
 *
 * Those are the failures worth a hard stop, because the feedback the user would
 * otherwise get is a NoClassDefFoundError hours later, or a jar that is quietly
 * twice the size it should be. Anything that merely offends taste belongs in
 * `lattice doctor`, which scores rather than blocks, and that separation is
 * deliberate: a gate that fires on opinions is a gate people learn to bypass.
 *
 * Rules are keyed by the toolchain already detected for the enterprise overlay, so
 * there is one notion of "what kind of project is this" rather than two that can
 * disagree.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Files that legitimately sit at a project root despite carrying a source
 * extension. Every ecosystem has a handful; without this list the rule below
 * would reject vite.config.ts, which is where it is supposed to be.
 */
const ROOT_CONFIG = new RegExp(
  [
    '\\.config\\.(js|cjs|mjs|ts|mts)$', // vite.config.ts, eslint.config.js, …
    '^(vite|vitest|rollup|webpack|tailwind|postcss|jest|babel|next|nuxt|svelte|astro|playwright|cypress|drizzle|knexfile)\\.',
    '^(conftest|setup|manage|noxfile|fabfile)\\.py$',
    '^(gradlew|mvnw)',
  ].join('|'),
);

/** Source extensions per toolchain, and where that toolchain requires them. */
const RULES = {
  maven: {
    sources: ['.java'],
    /*
     * Maven resolves these by convention. Anything outside is not on the compiler's
     * source path, so it is not compiled and not packaged.
     */
    allowed: [/^src\/main\/java\//, /^src\/test\/java\//],
    /*
     * The demo-data loader is run standalone through a Spring profile, never
     * compiled into the application. CONVENTIONS.md rule 5 puts it here on purpose.
     */
    exempt: [/^database\//],
    why: 'Maven only compiles sources under src/main/java and src/test/java — a class outside them silently does not exist at runtime',
  },
  gradle: {
    sources: ['.kt', '.java'],
    allowed: [/^(app|core|data|domain|ui|shared)\/src\//, /^src\//],
    exempt: [/^database\//, /^buildSrc\//],
    why: 'Gradle compiles sources under a module\'s src/ — a file outside one is never built',
  },
  node: {
    sources: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    allowed: [/^src\//, /^tests?\//, /^bin\//, /^scripts\//, /^database\//, /^client\//, /^api\//, /^app\//],
    exempt: [],
    why: 'a source file loose at the project root is outside every entry point and bundler root',
  },
  python: {
    sources: ['.py'],
    allowed: [
      /^src\//,
      /^app\//,
      /^tests?\//,
      /^database\//,
      /^scripts\//,
      /^notebooks\//,
      /*
       * Migration tools own their own directory and load it themselves rather
       * than importing it as part of the package: alembic/env.py and
       * alembic/versions/* are exactly where Alembic requires them.
       */
      /^alembic\//,
      /^migrations\//,
    ],
    exempt: [],
    why: 'a module loose at the project root is outside the package and will not import as part of it',
  },
};

/** Everything the project ships, relative and slash-separated. */
function walk(target) {
  const out = [];
  const IGNORED = new Set(['node_modules', '.git', 'target', 'build', 'dist', '.gradle', '__pycache__', '.venv']);

  const recurse = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) recurse(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };

  recurse(target, '');
  return out;
}

/**
 * Check a generated project against its toolchain's layout.
 *
 * @returns {{ ok: boolean, violations: Array<{ file: string, why: string }> }}
 */
export function verifyStructure(target, toolchain) {
  const rules = RULES[toolchain];
  /*
   * An unrecognised toolchain has no rules to apply, and inventing some would be
   * guessing at a layout nobody declared. Silence is the honest answer.
   */
  if (!rules) return { ok: true, violations: [] };

  const violations = [];

  for (const file of walk(target)) {
    if (!rules.sources.includes(path.extname(file))) continue;

    const base = path.basename(file);
    const atRoot = !file.includes('/');
    if (atRoot && ROOT_CONFIG.test(base)) continue;
    if (rules.exempt.some((pattern) => pattern.test(file))) continue;
    if (rules.allowed.some((pattern) => pattern.test(file))) continue;

    violations.push({ file, why: rules.why });
  }

  /*
   * A test compiled into the shipped artifact carries its test-only dependencies
   * with it. Maven and Gradle both separate these by directory for that reason.
   */
  if (toolchain === 'maven' || toolchain === 'gradle') {
    for (const file of walk(target)) {
      if (/(^|\/)src\/main\//.test(`/${file}`) && /(Test|Tests|Spec)\.(java|kt)$/.test(file)) {
        violations.push({
          file,
          why: 'a test under src/main is packaged into the built artifact along with its test-only dependencies',
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** A report a person can act on: what is wrong, where, and why it matters. */
export function describeViolations(violations) {
  const lines = ['The generated project does not match its ecosystem\'s layout:', ''];

  for (const { file, why } of violations) {
    lines.push(`  ${file}`);
    lines.push(`    ${why}`);
  }

  lines.push('');
  lines.push('Nothing was written — the generation was rolled back.');
  return lines.join('\n');
}
