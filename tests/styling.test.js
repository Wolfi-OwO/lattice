import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildVars, copyTemplate } from '../src/scaffold.js';
import { STYLING, STYLING_ORDER, DEFAULT_STYLING, stylingChoices, viteBits } from '../src/styling.js';
import { mergeDeps, pruneStyles } from '../src/setup.js';
import { TEMPLATES } from '../src/registry.js';

const STACK_ROOT = path.resolve(import.meta.dirname, '..', 'stacks');

/** Both frontends, and the entry file each one's main module imports. */
const FRONTENDS = [
  { dir: 'frontend/javascript/react-vite', main: 'src/main.jsx', config: 'vite.config.js' },
  { dir: 'frontend/typescript/react-vite-ts', main: 'src/main.tsx', config: 'vite.config.ts' },
];

/**
 * The class-name contract every variant has to implement. This is the whole
 * premise of the feature: the components are written against these names and
 * never against a framework's, which is what makes the four interchangeable.
 *
 * Checked as suffixes rather than whole selectors because SCSS writes the BEM
 * block nested — `.app { &__header { … } }` — so the literal string
 * `.app__header` never appears in that file even though the compiled rule does.
 */
const CONTRACT = ['__header', '__brand', '__nav', '__main', '.table', '.pager', '.muted', '.error'];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-styling-'));
}

/** Scaffold a frontend with a styling choice, exactly as bin/lattice.js does. */
function scaffold(frontend, styling) {
  const target = tempDir();
  const vars = buildVars({ projectName: 'shop', port: '3000', styling });
  const spec = STYLING[styling];

  copyTemplate(path.join(STACK_ROOT, frontend.dir), target, vars);
  pruneStyles(target, spec.source, spec.entry);
  mergeDeps(target, spec.deps ?? {});
  mergeDeps(target, spec.devDeps ?? {}, 'devDependencies');

  return { target, vars };
}

// ------------------------------------------------------------------ catalogue

test('every styling variant ships its stylesheet in both frontends', () => {
  for (const frontend of FRONTENDS) {
    for (const id of STYLING_ORDER) {
      const file = path.join(STACK_ROOT, frontend.dir, 'src/styles', STYLING[id].source);
      assert.ok(fs.existsSync(file), `${frontend.dir} is missing ${STYLING[id].source} for ${id}`);
    }
  }
});

test('the two frontends ship byte-identical stylesheets', () => {
  // They render the same components against the same contract, so a variant that
  // drifted between them would be a bug nobody would notice until one of the two
  // looked wrong. Sharing is asserted rather than trusted.
  for (const id of STYLING_ORDER) {
    const [a, b] = FRONTENDS.map((f) =>
      fs.readFileSync(path.join(STACK_ROOT, f.dir, 'src/styles', STYLING[id].source), 'utf8'),
    );
    assert.equal(a, b, `${STYLING[id].source} differs between the JS and TS frontends`);
  }
});

test('every variant implements the whole class-name contract', () => {
  for (const id of STYLING_ORDER) {
    const source = fs.readFileSync(
      path.join(STACK_ROOT, FRONTENDS[0].dir, 'src/styles', STYLING[id].source),
      'utf8',
    );
    for (const selector of CONTRACT) {
      assert.ok(
        source.includes(selector),
        `${id} does not implement "${selector}" — components using it would be unstyled`,
      );
    }
  }
});

test('the default styling costs nothing to install', () => {
  const spec = STYLING[DEFAULT_STYLING];
  assert.deepEqual(spec.deps, {}, 'the default must not add a dependency');
  assert.deepEqual(spec.devDeps, {}, 'the default must not add a devDependency');
});

test('the picker offers every variant, in order, with a hint', () => {
  const choices = stylingChoices();
  assert.deepEqual(
    choices.map((ch) => ch.value),
    STYLING_ORDER,
  );
  for (const choice of choices) {
    assert.ok(choice.label, `${choice.value} has no label`);
    assert.ok(choice.hint, `${choice.value} has no hint`);
  }
});

// ------------------------------------------------------------------ scaffold

test('scaffolding keeps one stylesheet, renames it, and removes the directory', () => {
  for (const frontend of FRONTENDS) {
    for (const id of STYLING_ORDER) {
      const { target } = scaffold(frontend, id);
      const spec = STYLING[id];

      assert.ok(
        fs.existsSync(path.join(target, 'src', spec.entry)),
        `${id} did not produce src/${spec.entry}`,
      );
      assert.ok(
        !fs.existsSync(path.join(target, 'src', 'styles')),
        `${id} left src/styles/ behind — the reader cannot tell which file is live`,
      );

      // The variants that were not chosen must be gone, not merely unimported:
      // a stray bootstrap.scss fails to compile the moment anyone imports it,
      // because Bootstrap is not installed unless it was chosen.
      const stray = fs
        .readdirSync(path.join(target, 'src'))
        .filter((f) => f.endsWith('.css') || f.endsWith('.scss'));
      assert.deepEqual(stray, [spec.entry], `${id} left more than one stylesheet`);
    }
  }
});

test('the entry file is the one the app actually imports', () => {
  // A mismatch here is the failure this feature is most likely to have: main.jsx
  // imports a name, pruneStyles produces a name, and nothing else checks they
  // agree. The app would fail to start with "failed to resolve import".
  for (const frontend of FRONTENDS) {
    for (const id of STYLING_ORDER) {
      const { target } = scaffold(frontend, id);
      const main = fs.readFileSync(path.join(target, frontend.main), 'utf8');
      const imported = main.match(/import '\.\/(styles\.[a-z]+)'/)?.[1];

      assert.equal(
        imported,
        STYLING[id].entry,
        `${frontend.main} imports ${imported} but ${id} produces ${STYLING[id].entry}`,
      );
      assert.ok(
        fs.existsSync(path.join(target, 'src', imported)),
        `${frontend.main} imports src/${imported}, which does not exist`,
      );
    }
  }
});

test('dependencies land in the right field', () => {
  for (const id of STYLING_ORDER) {
    const { target } = scaffold(FRONTENDS[0], id);
    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));

    for (const name of Object.keys(STYLING[id].deps ?? {})) {
      assert.ok(pkg.dependencies?.[name], `${id}: ${name} should be a dependency`);
    }
    // Sass and Tailwind are compile-time tools. Shipping them as runtime
    // dependencies would put a CSS compiler in a production install.
    for (const name of Object.keys(STYLING[id].devDeps ?? {})) {
      assert.ok(pkg.devDependencies?.[name], `${id}: ${name} should be a devDependency`);
      assert.ok(!pkg.dependencies?.[name], `${id}: ${name} must not also be a runtime dependency`);
    }
  }
});

test('only Tailwind touches the Vite config', () => {
  for (const frontend of FRONTENDS) {
    for (const id of STYLING_ORDER) {
      const { target } = scaffold(frontend, id);
      const config = fs.readFileSync(path.join(target, frontend.config), 'utf8');

      assert.ok(!config.includes('{{'), `${id}: an unfilled placeholder survived into ${frontend.config}`);

      if (STYLING[id].vitePlugin) {
        assert.match(config, /import tailwindcss from '@tailwindcss\/vite';/);
        assert.match(config, /plugins: \[react\(\), tailwindcss\(\)\]/);
      } else {
        assert.ok(
          !config.includes('tailwindcss'),
          `${id} should leave the Vite config reading as if the feature did not exist`,
        );
        assert.match(config, /plugins: \[react\(\)\]/);
      }
    }
  }
});

test('viteBits is empty for every variant that needs no plugin', () => {
  for (const id of STYLING_ORDER) {
    const bits = viteBits(id);
    if (STYLING[id].vitePlugin) continue;
    assert.equal(bits.viteStyleImport, '');
    assert.equal(bits.viteStylePlugin, '');
  }
});

// ------------------------------------------------------------------ registry

test('styling is offered by the frontends and by nothing else', () => {
  const styled = TEMPLATES.filter((t) => t.styling).map((t) => t.framework);
  assert.deepEqual(styled.sort(), ['react-vite', 'react-vite-ts']);
});

test('an unknown variant is rejected rather than silently defaulted', () => {
  // buildVars falls back for robustness, but the CLI must refuse first — a typo
  // like --styling tailwing should not quietly hand back plain CSS.
  assert.ok(!STYLING.tailwing, 'guard against this test rotting if a variant is renamed');
  const vars = buildVars({ projectName: 'shop', styling: 'tailwing' });
  assert.equal(vars.stylesEntry, STYLING[DEFAULT_STYLING].entry);
});
