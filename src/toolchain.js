/**
 * What is already on this machine, and is it new enough?
 *
 * lattice installs a project's *dependencies*. It does not install runtimes, and
 * this module is the reason it can tell the difference. Downloading a JDK or a
 * Python onto someone's machine is not a scaffolder's business: it changes the
 * system rather than the directory, it needs a package manager lattice would have
 * to guess at, and the guess is wrong often enough that the failure mode is a
 * second Python nobody wanted.
 *
 * So the runtime is *detected*. If it is there and new enough, the dependencies
 * are installed and the project really does run on the first command. If it is
 * missing or too old, that is said plainly — with the version found and the
 * version needed — and the project is still on disk, still complete, still
 * exactly what the printed steps describe.
 *
 * The floors are read out of the templates rather than restated here. A pom that
 * says `<java.version>17</java.version>` is the truth about what that project
 * needs; a copy of "17" in this file is a second truth waiting to disagree with
 * it. tests/toolchain.test.js fails if any template stops declaring one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Run a version probe. Never throws — a missing command is an answer, not an error. */
function probe(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) return null;
  /*
   * `java -version` writes to stderr. `python --version` used to. Read both and
   * let the caller's pattern decide, rather than betting on which stream.
   */
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

/**
 * The installed JDK.
 *
 * Java's version string has two eras: `1.8.0_402` for 8 and below, `17.0.19` for
 * 9 and up. Both are parsed, because reporting "Java 1 is too old" to someone on
 * Java 8 would be true and useless.
 */
export function detectJava() {
  const raw = probe('java', ['-version']);
  if (!raw) return { present: false };

  const version = raw.match(/version "([^"]+)"/)?.[1];
  if (!version) return { present: true, major: null, version: raw.split('\n')[0] };

  const [first, second] = version.split('.');
  const major = first === '1' ? Number(second) : Number.parseInt(first, 10);

  return { present: true, major: Number.isFinite(major) ? major : null, version };
}

/**
 * The installed Python.
 *
 * `python3` first: on macOS and most Linux distributions a bare `python` is
 * either absent or still Python 2, and finding Python 2 here would produce a
 * venv that cannot install anything in the project.
 */
export function detectPython() {
  for (const command of ['python3', 'python']) {
    const raw = probe(command, ['--version']);
    if (!raw) continue;

    const version = raw.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!version) continue;

    const major = Number(version[1]);
    const minor = Number(version[2]);
    if (major < 3) continue; // Python 2 is not a candidate for anything here.

    return { present: true, command, major, minor, version: `${major}.${minor}` };
  }

  return { present: false };
}

/** Is `found` at least `required`? Both are [major, minor]. */
export function meets(found, required) {
  if (!found || found[0] == null) return false;
  if (found[0] !== required[0]) return found[0] > required[0];
  return (found[1] ?? 0) >= (required[1] ?? 0);
}

/**
 * The Java version a Maven project declares.
 *
 * Both spellings are accepted because both are in use here: Spring Boot's parent
 * pom reads `<java.version>`, and the JavaFX template sets
 * `<maven.compiler.release>` directly.
 */
export function requiredJava(projectDir) {
  const pom = path.join(projectDir, 'pom.xml');
  if (!fs.existsSync(pom)) return null;

  const text = fs.readFileSync(pom, 'utf8');
  const declared =
    text.match(/<java\.version>\s*(\d+)\s*<\/java\.version>/)?.[1] ??
    text.match(/<maven\.compiler\.release>\s*(\d+)\s*<\/maven\.compiler\.release>/)?.[1];

  return declared ? [Number(declared), 0] : null;
}

/** The Python version a project declares, from `requires-python = ">=3.12"`. */
export function requiredPython(projectDir) {
  const pyproject = path.join(projectDir, 'pyproject.toml');
  if (!fs.existsSync(pyproject)) return null;

  const declared = fs
    .readFileSync(pyproject, 'utf8')
    .match(/requires-python\s*=\s*["']\s*>=\s*(\d+)\.(\d+)/);

  return declared ? [Number(declared[1]), Number(declared[2])] : null;
}

/**
 * Can this project's dependencies be installed here, and if not, why not?
 *
 * Returns `{ ok: true, … }` or `{ ok: false, reason }`, where `reason` is a
 * sentence a user can act on rather than a code to look up.
 */
export function checkToolchain(installer, projectDir) {
  if (installer === 'maven') {
    const required = requiredJava(projectDir);
    const java = detectJava();

    if (!java.present) {
      return {
        ok: false,
        reason: `Java is not on PATH${required ? ` — this project needs ${required[0]} or newer` : ''}.`,
      };
    }
    if (required && !meets([java.major, 0], required)) {
      return {
        ok: false,
        reason: `Java ${java.version} is installed, but this project needs ${required[0]} or newer.`,
      };
    }
    /*
     * Maven itself is deliberately not checked. The template ships a wrapper, so
     * `./mvnw` downloads the Maven it wants — a globally installed one is neither
     * required nor used.
     */
    return { ok: true, using: `Java ${java.version}` };
  }

  if (installer === 'python') {
    const required = requiredPython(projectDir);
    const python = detectPython();

    if (!python.present) {
      return {
        ok: false,
        reason: `Python 3 is not on PATH${required ? ` — this project needs ${required.join('.')} or newer` : ''}.`,
      };
    }
    if (required && !meets([python.major, python.minor], required)) {
      return {
        ok: false,
        reason: `Python ${python.version} is installed, but this project needs ${required.join('.')} or newer.`,
      };
    }
    return { ok: true, using: `Python ${python.version}`, command: python.command };
  }

  return { ok: false, reason: `No auto-install is defined for the ${installer} toolchain.` };
}
