/**
 * `lattice doctor` scores real trees, so the tests build real (temporary) trees and
 * assert on the resulting numbers — not on the ANSI-coloured rendering, which is why
 * inspect() and renderReport() are separate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspect, renderReport } from '../src/doctor.js';

/** Build a throwaway project tree from a { relativePath: contents } map. */
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return root;
}

test('an empty directory scores low and reports the whole checklist as gaps', () => {
  const report = inspect(fixture({ '.keep': '' }));

  assert.ok(report.overall < 30, `expected a low score, got ${report.overall}`);
  assert.ok(report.gaps.length >= 8, 'an empty project should have many gaps');
  // The heaviest gaps come first — a missing test suite outranks a missing editorconfig.
  assert.ok(report.gaps[0].weight >= report.gaps[report.gaps.length - 1].weight);
});

test('a well-formed project scores high and reports few gaps', () => {
  const root = fixture({
    'README.md': '# Thing\n\nWhat it is and how to run it.',
    LICENSE: 'MIT',
    '.gitignore': 'node_modules/',
    '.editorconfig': 'root = true',
    'CONTRIBUTING.md': '# Contributing',
    'CHANGELOG.md': '# Changelog',
    'SECURITY.md': '# Security Policy',
    '.github/workflows/ci.yml': 'name: CI',
    '.github/dependabot.yml': 'version: 2',
    Dockerfile: 'FROM node:20',
    'docker-compose.yml': 'services: {}',
    'docs/adr/0001.md': '# ADR',
    'src/index.js': "import { logger } from './logger.js';",
    'src/logger.js': 'export const logger = {};',
    'src/config.js': 'const level = process.env.LOG_LEVEL;',
    'tests/index.test.js': 'test("x", () => {});',
    'package.json': JSON.stringify({
      scripts: { test: 'node --test' },
      dependencies: { winston: '^3.0.0' },
    }),
  });

  const report = inspect(root);
  assert.ok(report.overall >= 90, `expected a high score, got ${report.overall}`);
});

test('structure: a nested src/ counts as a code root', () => {
  const shallow = inspect(fixture({ 'index.js': 'x' }));
  const structured = inspect(fixture({ 'src/index.js': 'x' }));

  const scoreOf = (r) => r.dimensions.find((d) => d.key === 'structure').score;
  assert.ok(scoreOf(structured) > scoreOf(shallow), 'src/ should raise the structure score');
});

test('observability: a winston dependency satisfies the logger check', () => {
  const withWinston = inspect(
    fixture({ 'package.json': JSON.stringify({ dependencies: { winston: '^3.0.0' } }) }),
  );
  const obs = withWinston.dimensions.find((d) => d.key === 'observability');
  assert.equal(obs.items.find((i) => /logger/.test(i.label)).ok, true);
});

test('observability: an env-driven LOG_LEVEL is detected by content, not just filename', () => {
  const report = inspect(
    fixture({ 'src/config.js': 'export const level = process.env.LOG_LEVEL ?? "info";' }),
  );
  const obs = report.dimensions.find((d) => d.key === 'observability');
  assert.equal(obs.items.find((i) => /log level/i.test(i.label)).ok, true);
});

test('security: a project with no SECURITY.md is told exactly why and how', () => {
  const report = inspect(fixture({ 'README.md': '# x' }));
  const gap = report.gaps.find((g) => /SECURITY/.test(g.label));
  assert.ok(gap, 'missing SECURITY.md should be a gap');
  assert.match(gap.why, /private channel/);
  assert.match(gap.fix, /SECURITY\.md/);
});

test('renderReport prints the overall score and is a plain string', () => {
  const out = renderReport(inspect(fixture({ 'README.md': '# x' })));
  assert.equal(typeof out, 'string');
  assert.match(out, /overall/);
  assert.match(out, /lattice doctor/);
});

test('inspect refuses a path that is not a directory', () => {
  assert.throws(() => inspect(path.join(os.tmpdir(), 'does-not-exist-doctor-xyz')), /Not a directory/);
});
