/**
 * Generation is all-or-nothing.
 *
 * Every file a scaffold writes goes into a staging directory first, and the
 * project only appears at its real path once generation has finished. If anything
 * fails on the way — an unreadable template, a full disk, a Ctrl-C — the staging
 * directory is removed and the working directory is exactly as it was.
 *
 * The failure this prevents is not hypothetical. Writing straight to the target
 * meant a failure partway through left a half-written project on disk, and the
 * next attempt then refused to run at all, because `isEmptyDir` correctly saw a
 * non-empty directory and demanded `--force`. So one transient error cost you both
 * the scaffold and the obvious retry, and the recovery was to delete a directory
 * by hand and hope nothing else of yours was in it.
 *
 * Staging is a sibling of the target rather than a system temp directory, because
 * `rename()` is only atomic within one filesystem — /tmp is frequently a different
 * mount, and a cross-device rename fails with EXDEV. A sibling is guaranteed to be
 * on the same device as the thing it is about to become.
 *
 * What is deliberately *outside* the transaction: installing dependencies and
 * starting the database. Both run against the committed project, and both are
 * already recoverable by design — the CLI reports the failure and tells you what
 * to run yourself, because a failed `npm install` does not make the generated code
 * wrong. Rolling a project back because a registry was briefly down would destroy
 * work that is entirely valid.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Anything staged but never committed, so an interrupt cannot leak a directory. */
const pending = new Set();

let interruptHooked = false;

/**
 * Ctrl-C during generation would otherwise leave a staging directory behind. The
 * default SIGINT behaviour is restored after cleaning up rather than swallowed:
 * a process that ignores the first interrupt is worse than one that leaks a file.
 */
function hookInterrupt() {
  if (interruptHooked) return;
  interruptHooked = true;

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      for (const dir of pending) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Best effort. Exiting matters more than the directory.
        }
      }
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

/**
 * Open a generation transaction for `target`.
 *
 * Write everything to the returned `path`, then `commit()`. On any failure call
 * `rollback()` — or let the interrupt handler do it.
 */
export function beginGeneration(target) {
  const parent = path.dirname(target);
  const staging = path.join(parent, `.lattice-staging-${path.basename(target)}-${process.pid}`);

  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging);

  pending.add(staging);
  hookInterrupt();

  let settled = false;

  return {
    path: staging,

    /**
     * Move the finished project to its real path.
     *
     * The empty-target case is a rename: atomic, so the project either exists
     * complete or not at all, with no window where a watcher sees half of it.
     *
     * `--force` into a directory that already has content cannot be a rename —
     * rename would need the target gone, and deleting whatever is already there is
     * precisely what a scaffolder must never do. So that case copies in on top.
     * It loses atomicity at the final step and keeps the property that matters:
     * nothing is written anywhere until generation has fully succeeded.
     */
    commit() {
      if (settled) throw new Error('this generation has already been settled');
      settled = true;
      pending.delete(staging);

      const targetExists = fs.existsSync(target);
      const targetEmpty = targetExists && fs.readdirSync(target).length === 0;

      if (!targetExists || targetEmpty) {
        if (targetEmpty) fs.rmdirSync(target);
        fs.renameSync(staging, target);
        return;
      }

      copyOver(staging, target);
      fs.rmSync(staging, { recursive: true, force: true });
    },

    /** Remove everything staged. The working directory is untouched. */
    rollback() {
      if (settled) return;
      settled = true;
      pending.delete(staging);
      fs.rmSync(staging, { recursive: true, force: true });
    },
  };
}

/** Recursive copy, overwriting. Used only for the `--force` commit path. */
function copyOver(from, to) {
  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);

    if (entry.isDirectory()) {
      copyOver(source, destination);
    } else {
      fs.copyFileSync(source, destination);
    }
  }
}
