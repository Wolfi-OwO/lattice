import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildVars, copyTemplate, isEmptyDir, render } from '../src/scaffold.js';
import { TEMPLATES, findTemplate } from '../src/registry.js';

const STACK_ROOT = path.resolve(import.meta.dirname, '..', 'stacks');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-test-'));
}

test('every registered template points at a directory that exists', () => {
  for (const template of TEMPLATES) {
    const dir = path.join(STACK_ROOT, template.dir);
    assert.ok(fs.existsSync(dir), `missing template directory: ${template.dir}`);
  }
});

test('render substitutes known keys and leaves unknown ones alone', () => {
  const out = render('{{projectName}} on {{port}}, not {{unknown}}', {
    projectName: 'shop',
    port: '3000',
  });
  assert.equal(out, 'shop on 3000, not {{unknown}}');
});

test('buildVars derives a pascal name and a package path', () => {
  const vars = buildVars({
    projectName: 'My Cool App',
    javaPackage: 'at.htlvillach.shop',
    port: '8080',
  });

  assert.equal(vars.projectName, 'my-cool-app');
  assert.equal(vars.pascalName, 'MyCoolApp');
  assert.equal(vars.mainClass, 'MyCoolAppApplication');
  assert.equal(vars.PACKAGE_PATH, 'at/htlvillach/shop');
  assert.equal(vars.clientPort, '10080');
});

test('scaffolding express renames dotfiles and substitutes the port', () => {
  const target = tempDir();
  const vars = buildVars({ projectName: 'shop', port: '4000' });

  copyTemplate(path.join(STACK_ROOT, 'backend/javascript/express'), target, vars);

  // _package.json -> package.json, _gitignore -> .gitignore, _env.example -> .env.example
  assert.ok(fs.existsSync(path.join(target, 'package.json')));
  assert.ok(fs.existsSync(path.join(target, '.gitignore')));
  assert.ok(!fs.existsSync(path.join(target, '_package.json')));

  const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'shop');

  const config = fs.readFileSync(path.join(target, 'src/config/index.js'), 'utf8');
  assert.match(config, /PORT \?\? 4000/);
  assert.doesNotMatch(config, /\{\{/, 'no unsubstituted placeholders should remain');

  fs.rmSync(target, { recursive: true, force: true });
});

test('scaffolding spring-boot expands the package into real directories', () => {
  const target = tempDir();
  const vars = buildVars({
    projectName: 'shop',
    javaPackage: 'at.htlvillach.shop',
    port: '8080',
  });

  copyTemplate(path.join(STACK_ROOT, 'backend/java/spring-boot'), target, vars);

  const base = path.join(target, 'src/main/java/at/htlvillach/shop');
  assert.ok(fs.existsSync(path.join(base, 'ShopApplication.java')));
  assert.ok(fs.existsSync(path.join(base, 'controllers/UserController.java')));

  const main = fs.readFileSync(path.join(base, 'ShopApplication.java'), 'utf8');
  assert.match(main, /package at\.htlvillach\.shop;/);
  assert.match(main, /class ShopApplication/);

  fs.rmSync(target, { recursive: true, force: true });
});

test('copyTemplate skips build output and dependency directories', () => {
  /*
   * A synthetic template, so the test does not depend on any real one being dirty.
   * Build output lands in template dirs whenever someone runs a build from a git
   * clone; copying it out once produced a project whose stray target/classes broke
   * spring-boot:repackage. The published package is protected by the files
   * allowlist, but a clone is not, so the copy itself has to refuse these.
   */
  const source = tempDir();
  fs.writeFileSync(path.join(source, 'keep.txt'), 'real file');

  for (const dir of ['target', 'build', 'node_modules', '.git', '.gradle']) {
    fs.mkdirSync(path.join(source, dir), { recursive: true });
    fs.writeFileSync(path.join(source, dir, 'junk'), 'should not be copied');
  }

  const target = tempDir();
  const files = copyTemplate(source, target, {});

  assert.ok(fs.existsSync(path.join(target, 'keep.txt')), 'a real file is still copied');
  for (const dir of ['target', 'build', 'node_modules', '.git', '.gradle']) {
    assert.ok(!fs.existsSync(path.join(target, dir)), `${dir}/ must not be copied`);
  }
  assert.deepEqual(files, ['keep.txt'], 'only the real file is reported as written');

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
});

test('no template leaves an unsubstituted placeholder behind', () => {
  const vars = buildVars({
    projectName: 'demo',
    javaPackage: 'at.htlvillach.demo',
    port: '3000',
  });

  for (const template of TEMPLATES) {
    const target = tempDir();
    const files = copyTemplate(path.join(STACK_ROOT, template.dir), target, vars);

    for (const file of files) {
      // .http files intentionally use {{host}} — that is REST-client syntax.
      if (file.endsWith('.http')) continue;

      const content = fs.readFileSync(path.join(target, file), 'utf8');
      const leftover = content.match(/\{\{(\w+)\}\}/);

      assert.equal(
        leftover,
        null,
        `${template.framework}/${file} still contains ${leftover?.[0]}`,
      );
    }

    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('fullstack composition puts the frontend under client/', () => {
  const target = tempDir();
  const vars = buildVars({ projectName: 'shop', port: '3000' });

  const backend = findTemplate('express');
  const frontend = findTemplate('react-vite');

  copyTemplate(path.join(STACK_ROOT, backend.dir), target, vars);
  copyTemplate(path.join(STACK_ROOT, frontend.dir), path.join(target, 'client'), {
    ...vars,
    projectName: `${vars.projectName}-client`,
  });

  assert.ok(fs.existsSync(path.join(target, 'src/server.js')), 'backend at the root');
  assert.ok(fs.existsSync(path.join(target, 'client/src/main.jsx')), 'frontend under client/');

  const clientPkg = JSON.parse(
    fs.readFileSync(path.join(target, 'client/package.json'), 'utf8'),
  );
  assert.equal(clientPkg.name, 'shop-client');

  // The dev proxy must point at the port the backend actually listens on.
  const viteConfig = fs.readFileSync(path.join(target, 'client/vite.config.js'), 'utf8');
  assert.match(viteConfig, /target: 'http:\/\/localhost:3000'/);

  fs.rmSync(target, { recursive: true, force: true });
});

test('isEmptyDir tolerates a bare git repo but not real content', () => {
  const dir = tempDir();
  assert.equal(isEmptyDir(dir), true);

  fs.mkdirSync(path.join(dir, '.git'));
  assert.equal(isEmptyDir(dir), true);

  fs.writeFileSync(path.join(dir, 'README.md'), '#');
  assert.equal(isEmptyDir(dir), false);

  fs.rmSync(dir, { recursive: true, force: true });
});
