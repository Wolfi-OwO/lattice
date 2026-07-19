/**
 * The conventions, enforced by a test rather than by review.
 *
 * CONVENTIONS.md is a document, and a document is a promise nobody keeps. These
 * tests are the same rules expressed as assertions, so a template that drifts
 * from them fails CI instead of being noticed a year later — or never.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CATEGORIES, TEMPLATES, FULLSTACK_BACKENDS, FULLSTACK_FRONTENDS, findTemplate } from '../src/registry.js';
import { checksFor, checkableTemplates, NOT_CHECKED } from '../scripts/template-checks.js';
import { EXPECTED_BEHIND, EXPECTED_MISSING_FILES } from '../scripts/drift-expectations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STACKS = path.join(ROOT, 'stacks');

/**
 * Every file a template would actually ship: tracked files, plus new ones not
 * yet committed, minus anything gitignored.
 *
 * Deliberately not a plain directory walk. Building a template in place — or
 * merely opening it in an IDE whose file-watcher does it for you — drops
 * `target/` and `build/` next to the source. Those are gitignored, so they are
 * in neither the repository nor the npm tarball (with no .npmignore, npm packs
 * according to .gitignore), and a walk that saw them would fail the build-output
 * test for output that never ships. That failure would be noise, and noise is
 * how a suite stops being trusted.
 *
 * This is the same question npm asks, so the answer is the same: what ships?
 */
const shippedFiles = (() => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'stacks'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const byTemplate = new Map();

  for (const relative of listed.split('\0').filter(Boolean)) {
    byTemplate.set(path.dirname(relative), byTemplate.get(path.dirname(relative)) ?? []);
    byTemplate.get(path.dirname(relative)).push(path.join(ROOT, relative));
  }

  return (template) => {
    const prefix = path.posix.join('stacks', template.dir);
    return [...byTemplate.entries()]
      .filter(([dir]) => dir === prefix || dir.startsWith(`${prefix}/`))
      .flatMap(([, files]) => files);
  };
})();

const templateFiles = (template) => shippedFiles(template);

// ---------------------------------------------------------------- the catalogue

test('every template in the registry exists on disk', () => {
  for (const template of TEMPLATES) {
    const dir = path.join(STACKS, template.dir);
    assert.ok(fs.existsSync(dir), `${template.framework}: ${template.dir} is registered but not on disk`);
    assert.ok(templateFiles(template).length > 0, `${template.framework}: ships no files`);
  }
});

test('every template directory on disk is in the registry', () => {
  // A template nobody can select is dead code that still has to be maintained,
  // and it is the failure mode of a catalogue kept by hand: the folder lands,
  // the registry entry does not, and the work is invisible.
  const registered = new Set(TEMPLATES.map((t) => t.dir));

  for (const category of fs.readdirSync(STACKS)) {
    for (const language of fs.readdirSync(path.join(STACKS, category))) {
      for (const framework of fs.readdirSync(path.join(STACKS, category, language))) {
        const dir = `${category}/${language}/${framework}`;
        assert.ok(registered.has(dir), `stacks/${dir} is on disk but not registered in src/registry.js`);
      }
    }
  }
});

test('every template belongs to a declared category, and its directory matches its ids', () => {
  const categories = new Set(CATEGORIES.map((c) => c.id));

  for (const template of TEMPLATES) {
    assert.ok(categories.has(template.category), `${template.framework}: unknown category`);
    assert.equal(
      template.dir,
      `${template.category}/${template.language}/${template.framework}`,
      `${template.framework}: dir must mirror category/language/framework`,
    );
  }
});

test('framework ids are unique', () => {
  const seen = new Set();
  for (const template of TEMPLATES) {
    assert.ok(!seen.has(template.framework), `duplicate framework id: ${template.framework}`);
    seen.add(template.framework);
  }
});

test('every template says how to run it, and how to install it', () => {
  for (const template of TEMPLATES) {
    assert.ok(template.post?.length > 0, `${template.framework}: no post steps — the user lands with no next step`);
    assert.ok(template.hint, `${template.framework}: no hint`);
    assert.ok(template.frameworkLabel, `${template.framework}: no label`);
  }
});

test('the fullstack halves are real templates', () => {
  for (const id of [...FULLSTACK_BACKENDS, ...FULLSTACK_FRONTENDS]) {
    assert.ok(findTemplate(id), `fullstack references "${id}", which is not a template`);
  }
  for (const id of FULLSTACK_BACKENDS) {
    assert.equal(findTemplate(id).category, 'backend', `${id} is offered as a fullstack backend but is not one`);
  }
  for (const id of FULLSTACK_FRONTENDS) {
    assert.equal(findTemplate(id).category, 'frontend', `${id} is offered as a fullstack client but is not one`);
  }
});

// ------------------------------------------------------------ the conventions

test('every template ships a README', () => {
  for (const template of TEMPLATES) {
    const readme = path.join(STACKS, template.dir, 'README.md');
    assert.ok(fs.existsSync(readme), `${template.framework}: no README.md`);
  }
});

test('no template ships a real dotfile, a lockfile, a wrapper or build output', () => {
  // npm rewrites a packaged `.gitignore` to `.npmignore`, so a template's
  // gitignore has to travel as `_gitignore` and be renamed on the way out. The
  // rest are things that must be generated, not committed: a lockfile pins a
  // template to versions that rot, and a wrapper is a binary.
  const FORBIDDEN = [
    '.gitignore',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Cargo.lock',
    'gradlew',
    'gradlew.bat',
    'mvnw',
    'mvnw.cmd',
  ];
  const FORBIDDEN_DIRS = ['node_modules', 'target', 'build', 'dist', '.gradle', 'bin', 'obj', '.venv'];

  for (const template of TEMPLATES) {
    for (const file of templateFiles(template)) {
      const relative = path.relative(path.join(STACKS, template.dir), file);
      const base = path.basename(file);

      assert.ok(
        !FORBIDDEN.includes(base),
        `${template.framework}: ships ${relative} — it must not be committed`,
      );

      const segments = relative.split(path.sep);
      // `bin/` is legitimate in a CLI template (bin/cli.js) but is .NET build
      // output elsewhere, so it only counts as output when it holds no source.
      for (const bad of FORBIDDEN_DIRS) {
        if (bad === 'bin' && template.category === 'cli') continue;
        assert.ok(
          !segments.includes(bad),
          `${template.framework}: ships ${relative} — ${bad}/ is generated, not committed`,
        );
      }
    }
  }
});

test('the storage layer is spelled "database" everywhere — never "db"', () => {
  // CONVENTIONS.md rule 1. The single most common way a codebase drifts is that
  // one person writes `db` and everyone after them copies it, so this is checked
  // mechanically rather than left to a reviewer's patience.
  //
  // Exempt: environment variables (DATABASE_URL is conventional), and any
  // third-party API whose own vocabulary uses the short form.
  const OFFENDER = /(^|[^A-Za-z0-9_./-])db([^A-Za-z0-9_-]|$)/;

  const failures = [];

  for (const template of TEMPLATES) {
    for (const file of templateFiles(template)) {
      if (/\.(png|jpg|jpeg|gif|ico|jar|woff2?|ipynb)$/i.test(file)) continue;

      const relative = path.relative(STACKS, file);

      if (OFFENDER.test(path.basename(file))) {
        failures.push(`${relative} — file or directory named "db"`);
      }

      const text = fs.readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        // Spring registers its DataSource health contributor under the fixed id
        // `db`, and the Actuator readiness group has to name it to include it. That
        // is framework vocabulary, exactly like `req`/`res` in an Express signature
        // — the same exemption rule 1 already carves out. Scoped to the health-group
        // `include:` line so it cannot cover a stray `db` anywhere else.
        if (/^\s*include:\s*readinessState,\s*db\s*$/.test(line)) return;

        // A URL like mongodb://… and an env var like DATABASE_URL are fine.
        const stripped = line.replace(/\w+:\/\/\S+/g, '').replace(/[A-Z][A-Z0-9_]+/g, '');
        if (OFFENDER.test(stripped)) {
          failures.push(`${relative}:${index + 1} — ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(failures, [], `"db" must be spelled "database":\n  ${failures.join('\n  ')}`);
});

test('the scaffolder itself obeys rule 1 — it is not exempt from its own conventions', () => {
  // The test above walks stacks/ only, and that gap is not hypothetical: the
  // storage rename landed in the templates and never reached the code that
  // generates them. What shipped was a CLI that printed `docker compose up -d db`
  // (the service is named `database` — the command errors out) and pointed at
  // `src/db/`, a directory that no longer exists. Both were user-facing, and both
  // sailed through a green suite, because the only thing checking rule 1 declined
  // to look here.
  //
  // Matches a path segment (`src/db/`) and a file extension (`.db`) too, which the
  // stacks/ regex deliberately does not — those are exactly the forms that rotted.
  const OFFENDER = /(^|[^A-Za-z0-9_-])db([^A-Za-z0-9_-]|$)/;

  // Vocabulary that is not ours to rename.
  const THIRD_PARTY = [
    /\/data\/db/, //          MongoDB's data directory inside its own image
    /db\.adminCommand/, //    mongosh's API, called in the compose healthcheck
    /\.db`/, //               SQLite's conventional file extension
  ];
  // `--db` is a documented alias for `--database`, kept so older invocations keep
  // working. It is public CLI surface: removing it would break callers, so it is
  // allowed to say the short word — and only in the places that define it.
  const CLI_ALIAS = /--db\b|'db'|'no-db-start'|flags\.db\b|no-database-start/;

  const failures = [];

  for (const directory of ['src', 'bin']) {
    for (const file of fs.readdirSync(path.join(ROOT, directory))) {
      const relative = path.join(directory, file);
      const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      text.split('\n').forEach((line, index) => {
        if (THIRD_PARTY.some((allowed) => allowed.test(line))) return;
        if (CLI_ALIAS.test(line)) return;

        // A URL like mongodb://… and an env var like DATABASE_URL are fine.
        const stripped = line.replace(/\w+:\/\/\S+/g, '').replace(/[A-Z][A-Z0-9_]+/g, '');
        if (OFFENDER.test(stripped)) {
          failures.push(`${relative}:${index + 1} — ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(failures, [], `"db" must be spelled "database":\n  ${failures.join('\n  ')}`);
});

test('every backend agrees on the user shape, so the backends are interchangeable', () => {
  // CONVENTIONS.md rule 3. The rule exists so that every frontend can talk to
  // every backend — which means it is worth nothing unless ALL of them keep it.
  //
  // This test is here because they did not. Express and Fastify returned
  // `updatedAt`; Spring Boot and FastAPI silently did not, and nothing noticed,
  // because the only thing asserting rule 3 was a sentence in a document. Each
  // backend's own suite passed, since each one only ever checked itself against
  // itself. Drift between templates is invisible to a per-template test, so it
  // has to be checked here, across all of them at once.
  //
  // Deliberately a text search rather than a booted server: these are four
  // languages, and the cost of standing all four up in a unit suite would be
  // paid on every run forever. It cannot prove the field is populated correctly —
  // the generated projects' own suites do that — but it does catch the failure
  // that actually happened, which is a field being absent from a template
  // entirely.
  const SHAPE = ['id', 'email', 'name', 'role', ['createdAt', 'created_at'], ['updatedAt', 'updated_at']];

  const missing = [];

  for (const template of TEMPLATES.filter((t) => t.category === 'backend')) {
    const source = templateFiles(template)
      .filter((file) => /\.(js|ts|py|java|kt|cs|rs)$/.test(file))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    for (const field of SHAPE) {
      const spellings = Array.isArray(field) ? field : [field];
      if (!spellings.some((spelling) => new RegExp(`\\b${spelling}\\b`).test(source))) {
        missing.push(`${template.framework}: the user has no ${spellings.join(' / ')}`);
      }
    }
  }

  assert.deepEqual(missing, [], `rule 3 — every backend returns the same user:\n  ${missing.join('\n  ')}`);
});

test('every backend ships demo data, split by domain, with a loader', () => {
  // CONVENTIONS.md rule 5.
  for (const template of TEMPLATES.filter((t) => t.category === 'backend')) {
    const databaseDir = path.join(STACKS, template.dir, 'database');
    assert.ok(fs.existsSync(databaseDir), `${template.framework}: no database/ directory`);

    const loader = fs
      .readdirSync(databaseDir)
      .find((file) => file.startsWith('fill-demo-data') || file.startsWith('FillDemoData') || file.startsWith('fill_demo_data'));
    assert.ok(loader, `${template.framework}: no database/fill-demo-data.* loader`);

    const dataDir = path.join(databaseDir, 'data');
    assert.ok(fs.existsSync(dataDir), `${template.framework}: no database/data/ directory`);

    const domains = fs.readdirSync(dataDir).filter((file) => file.endsWith('.json'));
    assert.ok(domains.includes('users.json'), `${template.framework}: database/data/users.json is missing`);

    for (const domain of domains) {
      const rows = JSON.parse(fs.readFileSync(path.join(dataDir, domain), 'utf8'));
      assert.ok(Array.isArray(rows) && rows.length > 0, `${template.framework}: ${domain} must be a non-empty array`);
    }

    assert.ok(
      fs.existsSync(path.join(databaseDir, 'README.md')),
      `${template.framework}: database/README.md must explain how to add a domain`,
    );
  }
});

test('every frontend obeys the four dependency rules', () => {
  // CONVENTIONS.md rule 6. These four lines are what stop the component graph
  // from becoming a cycle, and they are invisible to a type checker — nothing
  // but a test like this one will catch the day someone imports a layout from a
  // page "just this once".
  const violations = [];

  for (const template of TEMPLATES.filter((t) => t.category === 'frontend')) {
    for (const file of templateFiles(template)) {
      if (!/\.(js|jsx|ts|tsx|vue|svelte)$/.test(file)) continue;

      const relative = path.relative(path.join(STACKS, template.dir), file);
      const text = fs.readFileSync(file, 'utf8');
      const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

      const inside = (segment) => relative.split(path.sep).includes(segment);
      const importsFrom = (segment) =>
        imports.some((specifier) => new RegExp(`(^|/)${segment}(/|$)`).test(specifier));

      if (inside('layouts') && importsFrom('pages')) {
        violations.push(`${template.framework}: ${relative} — a layout may not import a page`);
      }
      if (inside('pages') && importsFrom('layouts')) {
        violations.push(`${template.framework}: ${relative} — a page may not import a layout`);
      }
      if (inside('core') && importsFrom('pages')) {
        violations.push(`${template.framework}: ${relative} — components/core may not import a page`);
      }
    }
  }

  assert.deepEqual(violations, [], `dependency rules broken:\n  ${violations.join('\n  ')}`);
});

test('every script a template declares is either checked in CI or says why not', () => {
  // The gap this closes: every JavaScript template declared a `lint` script and
  // none of them had ever been linted in CI, because the workflow ran one
  // hardcoded command per template. A script nobody runs is a script that breaks
  // quietly. Adding one to a template now either gets checked or fails here.
  for (const template of checkableTemplates()) {
    const file = path.join(STACKS, template.dir, '_package.json');
    const scripts = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).scripts ?? {});
    const checks = checksFor(template).join('\n');

    for (const name of scripts) {
      if (name in NOT_CHECKED) {
        assert.ok(
          NOT_CHECKED[name].length > 10,
          `${template.framework}: "${name}" is exempt but the reason is not a reason`,
        );
        continue;
      }
      assert.match(
        checks,
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
        `${template.framework}: the "${name}" script is never run in CI, and is not listed as exempt`,
      );
    }
  }
});

test('the template workflow runs the derived checks, not its own hardcoded ones', () => {
  // templates-javascript.yml used to carry a `check:` per template. That is the
  // shape that let `lint` go unrun for every template at once: the workflow chose
  // one command and nothing compared it against what the template declared.
  const workflow = fs.readFileSync(
    path.join(STACKS, '..', '.github', 'workflows', 'templates-javascript.yml'),
    'utf8',
  );
  assert.match(workflow, /template-checks\.js/, 'the workflow must derive its checks');
  assert.ok(
    !/^\s+check:/m.test(workflow),
    'no hardcoded per-template `check:` — that is what this replaced',
  );
});

test('every template, and the fullstack composition, is exercised by some workflow', () => {
  // Coverage asserted as a rule rather than remembered. The fullstack path — the
  // shape the README leads with, and the only one that writes two projects and
  // installs both — had no CI at all and worked by luck. android-compose is the one
  // deliberate exception and has to say so in the workflow that skips it.
  const dir = path.join(ROOT, '.github', 'workflows');
  const workflows = fs
    .readdirSync(dir)
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');

  for (const template of TEMPLATES) {
    if (template.framework === 'android-compose') {
      // Needs the Android SDK and a Gradle wrapper, and wrappers are binaries the
      // templates do not ship. The exemption is fine; going unmentioned is not.
      assert.match(
        workflows,
        /android-compose is deliberately absent/,
        'android-compose is untested and must say why in the workflow that skips it',
      );
      continue;
    }
    assert.match(
      workflows,
      new RegExp(`\\b${template.framework}\\b`),
      `${template.framework} is in the registry but no workflow ever scaffolds it`,
    );
  }

  assert.match(workflows, /--client/, 'the fullstack composition must be exercised somewhere');
});

test('every expected drift difference carries a reason', () => {
  // The list of intended differences is what stops the weekly drift report from
  // crying wolf. It is also one careless append away from becoming "warnings we got
  // tired of", which is the same failure in slower motion — so an entry without a
  // reason is a test failure, not a style note.
  const entries = [
    ...Object.entries(EXPECTED_BEHIND).map(([k, v]) => [`dependency ${k}`, v]),
    ...Object.entries(EXPECTED_MISSING_FILES).flatMap(([stack, files]) =>
      Object.entries(files).map(([f, v]) => [`${stack}:${f}`, v]),
    ),
  ];

  assert.ok(entries.length > 0, 'the expectations file is not empty');

  for (const [what, reason] of entries) {
    assert.equal(typeof reason, 'string', `${what}: reason must be text`);
    assert.ok(
      reason.trim().length > 20,
      `${what}: "${reason}" is not a reason — say why the difference is intended`,
    );
  }
});

test('the drift workflow actually filters through the expectations', () => {
  // Without this the expectations file exists and is ignored, which is worse than
  // not having one: it reads as though the noise was handled.
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'template-drift.yml'),
    'utf8',
  );
  assert.match(workflow, /drift-expectations\.js --files/, 'file drift must be filtered');
  assert.match(workflow, /EXPECTED_BEHIND/, 'dependency drift must be filtered');
});
