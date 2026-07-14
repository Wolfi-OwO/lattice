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
    // A failed install is recoverable — the project is still on disk and the
    // user can run the install themselves — so report it, never throw.
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, error: detail.split('\n').slice(-4).join('\n') || error.message };
  }
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
