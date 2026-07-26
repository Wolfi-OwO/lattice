/**
 * Everything that happens to a project *after* the template tree is copied:
 * pruning the adapters it did not choose, folding the storage's dependencies
 * into package.json, writing a working .env, emitting a compose file, and
 * running the install.
 *
 * The guiding rule: a scaffolded project should boot with `npm run dev` and
 * nothing else. Any step a human would otherwise have to remember belongs here.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

import { STORAGE } from './storage.js';
import { render } from './scaffold.js';
import { buildDirectoryTable, composeReadme, quickStartFor } from './readme.js';

// ------------------------------------------------------------------- ports

/** Is a TCP port free to bind on this host right now? */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

/**
 * Find a host port for the database container, preferring the conventional one.
 *
 * Publishing 27017 (or 5432, or 3306) unconditionally is how a scaffolder
 * breaks on a machine that already develops things: either the bind fails, or —
 * far worse — it succeeds against a *pre-existing* server on that port and the
 * new project silently reads and writes someone else's database. Probing keeps
 * every project pointed at its own container.
 */
export async function findFreePort(preferred, attempts = 64) {
  for (let port = preferred; port < preferred + attempts; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in ${preferred}–${preferred + attempts}.`);
}

// --------------------------------------------------------------- adapters

/**
 * The stack ships every adapter; a project keeps exactly one. Deleting the rest
 * is not cosmetic — an unused `import pg from 'pg'` would make the project fail
 * to start unless every driver were installed.
 */
export function pruneAdapters(target, keep) {
  const dir = path.join(target, 'src', 'database', 'adapters');
  if (!fs.existsSync(dir)) return [];

  const removed = [];
  for (const file of fs.readdirSync(dir)) {
    if (path.basename(file, '.js') === keep) continue;
    fs.rmSync(path.join(dir, file));
    removed.push(file);
  }
  return removed;
}

// ------------------------------------------------------------------ styling

/**
 * The frontend equivalent of pruneAdapters: the template ships src/styles/ with
 * one file per look, and the project keeps exactly one — promoted out of that
 * directory to the name main.jsx imports, after which the directory is gone.
 *
 * Promoting rather than leaving it in place is what keeps the generated project
 * honest. A project that still had a `styles/` folder with three unused files in
 * it would invite the reader to wonder which one is live, and a stray
 * `bootstrap.scss` would fail to compile the moment anyone imported it, because
 * Bootstrap is not installed unless it was chosen.
 *
 * @param {string} target  project root
 * @param {string} source  basename to keep, e.g. 'tailwind.css'
 * @param {string} entry   what to call it, e.g. 'styles.css'
 * @returns {string[]}     basenames removed
 */
export function pruneStyles(target, source, entry) {
  const dir = path.join(target, 'src', 'styles');
  if (!fs.existsSync(dir)) return [];

  const kept = path.join(dir, source);
  if (!fs.existsSync(kept)) {
    throw new Error(`Styling variant "${source}" is missing from the template.`);
  }

  const removed = [];
  for (const file of fs.readdirSync(dir)) {
    if (file === source) continue;
    fs.rmSync(path.join(dir, file));
    removed.push(file);
  }

  fs.renameSync(kept, path.join(target, 'src', entry));
  fs.rmdirSync(dir);

  return removed;
}

// ------------------------------------------------------------ package.json

/** Merge dependencies into an existing package.json, keeping keys sorted. */
export function mergeDeps(target, deps, field = 'dependencies') {
  const file = path.join(target, 'package.json');
  if (!fs.existsSync(file) || Object.keys(deps).length === 0) return;

  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = { ...(pkg[field] ?? {}), ...deps };

  pkg[field] = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
  );

  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

// -------------------------------------------------------------------- env

function envLines(entries) {
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Writes .env and .env.example together, from one source of truth.
 *
 * The real .env gets a generated JWT secret. A placeholder like
 * `change-me-to-a-long-random-string` is a secret that never gets changed; a
 * 48-byte random one is correct the moment it is written. The .example keeps
 * the placeholder, because that file is committed.
 */
export function writeEnv(target, { base, storage, vars }) {
  const storageEnv = STORAGE[storage]?.env?.(vars) ?? {};

  const real = { ...base, ...storageEnv, JWT_SECRET: randomBytes(48).toString('base64url') };
  const example = { ...base, ...storageEnv, JWT_SECRET: 'a-long-random-string' };

  fs.writeFileSync(path.join(target, '.env'), `${envLines(real)}\n`, 'utf8');
  fs.writeFileSync(path.join(target, '.env.example'), `${envLines(example)}\n`, 'utf8');
}

// ---------------------------------------------------------------- compose

/**
 * Only storages with `server: true` get a compose file — there is nothing to
 * run for SQLite, files or memory, and shipping an empty compose file invites
 * someone to `docker compose up` and wonder why nothing happens.
 */
export function writeCompose(target, { storage, vars }) {
  const spec = STORAGE[storage];
  if (!spec?.server) return false;

  const service = spec.compose(vars);
  const volume = `${vars.projectName}-database`;

  const doc = {
    services: {
      database: service,
      api: {
        build: '.',
        ports: [`${vars.port}:${vars.port}`],
        environment: {
          NODE_ENV: 'production',
          PORT: String(vars.port),
          DATABASE_URL: spec.composeUrl(vars),
          JWT_SECRET: '${JWT_SECRET:?set JWT_SECRET in your shell or .env}',
        },
        depends_on: { database: { condition: 'service_healthy' } },
      },
    },
    volumes: { [volume]: null },
  };

  fs.writeFileSync(path.join(target, 'docker-compose.yml'), toYaml(doc), 'utf8');
  return true;
}

/**
 * A minimal YAML writer. Pulling in a YAML dependency for the handful of shapes
 * we emit (maps, string lists, scalars) is not worth it — and it keeps the CLI
 * itself dependency-free, which is the reason `npm create lattice` is instant.
 */
function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent);

  if (value === null) return '\n';

  if (Array.isArray(value)) {
    return value.map((item) => `${pad}- ${scalar(item)}\n`).join('');
  }

  if (typeof value === 'object') {
    let out = '';
    for (const [key, child] of Object.entries(value)) {
      if (child === null) {
        out += `${pad}${key}:\n`;
      } else if (typeof child === 'object') {
        out += `${pad}${key}:\n${toYaml(child, indent + 1)}`;
      } else {
        out += `${pad}${key}: ${scalar(child)}\n`;
      }
    }
    return out;
  }

  return `${pad}${scalar(value)}\n`;
}

/** Quote anything YAML would otherwise reinterpret (ports, versions, ${...}). */
function scalar(value) {
  const text = String(value);
  return /^[\w./-]+$/.test(text) && !/^\d+$/.test(text) ? text : `'${text.replace(/'/g, "''")}'`;
}

// ------------------------------------------------------------- toolchain

/** Respect the manager the user actually invoked us with (npm_config_user_agent). */
export function detectPackageManager() {
  const agent = process.env.npm_config_user_agent ?? '';
  for (const pm of ['pnpm', 'yarn', 'bun']) {
    if (agent.startsWith(pm)) return pm;
  }
  return 'npm';
}

/** Docker is only "available" if the daemon actually answers, not just the CLI. */
export function hasDocker() {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

/**
 * Captured output has to be uncapped.
 *
 * execFileSync's default maxBuffer is 1 MB. An install that builds a native
 * addon (better-sqlite3 runs node-gyp) prints well past that, and when the cap
 * is hit Node does not merely truncate — it kills the child with ENOBUFS. The
 * install dies half-written, `lattice` reports "install failed", and the user is
 * left with a node_modules that is missing packages the tests need. Capturing
 * output at all is only worth doing if the capture cannot break the thing it is
 * watching.
 */
const NO_OUTPUT_CAP = 1024 * 1024 * 1024;

/**
 * @returns {{ ok: boolean, error?: string }}
 */
export function install(target, packageManager, capture) {
  try {
    execFileSync(packageManager, ['install'], {
      cwd: target,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: 'utf8',
      maxBuffer: NO_OUTPUT_CAP,
    });
    return { ok: true };
  } catch (error) {
    /*
     * A failed install is recoverable — the project is still on disk and the
     * user can run the install themselves — so report it, never throw.
     */
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail.split('\n').slice(-4).join('\n') || error.message };
  }
}

/**
 * Fetch a Maven project's dependencies, using the wrapper the template ships.
 *
 * `./mvnw` rather than `mvn`, so a globally installed Maven is neither required
 * nor used — the wrapper downloads the exact Maven the project asks for. Only a
 * JDK has to be present, and checkToolchain has already established that it is.
 *
 * `test-compile` and not `dependency:go-offline`, which is the goal built for
 * exactly this and cannot be relied on to do it. go-offline resolves through the
 * dependency plugin's own path, and against an already-populated `~/.m2` that
 * path throws:
 *
 *   java.nio.file.AccessDeniedException: ~/.m2/repository/org/checkerframework/…
 *
 * Reproduced both ways rather than assumed: with a clean `-Dmaven.repo.local`
 * it succeeds, and against a real developer's existing repository it fails —
 * which is the machine every user is actually on. `test-compile` goes through
 * Maven's ordinary resolution and works in both.
 *
 * It also earns the extra few seconds. Resolving downloads the dependencies;
 * compiling proves they are the right ones and that the project builds, so
 * `./mvnw spring-boot:run` is warm and already known to work. `-DskipTests`
 * keeps it to that — running the suite is the user's call, not a scaffolder's.
 */
export function installMaven(target, capture) {
  const wrapper = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';

  if (!fs.existsSync(path.join(target, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'))) {
    return { ok: false, error: 'the project has no Maven wrapper' };
  }

  try {
    execFileSync(wrapper, ['-B', '-q', '-DskipTests', 'test-compile'], {
      cwd: target,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: 'utf8',
      maxBuffer: NO_OUTPUT_CAP,
      timeout: 15 * 60 * 1000,
    });
    return { ok: true };
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail.split('\n').slice(-4).join('\n') || error.message };
  }
}

/** Where a virtual environment keeps its executables, which differs on Windows. */
function venvBin(target, name) {
  return process.platform === 'win32'
    ? path.join(target, '.venv', 'Scripts', `${name}.exe`)
    : path.join(target, '.venv', 'bin', name);
}

/**
 * Create the project's virtual environment and install into it.
 *
 * This used to be refused on the grounds that Python has no one obvious package
 * manager — pip, pipx, poetry, uv and conda are all normal, and guessing wrong
 * puts packages somewhere nobody wanted. That reasoning was about the *machine*,
 * and it is still right about the machine. It was never right about `.venv`.
 *
 * A virtual environment inside the project directory is not a guess about
 * anyone's toolchain. It is a directory in the project, made with the standard
 * library's own `venv` module, deleted by deleting the project. Nothing outside
 * the project is touched, which is precisely why this one is safe to do and
 * `pip install --user` would not be.
 *
 * An existing `.venv` is reused rather than rebuilt. Someone who has already set
 * one up — with uv, with a different interpreter, with extra packages in it — has
 * expressed a preference, and blowing it away to assert ours would be the exact
 * overreach this function is otherwise avoiding.
 */
export function installPython(target, python, capture) {
  const stdio = capture ? ['ignore', 'pipe', 'pipe'] : 'inherit';
  const reused = fs.existsSync(path.join(target, '.venv'));

  /*
   * requirements-dev.txt is the one to want: it installs the runtime
   * requirements plus the test tooling, so `pytest` works without a second step.
   */
  const requirements = ['requirements-dev.txt', 'requirements.txt'].find((name) =>
    fs.existsSync(path.join(target, name)),
  );
  if (!requirements) return { ok: false, error: 'the project has no requirements file' };

  try {
    if (!reused) {
      execFileSync(python, ['-m', 'venv', '.venv'], {
        cwd: target,
        stdio,
        encoding: 'utf8',
        maxBuffer: NO_OUTPUT_CAP,
        timeout: 5 * 60 * 1000,
      });
    }

    const pip = venvBin(target, 'pip');
    if (!fs.existsSync(pip)) {
      return {
        ok: false,
        error: reused
          ? 'the existing .venv has no pip — remove it and run the steps below'
          : 'python -m venv produced no pip (is the venv module installed?)',
      };
    }

    execFileSync(pip, ['install', '-r', requirements], {
      cwd: target,
      stdio,
      encoding: 'utf8',
      maxBuffer: NO_OUTPUT_CAP,
      timeout: 20 * 60 * 1000,
    });

    return { ok: true, reused, requirements };
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail.split('\n').slice(-4).join('\n') || error.message };
  }
}

/**
 * Does the storage driver this project chose actually load?
 *
 * `npm install` exiting 0 is not the same as a working project, and for a native
 * addon the two came apart badly. better-sqlite3 compiles a binding at install
 * time; when lattice ran the install, npm reported success and produced no
 * binding at all, so every scaffolded SQLite project failed on its first command:
 *
 *   Error: Could not locate the bindings file
 *
 * The install script simply did not run. It runs when the same `npm install` is
 * typed in a shell, in the same directory, with the same environment — reproduced
 * both ways, repeatedly. Rather than keep guessing at npm's reasoning, this asks
 * the only question that matters: can the project load its driver? A require() in
 * the project's own context answers it in about fifty milliseconds and cannot be
 * fooled by an exit code.
 *
 * Pure-JavaScript drivers are checked too. They cost nothing to check and a
 * missing package is worth catching for the same reason.
 */
export function driverLoads(target, smoke) {
  if (!smoke) return true;

  const result = spawnSync(process.execPath, ['-e', smoke], {
    cwd: target,
    stdio: 'ignore',
    timeout: 60_000,
  });

  return result.status === 0;
}

/**
 * Repair a driver that installed but cannot load.
 *
 * `npm rebuild` re-runs the install scripts npm skipped, which is exactly the
 * missing step. It is attempted once and its success is re-verified rather than
 * assumed — the whole point of this pair of functions is that "the command
 * exited 0" is not evidence.
 */
export function repairDriver(target, driver, smoke, packageManager = 'npm') {
  spawnSync(packageManager, ['rebuild', driver], {
    cwd: target,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60 * 1000,
  });

  return driverLoads(target, smoke);
}

/**
 * `--wait` blocks until the service reports healthy, rather than merely started.
 * Without it the container is up but the database is still initialising, and the
 * very next thing the user runs (`npm test`, `npm run dev`) dies on a refused
 * connection — which looks like a broken scaffold rather than a slow container.
 * This is what the healthchecks in the compose file are for.
 */
export function startDatabase(target, timeoutSeconds = 90) {
  try {
    execFileSync(
      'docker',
      ['compose', 'up', '-d', '--wait', '--wait-timeout', String(timeoutSeconds), 'database'],
      {
        cwd: target,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: (timeoutSeconds + 15) * 1000,
        maxBuffer: NO_OUTPUT_CAP,
      },
    );
    return { ok: true };
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail.split('\n').slice(-3).join('\n') || error.message };
  }
}

// ------------------------------------------------------------ enterprise overlay

/**
 * Path segments renamed on the way out of the overlay. `_github` etc. are stored
 * dot-less so npm cannot mangle them in the published tarball (it rewrites a packed
 * `.gitignore` to `.npmignore`), then restored here.
 */
const OVERLAY_RENAME = new Map([
  ['_github', '.github'],
  ['_gitattributes', '.gitattributes'],
  ['_editorconfig', '.editorconfig'],
  ['_gitignore', '.gitignore'],
  ['_vscode', '.vscode'],
]);

const OVERLAY_BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2']);

/**
 * Which build tool owns this project, decided by what is actually on disk.
 *
 * Detected rather than declared, because by the time the overlay runs the project
 * exists — and the file that is there is the truth, whether it was written by a
 * lattice template or by `cargo new`. It also means a new language needs no entry
 * in any registry: ship its marker and its CI, and both paths pick it up.
 *
 * First match wins, so the order is most-specific first. A lattice fullstack project
 * has a pom.xml at the root and a package.json under client/ — only the root is
 * examined, so it is correctly a Maven project whose CI builds the whole thing.
 */
const TOOLCHAIN_MARKERS = [
  ['dotnet', (names) => names.some((n) => /\.(csproj|fsproj|sln)$/.test(n))],
  ['maven', (names) => names.includes('pom.xml')],
  ['gradle', (names) => names.some((n) => /^(build|settings)\.gradle(\.kts)?$/.test(n))],
  ['rust', (names) => names.includes('Cargo.toml')],
  ['go', (names) => names.includes('go.mod')],
  ['swift', (names) => names.includes('Package.swift')],
  ['dart', (names) => names.includes('pubspec.yaml')],
  /*
   * These two sit above node deliberately. A Laravel app ships a package.json for
   * Vite, and a Rails app ships one for jsbundling — both would be detected as Node
   * projects and handed an `npm ci` pipeline, which is the original bug wearing a
   * different hat. The composer.json / Gemfile is the one that names the real owner.
   */
  ['php', (names) => names.includes('composer.json')],
  ['ruby', (names) => names.includes('Gemfile')],
  ['python', (names) => ['pyproject.toml', 'requirements.txt', 'setup.py'].some((n) => names.includes(n))],
  ['node', (names) => names.includes('package.json')],
];

export function detectToolchain(target) {
  if (!fs.existsSync(target)) return null;
  const names = fs.readdirSync(target);
  return TOOLCHAIN_MARKERS.find(([, matches]) => matches(names))?.[0] ?? null;
}

/**
 * Overlay the enterprise skeleton onto a scaffolded project: community-health files,
 * CI, docs/adr, todo, organizational, badge-wall README.
 *
 * Applied in two layers. `overlays/enterprise/` is everything that is true of any
 * project in any language — LICENSE, SECURITY.md, the ADR directory, the Trivy scan.
 * `overlays/toolchain/<id>/` carries the two files that are emphatically *not*
 * language-neutral: ci.yml and dependabot.yml. Shipping one npm-flavoured pair to
 * every project is not a cosmetic wart — `npm ci` fails outright in a Go module, and
 * a `package-ecosystem: npm` entry makes Dependabot error on the repository, so
 * `--enterprise` was handing non-Node projects a red pipeline on their first push.
 *
 * A project whose toolchain is unrecognised still gets the universal layer; it just
 * gets no CI, which is the honest outcome — better than a workflow that cannot pass.
 *
 * README.md is overwritten on purpose — the badge-wall version replaces the plain
 * template one. Every other file is written only if absent, so the overlay never
 * clobbers something the template already shipped (its .gitignore, its package.json).
 */
export function overlayEnterprise(sourceDir, target, vars) {
  const written = [];

  /*
   * README.md is composed, not copied, so it is held back from the walk entirely and
   * written at the end — the directory table it contains has to describe the tree
   * *after* the overlay has added docs/, todo/ and organizational/, not before.
   */
  const HELD_BACK = new Set(['README.md']);

  /*
   * The toolchain is read before anything is written, so the marker it keys off is
   * the project's own (package.json, go.mod, pom.xml…) and never a file the overlay
   * has just added.
   */
  const toolchain = detectToolchain(target);

  const walk = (dir, relParts) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, entry.name);
      const renamed = OVERLAY_RENAME.get(entry.name) ?? entry.name;
      const nextRel = [...relParts, renamed];

      if (entry.isDirectory()) {
        walk(from, nextRel);
        continue;
      }

      const rel = nextRel.join('/');
      if (HELD_BACK.has(rel)) continue;

      const dest = path.join(target, ...nextRel);
      if (fs.existsSync(dest)) continue;

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (OVERLAY_BINARY.has(path.extname(from).toLowerCase())) {
        fs.copyFileSync(from, dest);
      } else {
        fs.writeFileSync(dest, render(fs.readFileSync(from, 'utf8'), vars));
      }
      written.push(rel);
    }
  };

  walk(sourceDir, []);

  /*
   * Layer two. `sourceDir` is overlays/enterprise, so its sibling holds the
   * toolchain layers; deriving the path keeps the caller passing one directory.
   */
  if (toolchain) {
    const toolchainDir = path.join(path.dirname(sourceDir), 'toolchain', toolchain);
    if (fs.existsSync(toolchainDir)) walk(toolchainDir, []);
  }

  /*
   * The README, last, with the tree it describes now complete. The template's own
   * README is kept below the header rather than overwritten — it is the only place
   * that documents this project's actual layout and the rules that hold it together.
   */
  const readmePath = path.join(target, 'README.md');
  const existing = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
  const header = render(fs.readFileSync(path.join(sourceDir, 'README.md'), 'utf8'), {
    ...vars,
    quickStart: quickStartFor(toolchain).join('\n'),
    directoryTable: buildDirectoryTable(target, fs, path),
  });
  fs.writeFileSync(readmePath, composeReadme(header, existing));
  written.push('README.md');

  return { files: written, toolchain };
}

// ------------------------------------------------------------ external generators

/**
 * Is a binary on PATH?
 *
 * Scanning PATH by hand rather than shelling out to `which`, for two reasons: there
 * is no `which` on Windows (it is `where`), and the CLI is tested on Windows — so the
 * spawn version reported *every* generator as missing there. Reading the directories
 * also avoids spawning a process per lookup on the cold path.
 *
 * On Windows a bare `ng` is resolved through PATHEXT to `ng.cmd`/`ng.exe`; POSIX has
 * no such notion, so the extension list is just the empty string there. X_OK is
 * ignored by Windows (it degrades to "does this exist"), which is the check we want
 * on that platform anyway.
 */
function hasBinary(bin) {
  const extensions =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)]
      : [''];

  const executable = (candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  if (bin.includes('/') || bin.includes('\\')) {
    return extensions.some((ext) => executable(path.resolve(bin + ext)));
  }

  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => extensions.some((ext) => executable(path.join(dir, bin + ext))));
}

/**
 * Run an external generator (create-vite, ng, cargo, …) to produce the base project.
 *
 * Fails loudly and early if the required tool is not installed — the whole reason
 * these are gated is that lattice cannot promise `dotnet` or `cargo` exists, and a
 * clear "install X" beats a cryptic spawn error. Most generators create `name/`
 * inside cwd; a few (go mod init) run *inside* an already-made project dir, flagged
 * with `inProjectDir`.
 */
export function runGenerator(generator, name, cwd) {
  if (!hasBinary(generator.requires)) {
    throw new Error(
      `The "${generator.id}" generator needs \`${generator.requires}\`, which is not installed.\n` +
        `  Install it and try again, or use a built-in stack (see --list).`,
    );
  }

  let runCwd = cwd;
  if (generator.inProjectDir) {
    runCwd = path.join(cwd, name);
    fs.mkdirSync(runCwd, { recursive: true });
  }

  const result = spawnSync(generator.bin, generator.argv(name), {
    cwd: runCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
    maxBuffer: NO_OUTPUT_CAP,
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${generator.bin} exited with ${result.status ?? 'a signal'}.\n` +
        (detail ? `  ${detail.split('\n').slice(-4).join('\n  ')}` : ''),
    );
  }

  const projectDir = path.join(cwd, name);
  if (!fs.existsSync(projectDir)) {
    throw new Error(`${generator.bin} ran but produced no "${name}" directory.`);
  }
  return projectDir;
}
