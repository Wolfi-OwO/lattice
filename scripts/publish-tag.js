#!/usr/bin/env node
/**
 * Which npm dist-tag a version should be published under.
 *
 * Normally the answer is `latest` and npm works this out itself. The exception is
 * publishing a version *lower* than one already on the registry, where npm refuses
 * outright rather than guess:
 *
 *   Cannot implicitly apply the "latest" tag because previously published
 *   version 1.0.0 is higher than the new version 0.0.1.
 *
 * That is the situation this package is in. Versioning restarted at 0.0.1 while an
 * orphaned 1.0.0 remains on the registry — it is outside npm's 72-hour unpublish
 * window and above the 300-download exemption, so only npm support can remove it.
 * Until they do, publishing has to name a tag explicitly and then move `latest`
 * onto the new version afterwards.
 *
 * The comparison lives here rather than inline in the workflow because it is real
 * logic with a real failure mode: getting it wrong means either a refused publish,
 * or `latest` silently left pointing at code from before the restart, which is
 * worse — every `npm create lattice@latest` would quietly serve the old scaffolder.
 *
 * This becomes a no-op the moment 1.0.0 is gone: with nothing higher on the
 * registry the answer is `latest`, the workflow publishes normally, and this file
 * can be deleted.
 *
 *   --version X.Y.Z    prints the tag to publish under: `latest`, or `previous`
 *                      when a higher version already exists
 */

import { execFileSync } from 'node:child_process';

const PACKAGE = 'create-lattice';

/** The tag used when `latest` cannot be applied implicitly. */
const FALLBACK_TAG = 'previous';

/** Numeric semver compare. Prerelease suffixes are not used by this package. */
function compare(a, b) {
  const parse = (v) => String(v).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

/** The registry's current `latest`, or null when the package is unpublished. */
export function currentLatest(run = execFileSync) {
  try {
    return run('npm', ['view', PACKAGE, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim() || null;
  } catch {
    /*
     * A package that has never been published, or a registry that cannot be
     * reached. Either way there is nothing higher to collide with; npm itself
     * will fail loudly later if the registry is genuinely unreachable.
     */
    return null;
  }
}

export function tagFor(version, latest) {
  if (!latest) return 'latest';
  return compare(version, latest) < 0 ? FALLBACK_TAG : 'latest';
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--version');
if (at !== -1) {
  const version = argv[at + 1];
  if (!version) {
    console.error('usage: publish-tag.js --version X.Y.Z');
    process.exit(2);
  }
  console.log(tagFor(version, currentLatest()));
}
