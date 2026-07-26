/**
 * `lattice doctor` — score a project's structure and hygiene, offline.
 *
 * This is the seed of the "architecture advisor" idea, kept honest: everything here
 * is DETERMINISTIC and LOCAL. It reads the tree and checks it against conventions
 * that are mechanically decidable — is there a tests directory, a CI pipeline, a
 * security policy, a logger. It does NOT phone home, call a model, or pretend to
 * "research best practices"; a scaffolder that made a network round-trip to grade
 * you would have stopped being a scaffolder. The checks encode the patterns the
 * author's own repositories already hold themselves to (application/ + docs/, CI on
 * GitHub and GitLab, Docker, Winston logging, SECURITY.md), so the score measures a
 * project against a real, lived bar rather than a fashionable one.
 *
 * The report is data (`inspect`) separated from its rendering (`renderReport`), so
 * the scoring is unit-testable without asserting on ANSI colours.
 */
import fs from 'node:fs';
import path from 'node:path';

import { c } from './prompts.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', '.gradle',
  '.venv', 'venv', '__pycache__', 'vendor', '.next', 'coverage', 'bin', 'obj',
]);

/** A bounded walk — enough depth to find a nested `src/`, cheap enough to stay instant. */
function collect(root, maxDepth = 4) {
  const files = new Set();
  const dirs = new Set();

  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const rel = path.relative(root, path.join(dir, entry.name));
        dirs.add(rel.split(path.sep).join('/'));
        if (depth < maxDepth) walk(path.join(dir, entry.name), depth + 1);
      } else {
        const rel = path.relative(root, path.join(dir, entry.name));
        files.add(rel.split(path.sep).join('/'));
      }
    }
  };

  walk(root, 0);
  return { files, dirs };
}

/** Context handed to every check: the tree, plus a couple of parsed conveniences. */
function context(root) {
  const { files, dirs } = collect(root);
  const has = (re) => [...files].some((f) => re.test(f));
  const hasDir = (re) => [...dirs].some((d) => re.test(d));
  const basename = (re) => [...files].some((f) => re.test(f.split('/').pop()));

  let packageJson = null;
  if (files.has('package.json')) {
    try {
      packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    } catch {
      /* a malformed package.json is itself a finding, surfaced below */
    }
  }

  const readme = [...files].find((f) => /^readme\.md$/i.test(f));
  const readmeSize = readme ? safeSize(path.join(root, readme)) : 0;

  return { root, files, dirs, has, hasDir, basename, packageJson, readmeSize };
}

function safeSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * Dimensions and their checks. Each check is `pass` (met) plus, when it is not, the
 * `why` it matters and the `fix`. Weights let a missing test suite hurt more than a
 * missing editorconfig. Grounded in CONVENTIONS.md and the author's repositories.
 */
const DIMENSIONS = [
  {
    key: 'structure',
    label: 'Structure',
    checks: [
      { label: 'a clear code root (src/ · app/ · application/ · lib/)', weight: 3,
        pass: (x) => x.hasDir(/^(src|app|application|lib)(\/|$)/),
        why: 'Source scattered at the root has no obvious home and no boundary to protect.',
        fix: 'Move source under src/ (or application/, your own convention).' },
      { label: 'a dedicated tests location', weight: 2,
        pass: (x) => x.hasDir(/(^|\/)(tests?|__tests__|spec)(\/|$)/) || x.has(/\.(test|spec)\.[jt]sx?$/) || x.has(/test_.*\.py$/),
        why: 'Tests with no home tend not to get written.',
        fix: 'Add a tests/ directory next to the code it covers.' },
      { label: 'a docs/ directory', weight: 1,
        pass: (x) => x.hasDir(/^docs(\/|$)/),
        why: 'Anything past a README has nowhere to live and rots inside commit messages.',
        fix: 'Add docs/, with docs/adr/ for the decisions worth remembering.' },
    ],
  },
  {
    key: 'hygiene',
    label: 'Hygiene',
    checks: [
      { label: 'README', weight: 3, pass: (x) => x.basename(/^readme\.md$/i),
        why: 'The first thing a human or a registry shows. Its absence reads as abandonment.',
        fix: 'Add README.md: what it is, how to run it, why it is shaped that way.' },
      { label: 'LICENSE', weight: 2, pass: (x) => x.basename(/^licen[cs]e(\.md|\.txt)?$/i),
        why: 'No licence means nobody may legally use it — the opposite of what a public repo intends.',
        fix: 'Add a LICENSE (MIT matches your other repositories).' },
      { label: '.gitignore', weight: 1, pass: (x) => x.has(/^\.gitignore$/),
        why: 'Without it, build output and secrets leak into history.',
        fix: 'Add a .gitignore for your stack.' },
      { label: '.editorconfig', weight: 1, pass: (x) => x.has(/^\.editorconfig$/),
        why: 'Whitespace wars across editors are a diff-noise tax you pay forever.',
        fix: 'Add .editorconfig — every one of your other repos has one.' },
      { label: 'CONTRIBUTING', weight: 1, pass: (x) => x.basename(/^contributing\.md$/i),
        why: 'Contributors guess at your process, and guess wrong.',
        fix: 'Add CONTRIBUTING.md describing how to build, test and open a PR.' },
      { label: 'CHANGELOG', weight: 1, pass: (x) => x.basename(/^changelog\.md$/i),
        why: 'Users cannot tell what changed between versions.',
        fix: 'Add CHANGELOG.md (Keep a Changelog).' },
    ],
  },
  {
    key: 'testing',
    label: 'Testing',
    checks: [
      { label: 'test files exist', weight: 3,
        pass: (x) => x.has(/\.(test|spec)\.[jt]sx?$/) || x.has(/(^|\/)test_.*\.py$/) || x.has(/.*_test\.go$/),
        why: 'A codebase with no tests cannot be changed with confidence — every edit is a bet.',
        fix: 'Add a test suite; even a handful of tests changes how you can refactor.' },
      { label: 'a one-command test entry point', weight: 2,
        pass: (x) => Boolean(x.packageJson?.scripts?.test) || x.has(/^(Makefile|pyproject\.toml|pom\.xml|go\.mod)$/),
        why: 'If nobody knows the command, CI cannot run it and neither can a new contributor.',
        fix: 'Wire a `test` script (or Makefile target) that runs the suite from a clean clone.' },
    ],
  },
  {
    key: 'cicd',
    label: 'CI/CD',
    checks: [
      { label: 'a CI pipeline (GitHub Actions or GitLab CI)', weight: 3,
        pass: (x) => x.hasDir(/^\.github\/workflows(\/|$)/) || x.has(/^\.gitlab-ci\.yml$/),
        why: 'Green-on-my-machine is not evidence. Without CI, breakage is found by users.',
        fix: 'Add .github/workflows/ (or .gitlab-ci.yml) that at least installs and tests.' },
    ],
  },
  {
    key: 'containerization',
    label: 'Containerization',
    checks: [
      { label: 'a Dockerfile', weight: 2, pass: (x) => x.basename(/^dockerfile$/i) || x.has(/(^|\/)dockerfile$/i),
        why: '"Works on my machine" is a deployment risk your Azure Container Apps setup already avoids.',
        fix: 'Add a Dockerfile so the runtime is reproducible.' },
      { label: 'a compose file for local dependencies', weight: 1,
        pass: (x) => x.has(/(^|\/)docker-compose\.ya?ml$/),
        why: 'A database that must be installed by hand is a five-minute onboarding that takes a day.',
        fix: 'Add docker-compose.yml for the services the app needs locally.' },
    ],
  },
  {
    key: 'observability',
    label: 'Observability',
    checks: [
      { label: 'a logging library or logger module', weight: 2,
        pass: (x) => hasLogging(x),
        why: 'console.log scattered through code is not observability — no levels, no structure, no off switch.',
        fix: 'Introduce a logger (Winston, like your services) with a level from the environment.' },
      { label: 'a configurable log level (env-driven)', weight: 1,
        pass: (x) => grepFiles(x.root, x.files, /LOG_LEVEL|LATTICE_LOG_LEVEL|log_level/i),
        why: 'A fixed verbosity is either too noisy in production or too quiet in an incident.',
        fix: 'Read the level from LOG_LEVEL so it changes without a redeploy.' },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    checks: [
      { label: 'a SECURITY.md disclosure policy', weight: 2, pass: (x) => x.basename(/^security\.md$/i),
        why: 'Finders of a vulnerability have no private channel, so they use a public one.',
        fix: 'Add SECURITY.md with how to report privately and what to expect.' },
      { label: 'dependency / vulnerability scanning', weight: 1,
        pass: (x) => x.has(/^\.trivyignore$/) || x.has(/^\.github\/dependabot\.ya?ml$/) || x.hasDir(/^\.github\/workflows/) && grepFiles(x.root, x.files, /trivy|codeql|snyk|npm audit|pip-audit/i),
        why: 'A pinned dependency with a known CVE is a door left open on your schedule, not yours to choose.',
        fix: 'Add Dependabot or a Trivy/CodeQL scan (your cli-image-upscaler already ships .trivyignore).' },
    ],
  },
];

function hasLogging(x) {
  const deps = { ...(x.packageJson?.dependencies ?? {}), ...(x.packageJson?.devDependencies ?? {}) };
  if (Object.keys(deps).some((d) => /^(winston|pino|bunyan|loglevel|loguru|structlog|serilog)/i.test(d))) return true;
  if (x.has(/(^|\/)logger\.[jt]s$/) || x.has(/(^|\/)logging\.py$/)) return true;
  return false;
}

/** A cheap, bounded content grep — reads only smallish text files, only when a check needs it. */
function grepFiles(root, files, re, limit = 400) {
  let scanned = 0;
  for (const rel of files) {
    if (scanned >= limit) break;
    if (!/\.(js|ts|jsx|tsx|py|go|rs|java|cs|json|ya?ml|env|example|toml)$/i.test(rel)) continue;
    scanned++;
    try {
      const full = path.join(root, rel);
      if (fs.statSync(full).size > 512 * 1024) continue;
      if (re.test(fs.readFileSync(full, 'utf8'))) return true;
    } catch {
      /* unreadable file is not a match */
    }
  }
  return false;
}

export function inspect(targetDir) {
  const root = path.resolve(targetDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Not a directory: ${targetDir}`);
  }

  const ctx = context(root);

  const dimensions = DIMENSIONS.map((dimension) => {
    const items = dimension.checks.map((check) => ({
      label: check.label,
      ok: Boolean(check.pass(ctx)),
      weight: check.weight,
      why: check.why,
      fix: check.fix,
    }));
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    const earned = items.reduce((sum, i) => sum + (i.ok ? i.weight : 0), 0);
    return {
      key: dimension.key,
      label: dimension.label,
      score: total === 0 ? 100 : Math.round((earned / total) * 100),
      items,
    };
  });

  /*
   * Dimensions weigh equally in the headline number — a project strong on tests but
   * with no security policy should not hide the gap behind an average that rounds it
   * away. Equal weighting keeps every dimension visible in the total.
   */
  const overall = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);

  const gaps = dimensions
    .flatMap((d) => d.items.filter((i) => !i.ok).map((i) => ({ dimension: d.label, ...i })))
    .sort((a, b) => b.weight - a.weight);

  return { target: root, dimensions, overall, gaps };
}

function bar(score) {
  const filled = Math.round(score / 10);
  const paint = score >= 80 ? c.green : score >= 55 ? c.yellow : c.red;
  return paint('█'.repeat(filled)) + c.gray('░'.repeat(10 - filled));
}

export function renderReport(report) {
  const lines = [];
  const grade = report.overall >= 80 ? c.green : report.overall >= 55 ? c.yellow : c.red;

  lines.push('');
  lines.push(`${c.bold('◆ lattice doctor')} ${c.gray('· ' + report.target)}`);
  lines.push('');
  lines.push(`  ${bar(report.overall)}  ${grade(c.bold(String(report.overall)))}${c.gray('/100  overall')}`);
  lines.push('');

  for (const d of report.dimensions) {
    lines.push(`  ${bar(d.score)}  ${String(d.score).padStart(3)} ${c.bold(d.label)}`);
  }

  if (report.gaps.length) {
    lines.push('');
    lines.push(`  ${c.bold('What to fix, most load-bearing first')}`);
    for (const gap of report.gaps.slice(0, 10)) {
      lines.push('');
      lines.push(`  ${c.yellow('•')} ${c.bold(gap.label)} ${c.gray(`(${gap.dimension})`)}`);
      lines.push(`    ${c.gray(gap.why)}`);
      lines.push(`    ${c.cyan('→')} ${gap.fix}`);
    }
    if (report.gaps.length > 10) {
      lines.push('');
      lines.push(c.gray(`  … and ${report.gaps.length - 10} more.`));
    }
  } else {
    lines.push('');
    lines.push(`  ${c.green('✔')} Every check passed. This is the bar your other repositories set.`);
  }

  lines.push('');
  return lines.join('\n');
}
