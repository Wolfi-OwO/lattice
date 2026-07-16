# ADR-0001 — The scaffolder core ships zero runtime dependencies

## Status

Accepted.

## Context

`create-lattice` is run through `npm create lattice@latest`, which downloads and
executes the package before doing anything. Every dependency the scaffolder carries
is downloaded, resolved, and loaded on that cold path, in front of a user who has
not yet seen a single prompt. Dependencies also rot: a template scaffolder that
pins `psycopg==3.2.1` becomes uninstallable the week that version yanks a wheel —
this already happened once and is why the Python templates pin floors, not exacts.

There is real temptation to add libraries: an argument parser, a prompt library, a
colour library, a logger. Each is small. Together they are the difference between a
tool that starts instantly and one that does not.

## Decision

The scaffolder — everything under `bin/` and `src/` — has **no runtime
dependencies**, and avoids dev dependencies too (tests run on `node --test`).
Argument parsing, prompts, colours, and logging are each a small purpose-built
module rather than a package.

Libraries belong in the **templates** (`stacks/`), where they are the generated
project's dependencies, installed into the generated project, and never loaded by
the CLI.

## Consequences

- **Easier:** instant cold start; nothing to audit for CVEs in the CLI itself; no
  supply-chain surface on the tool that scaffolds other people's projects; no
  dependency bumps to chase.
- **Harder:** we re-implement small conveniences (the ~40-line arg parser, the
  prompt/colour helpers, the leveled logger in `src/logger.js`). This is a real
  cost and it is accepted — each is small, well-tested, and boring by design.
- **Enforced by:** `tests/registry.test.js` asserts no lockfile or dependency creeps
  into templates incorrectly, and this rule is stated in CONTRIBUTING.md so a PR that
  adds a runtime dependency is a known non-starter.

The one place this is felt is logging: the author's other services use Winston with
Azure Application Insights. Those are long-lived servers where structured transports
earn their weight; this is a process that runs for two seconds. `src/logger.js`
keeps Winston's *format* and drops the *framework* — the right trade for this shape
of program.
