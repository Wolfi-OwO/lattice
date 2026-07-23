/**
 * Copies a template tree into a target directory, substituting variables in
 * both file contents and path segments.
 *
 * Conventions inside templates/:
 *   _gitignore, _npmrc, _env.example   -> renamed to .gitignore, .npmrc, .env.example
 *                                         (npm strips a real .gitignore from packages)
 *   __PACKAGE_PATH__                   -> path segment replaced by at/htlvillach/foo
 *   {{projectName}} etc.               -> replaced in file contents
 */

import fs from 'node:fs';
import path from 'node:path';

import { STORAGE } from './storage.js';

/**
 * Files renamed on the way out.
 *
 * `package.json` and dotfiles are prefixed with `_` inside templates/ because
 * npm rewrites a packaged `.gitignore` to `.npmignore`, and a nested real
 * `package.json` would make the template look like a workspace to the tooling.
 */
const RENAME = new Map([
  ['_package.json', 'package.json'],
  ['_gitignore', '.gitignore'],
  ['_npmrc', '.npmrc'],
  ['_env.example', '.env.example'],
  ['_editorconfig', '.editorconfig'],
  ['_dockerignore', '.dockerignore'],
]);

/** Extensions we never token-substitute (binary or would corrupt). */
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.jar', '.woff', '.woff2']);

/**
 * Directories a template must never carry into a generated project: build
 * output and dependency caches. The published npm package already excludes these
 * via the `files` allowlist in package.json, so this does not matter to an
 * installed user — but it matters when scaffolding from a git clone, where a
 * `./mvnw test` run inside a template dir leaves a `target/` behind. Copying that
 * out produced a project whose target/classes held a stray FillDemoData.class at
 * the wrong package path, and spring-boot:repackage then died building the jar
 * manifest. The same set is what verify.js walks past for the same reason.
 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'target',
  'build',
  'dist',
  '.gradle',
  '__pycache__',
  '.venv',
]);

export function render(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
}

function renderPathSegment(segment, vars) {
  let out = RENAME.get(segment) ?? segment;
  out = out.replace(/__(\w+)__/g, (match, key) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
  // A path variable may expand to a nested path (at/htlvillach/foo) — that is
  // intentional and handled by mkdir -p semantics below.
  return out;
}

/**
 * @param {string} from  absolute path of the template dir
 * @param {string} to    absolute path of the destination dir
 * @param {object} vars  substitution map
 * @returns {string[]}   list of files written, relative to `to`
 */
export function copyTemplate(from, to, vars) {
  const written = [];

  const walk = (srcDir, destDir) => {
    fs.mkdirSync(destDir, { recursive: true });

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

      const srcPath = path.join(srcDir, entry.name);
      const name = renderPathSegment(entry.name, vars);
      const destPath = path.join(destDir, name);

      if (entry.isDirectory()) {
        walk(srcPath, destPath);
        continue;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      if (BINARY.has(path.extname(entry.name).toLowerCase())) {
        fs.copyFileSync(srcPath, destPath);
      } else {
        const content = fs.readFileSync(srcPath, 'utf8');
        fs.writeFileSync(destPath, render(content, vars), 'utf8');
      }

      // Carry the source file's permissions over. writeFileSync creates 0644, so
      // without this an executable in a template arrives unexecutable — and the
      // first thing the user types is `./mvnw`, which then fails with Permission
      // denied. copyFileSync happens to preserve mode; the render path does not,
      // so the two disagreed depending on whether a file was binary.
      fs.chmodSync(destPath, fs.statSync(srcPath).mode);

      written.push(path.relative(to, destPath));
    }
  };

  walk(from, to);
  return written;
}

/** True if the directory does not exist, or exists and is empty. */
export function isEmptyDir(dir) {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir);
  return entries.length === 0 || (entries.length === 1 && entries[0] === '.git');
}

/** Derive substitution variables from the collected answers. */
export function buildVars(answers) {
  const {
    projectName,
    javaPackage = '',
    port = '3000',
    storage = 'memory',
    fileFormat = 'json',
    databasePort = null,
  } = answers;

  const spec = STORAGE[storage] ?? STORAGE.memory;

  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // my-cool-app -> MyCoolApp
  const pascalName = safeName
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

  // my-cool-app -> my_cool_app. Dart, Rust and Python all reject a dash in an
  // identifier: a Flutter package name, a Cargo crate's lib target and a Python
  // module are all snake_case or nothing.
  const snakeName = safeName.replace(/-/g, '_');

  return {
    projectName: safeName,
    projectTitle: projectName,
    pascalName,
    snakeName,
    // Enterprise overlay. `owner` fills the badge/URL slots in the community-health
    // files; it defaults to a placeholder the user replaces rather than to any real
    // account, because lattice ships to everyone. `version` seeds version.txt.
    owner: answers.owner ?? 'your-org',
    version: answers.version ?? '0.1.0',
    // Java/Kotlin only
    javaPackage,
    PACKAGE_PATH: javaPackage.replace(/\./g, '/'),
    mainClass: `${pascalName}Application`,
    port: String(port),
    clientPort: String(Number(port) + 2000),
    year: String(new Date().getFullYear()),

    // Storage. `databaseNeedsUrl` is interpolated into config/index.js as a literal
    // `true`/`false`, so the file and memory adapters never demand a DATABASE_URL.
    storage,
    databaseAdapter: spec.adapter,
    databaseLabel: spec.label,
    databaseNeedsUrl: String(Boolean(spec.needsUrl)),
    databasePort: databasePort ?? spec.defaultPort ?? '',
    fileFormat,
  };
}
