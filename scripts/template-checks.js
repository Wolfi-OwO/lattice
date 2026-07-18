#!/usr/bin/env node
/**
 * The checks CI should run against a scaffolded project, derived from what the
 * template actually declares.
 *
 * The gap this closes: templates-javascript.yml ran exactly one command per
 * template — `npm run build`, or `npm test`. Every JavaScript template declares a
 * `lint` script and not one of them had ever been linted in CI. `typecheck` and
 * `format` likewise. The first time anything ran `prettier --check` against a
 * scaffolded project, 23 files across five templates were unformatted, and the
 * TypeScript template shipped a deprecated `baseUrl` that its own typechecker
 * would have flagged. Nothing was broken; nothing was verified either.
 *
 * Listing the checks here rather than in the workflow is what stops that
 * recurring. A script added to a template is picked up automatically, and one that
 * cannot run in CI has to say why — `tests/registry.test.js` fails on a script
 * that is neither checked nor listed below.
 *
 *   --stack <id>   the shell commands to run, one per line
 *   --list         every template that has checks, for a CI matrix
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATES } from '../src/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scripts that are deliberately not run in CI, and the reason each one is not.
 *
 * A reason is required. "It is inconvenient" is not one of these — every entry
 * here is a script that *cannot* be a pass/fail check, not one nobody got round
 * to. Anything not listed is expected to run and must exit zero.
 */
export const NOT_CHECKED = {
  dev: 'never terminates — it is a watching dev server',
  start: 'never terminates — it is the production server',
  preview: 'never terminates — it serves the built output',
  format: 'rewrites files; the check variant runs instead',
  'database:seed': 'needs a live database — covered by the Storages workflow',
  'test:coverage': 'the same suite as `test`, measured; running both doubles CI for one signal',
};

/** Read a template's package.json, which is staged as `_package.json`. */
function scriptsOf(template) {
  const file = path.join(ROOT, 'stacks', template.dir, '_package.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).scripts ?? {};
}

/** Does this template ship a Prettier configuration? */
function hasPrettier(template) {
  return fs.existsSync(path.join(ROOT, 'stacks', template.dir, '.prettierrc'));
}

/**
 * The commands to run against the scaffolded project, in order: cheap and
 * specific first, so a failure names itself rather than arriving as a build error
 * forty seconds in.
 */
export function checksFor(template) {
  const scripts = scriptsOf(template);
  if (!scripts) return [];

  const ORDER = ['lint', 'typecheck', 'build', 'test'];
  const runnable = Object.keys(scripts).filter((name) => !(name in NOT_CHECKED));
  runnable.sort((a, b) => {
    const rank = (n) => (ORDER.indexOf(n) === -1 ? ORDER.length : ORDER.indexOf(n));
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const checks = runnable.map((name) => `npm run ${name}`.replace('run test', 'test'));

  // Formatting is checked, never applied — `format` itself rewrites files, which
  // in CI would silently "pass" by fixing the very drift it should be reporting.
  if (hasPrettier(template)) checks.push('npx prettier --check .');

  return checks;
}

/** Templates that have a package.json, and therefore checks. */
export function checkableTemplates() {
  return TEMPLATES.filter((t) => scriptsOf(t) !== null);
}

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? null : argv[at + 1];
};

// Only when run as a command; the test imports the functions above.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (argv.includes('--list')) {
    console.log(checkableTemplates().map((t) => t.framework).join('\n'));
  } else {
    const stack = valueOf('--stack');
    const template = TEMPLATES.find((t) => t.framework === stack);
    if (!template) {
      console.error(`usage: template-checks.js --stack <id> | --list`);
      process.exit(2);
    }
    console.log(checksFor(template).join('\n'));
  }
}
