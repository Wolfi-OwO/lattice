# Architecture

This document is about the **scaffolder itself** — how `create-lattice` is built and
why. For how the *generated projects* are shaped, see [STRUCTURE.md](STRUCTURE.md);
for the rules every template obeys, see [CONVENTIONS.md](CONVENTIONS.md).

## What kind of program this is

lattice is a **single-purpose CLI library**, published to npm, run via
`npm create lattice@latest`. That framing decides everything below: it is optimized
for a fast cold start, a legible codebase, and zero supply-chain surface — not for
the layered architecture a long-lived service would want. See
[ADR-0002](docs/adr/0002-not-an-enterprise-layered-app.md).

## The shape

```
bin/lattice.js     entry point + command dispatch (scaffold | doctor)
src/
  args.js          argument parsing — declared flags, so a typo is an error
  prompts.js       zero-dependency select / text prompts + the colour palette
  registry.js      the template catalogue (category → language → framework)
  storage.js       the database catalogue — deps, env, compose, adapter per choice
  scaffold.js      copy templates + substitute variables
  setup.js         prune adapters, install, write .env, compose, find a free port
  logger.js        leveled diagnostics (Winston's format, no framework)
  doctor.js        offline project scoring — the "advisor" seed
stacks/            the templates themselves
tests/             the suite; conventions are enforced here, not just documented
scripts/           release tooling (the changelog cutter)
docs/adr/          decisions worth remembering
```

Each `src/` file is one concern with a clear seam. There is no `utils/` dumping
ground; `logger.js` and `prompts.js` are named for what they are.

## The two flows

**Scaffold** — the default verb:

```
parseArgs → resolveTemplate → resolveStorage → collect vars
          → copyTemplate (render) → pruneAdapters → writeEnv/writeCompose
          → install → startDatabase → print next steps
```

The load-bearing idea is the **storage seam**: templates talk to a six-method
repository (`src/database/` in the generated project), never to a driver, so the
same generated test suite passes against all six databases. The scaffolder keeps
exactly one adapter and deletes the rest. This is what makes "the database is a
choice, not a rewrite" true.

**Doctor** — `lattice doctor [path]`:

```
inspect(dir) → { dimensions[], overall, gaps[] }  →  renderReport()
```

`doctor` scores a project offline against mechanically-decidable conventions
(structure, hygiene, tests, CI, containerization, observability, security). It is
**deterministic and local by design** — it does not call a model or "research best
practices" over the network; a scaffolder that graded you by phoning home would
have stopped being a scaffolder. The checks encode the bar the author's own repos
already hold themselves to. `inspect` (data) is separated from `renderReport`
(presentation) so the scoring is unit-tested without asserting on colour codes.

## Cross-cutting decisions

- **Zero runtime dependencies** — [ADR-0001](docs/adr/0001-zero-dependency-core.md).
- **Logging is diagnostics, not UX.** The pretty progress (`✔ Scaffolded …`) is
  printed directly to stdout; `logger` writes leveled diagnostics to **stderr**, so
  `--verbose` never contaminates parseable output. Level comes from
  `LATTICE_LOG_LEVEL` / `LOG_LEVEL`, matching the generated templates and the
  author's services.
- **Conventions are executable.** `tests/registry.test.js` turns CONVENTIONS.md into
  assertions. A template that drifts fails CI rather than being noticed a year later.
- **Releases are tokenless.** Publishing is OIDC trusted publishing with provenance;
  there is no npm secret to store or rotate. See `.github/workflows/release.yml`.

## Where "enterprise" lives

Not in the CLI's structure — in three places that actually warrant it:

1. **The generated templates**: layering, health probes, graceful shutdown across
   every backend, Winston logging (with room to add Azure Application Insights).
2. **The engineering rigor**: CI that builds real projects, provenance, ADRs.
3. **`doctor`**: it *measures* projects against enterprise-grade conventions.

The advice is in the output and the process, not in over-architecting an 800-line
tool. That is the deliberate line this project draws.
