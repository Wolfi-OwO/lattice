/**
 * The enterprise overlay: the skeleton `--enterprise` lays on top of a scaffolded
 * project (community-health files, CI, docs/adr, todo, organizational).
 *
 * The end-to-end proof that a scaffolded project still builds with the overlay is
 * done by hand (npm install + vite build); these assert the copier's behaviour —
 * substitution, dotfile renaming, README composition, per-toolchain CI selection,
 * and that it never clobbers a template's own files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { overlayEnterprise } from '../src/setup.js';

const ROOT = path.join(import.meta.dirname, '..');
const OVERLAY = path.join(ROOT, 'overlays', 'enterprise');

const VARS = {
  projectName: 'acme-dashboard',
  projectTitle: 'acme-dashboard',
  owner: 'acme-corp',
  version: '0.1.0',
  year: '2026',
};

function emptyProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ent-'));
}

/** A project directory that already looks like the given toolchain. */
function projectWith(marker, contents = '{}\n') {
  const dir = emptyProject();
  fs.writeFileSync(path.join(dir, marker), contents);
  return dir;
}

test('the overlay lands the enterprise skeleton with dotfiles restored', () => {
  const target = projectWith('package.json');
  overlayEnterprise(OVERLAY, target, VARS);

  for (const rel of [
    'README.md',
    'version.txt',
    'LICENSE',
    'CODE_OF_CONDUCT.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    '.github/workflows/ci.yml', // _github -> .github
    '.github/dependabot.yml',
    '.gitattributes', // _gitattributes -> .gitattributes
    '.editorconfig', // _editorconfig -> .editorconfig
    'docs/adr/0001-record-architecture-decisions.md',
    'todo/tech-debt.md',
    'organizational/README.md',
  ]) {
    assert.ok(fs.existsSync(path.join(target, rel)), `${rel} should be written`);
  }

  // The dot-less staging names must not survive.
  assert.ok(!fs.existsSync(path.join(target, '_github')), '_github must be renamed to .github');
  assert.ok(!fs.existsSync(path.join(target, '_gitattributes')));
});

test('no dot-less staging name survives the overlay, anywhere in the tree', () => {
  // Asserted as a rule over the whole output rather than name by name: the enumerated
  // version above is what let `_vscode` ship as a literal `_vscode/` directory, because
  // adding a file to overlays/ and forgetting its OVERLAY_RENAME entry breaks nothing
  // that anyone listed. Anything staged as `_x` is by definition meant to land as `.x`.
  const target = projectWith('package.json');
  overlayEnterprise(OVERLAY, target, VARS);

  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) offenders.push(path.relative(target, path.join(dir, entry.name)));
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  walk(target);

  assert.deepEqual(
    offenders,
    [],
    `these landed with their staging name — add them to OVERLAY_RENAME: ${offenders.join(', ')}`,
  );
});

test('placeholders are substituted, and GitHub Actions expressions are left alone', () => {
  const target = projectWith('package.json');
  overlayEnterprise(OVERLAY, target, VARS);

  const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /acme-corp\/acme-dashboard/, 'owner/repo fills the badge URLs');
  assert.ok(!readme.includes('{{'), 'no lattice placeholder left in the README');

  // ${{ github.ref }} is GitHub Actions syntax, not a lattice placeholder — the
  // render regex only matches {{word}}, so this must survive untouched.
  const ci = fs.readFileSync(path.join(target, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /\$\{\{ github\.ref \}\}/, 'GitHub Actions expression preserved');

  assert.equal(fs.readFileSync(path.join(target, 'version.txt'), 'utf8').trim(), '0.1.0');
});

test('the overlay composes the README and never clobbers a template file', () => {
  const target = emptyProject();
  // A template got here first: its own package.json and .gitignore, and a plain README.
  fs.writeFileSync(path.join(target, 'package.json'), '{"name":"mine"}\n');
  fs.writeFileSync(path.join(target, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(
    path.join(target, 'README.md'),
    '# the template readme\n\nHow this project is laid out, and why.\n',
  );

  overlayEnterprise(OVERLAY, target, VARS);

  assert.equal(
    fs.readFileSync(path.join(target, 'package.json'), 'utf8'),
    '{"name":"mine"}\n',
    'the template package.json is untouched',
  );
  assert.equal(
    fs.readFileSync(path.join(target, '.gitignore'), 'utf8'),
    'node_modules\n',
    'the template .gitignore is untouched',
  );
  const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /align="center"/, 'the badge header is prepended');
  assert.match(
    readme,
    /How this project is laid out, and why\./,
    'the template README is KEPT, not overwritten — it is the only place this ' +
      'project’s actual layout and dependency rules are written down',
  );
});

test('the directory table describes the tree, including what must not go where', () => {
  const target = projectWith('package.json');
  fs.mkdirSync(path.join(target, 'src', 'services'), { recursive: true });
  fs.mkdirSync(path.join(target, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(target, 'src', 'layouts'), { recursive: true });
  fs.mkdirSync(path.join(target, 'node_modules', 'left-pad'), { recursive: true });

  overlayEnterprise(OVERLAY, target, VARS);
  const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8');

  assert.match(readme, /\| `src\/` \|/, 'src/ is described');
  assert.match(readme, /\| `src\/services\/` \|/, 'depth 2 is described');
  assert.match(readme, /No HTTP types|no request, no response/i, 'services says what may NOT enter it');
  assert.match(readme, /Layouts never depend on pages/i, 'the layout dependency rule is stated');
  assert.match(readme, /A page does not choose its frame/i, 'the page dependency rule is stated');

  // Directories the overlay itself added must appear — the table is generated after
  // the overlay, not before, precisely so this is true.
  assert.match(readme, /\| `todo\/` \|/);
  assert.match(readme, /\| `docs\/` \|/);

  // Noise that would make nobody read the table.
  assert.ok(!/node_modules/.test(readme), 'node_modules is never listed');
  assert.ok(!/`\.github\/workflows\/`/.test(readme), '.github is one row, not descended into');
});

test('the quick start is the project’s own build tool, not always npm', () => {
  for (const [marker, expected, wrong] of [
    ['package.json', /npm install/, null],
    ['go.mod', /go run \./, /npm install/],
    ['Cargo.toml', /cargo run/, /npm install/],
    ['pom.xml', /mvn/, /npm install/],
  ]) {
    const target = projectWith(marker);
    overlayEnterprise(OVERLAY, target, VARS);
    const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8');

    assert.match(readme, expected, `${marker}: quick start uses its own tool`);
    if (wrong) assert.ok(!wrong.test(readme), `${marker}: must not tell the user to run npm`);
  }
});

test('every project gets the CI of its own build tool', () => {
  // The defect: one npm-flavoured ci.yml went to every project, so `--enterprise` on
  // a Go module produced a workflow whose first step is `npm ci` — a guaranteed red
  // pipeline on the first push. Each marker must select its own toolchain layer.
  const cases = [
    ['package.json', 'node', /npm ci/],
    ['go.mod', 'go', /go test/],
    ['Cargo.toml', 'rust', /cargo test/],
    ['pom.xml', 'maven', /mvn -B verify/],
    ['build.gradle.kts', 'gradle', /gradlew build/],
    ['pyproject.toml', 'python', /pytest/],
    ['App.csproj', 'dotnet', /dotnet test/],
    ['Package.swift', 'swift', /swift test/],
    ['pubspec.yaml', 'dart', /dart analyze|flutter analyze/],
    ['composer.json', 'php', /phpunit|artisan test/],
    ['Gemfile', 'ruby', /rails test|rake test/],
  ];

  for (const [marker, expected, ciPattern] of cases) {
    const target = projectWith(marker);
    const { toolchain } = overlayEnterprise(OVERLAY, target, VARS);
    assert.equal(toolchain, expected, `${marker} should be detected as ${expected}`);

    const ci = fs.readFileSync(path.join(target, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, ciPattern, `${expected}: ci.yml must build with its own tool`);

    // The npm-everywhere bug, asserted directly.
    if (expected !== 'node') {
      assert.ok(!/npm ci|npm run/.test(ci), `${expected}: ci.yml must not run npm`);
      const dependabot = fs.readFileSync(path.join(target, '.github/dependabot.yml'), 'utf8');
      assert.ok(
        !/package-ecosystem: npm/.test(dependabot),
        `${expected}: a npm dependabot entry makes GitHub error on the repository`,
      );
    }
  }
});

test('a project that also ships a package.json is not mistaken for a Node project', () => {
  // Laravel ships a package.json for Vite; Rails ships one for jsbundling. Detecting
  // either as Node hands it an `npm ci` pipeline — the original bug, wearing a
  // different hat. The composer.json / Gemfile names the real owner, so those
  // markers sit above node in the table and this is what says so out loud.
  for (const [marker, expected] of [
    ['composer.json', 'php'],
    ['Gemfile', 'ruby'],
    ['pubspec.yaml', 'dart'],
  ]) {
    const target = projectWith('package.json');
    fs.writeFileSync(path.join(target, marker), '');

    const { toolchain } = overlayEnterprise(OVERLAY, target, VARS);
    assert.equal(toolchain, expected, `${marker} + package.json must be ${expected}, not node`);

    const ci = fs.readFileSync(path.join(target, '.github/workflows/ci.yml'), 'utf8');
    assert.ok(!/npm ci/.test(ci), `${expected}: must not get the Node pipeline`);
  }
});

test('an unrecognised project gets the universal layer but no CI', () => {
  // Better than a workflow that cannot pass: the community-health files are true of
  // any project, a build pipeline is not.
  const target = emptyProject();
  const { files, toolchain } = overlayEnterprise(OVERLAY, target, VARS);

  assert.equal(toolchain, null);
  assert.ok(files.includes('LICENSE'), 'the universal layer still lands');
  assert.ok(fs.existsSync(path.join(target, 'SECURITY.md')));
  assert.ok(
    !fs.existsSync(path.join(target, '.github/workflows/ci.yml')),
    'no CI is written when the build tool is unknown',
  );
  // The language-agnostic workflows are universal and must still be there.
  assert.ok(fs.existsSync(path.join(target, '.github/workflows/security.yml')));
});

test('every toolchain layer on disk is a complete, well-formed pair', () => {
  // Adding a language is adding a directory here — this asserts the contract that
  // directory has to meet, so a half-added toolchain fails the suite rather than
  // silently shipping a project with dependabot config and no CI.
  const toolchainRoot = path.join(ROOT, 'overlays', 'toolchain');
  const toolchains = fs.readdirSync(toolchainRoot);
  assert.ok(toolchains.length >= 11, 'the toolchain layers are present');

  for (const id of toolchains) {
    for (const rel of ['_github/workflows/ci.yml', '_github/dependabot.yml']) {
      assert.ok(
        fs.existsSync(path.join(toolchainRoot, id, rel)),
        `toolchain "${id}" is missing ${rel}`,
      );
    }
    // A CI that never gets called by the release pipeline is a CI nobody runs.
    const ci = fs.readFileSync(path.join(toolchainRoot, id, '_github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /workflow_call:/, `toolchain "${id}": ci.yml must be reusable by release.yml`);
  }
});

test('the overlay ships in the npm tarball', () => {
  // If overlays/ is missing from package.json "files", `--enterprise` throws
  // "no such file" for everyone who installs lattice from the registry.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('overlays'), 'package.json "files" must include overlays/');
});

test('every overlay text file is valid after substitution — no lonely braces', () => {
  const target = projectWith('package.json');
  overlayEnterprise(OVERLAY, target, VARS);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(md|txt|yml|json)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        assert.ok(
          !/\{\{\w+\}\}/.test(text),
          `${path.relative(target, full)} still has an unsubstituted {{placeholder}}`,
        );
      }
    }
  };
  walk(target);
});
