# Contributing to lattice

Thanks for helping. This project has one unusual rule that shapes everything else,
so it comes first.

## The one hard rule: zero runtime dependencies

`create-lattice` has **no runtime dependencies**, and that is a feature, not an
oversight — it is why `npm create lattice@latest` starts instantly. A pull request
that adds a runtime dependency to the scaffolder will be declined. If you reach for
a library, you have almost certainly found something that belongs in a *template*
(under `stacks/`), not in the CLI. See [ADR-0001](docs/adr/0001-zero-dependency-core.md).

Dev dependencies are also avoided: tests run on `node --test`, with nothing to
install first.

## Getting set up

```bash
git clone https://github.com/Wolfi-OwO/lattice
cd lattice
npm test        # no install step — there is nothing to install
```

Node 20+ is required (`engines` in package.json).

## The layout

| Path | What it is |
| --- | --- |
| `bin/lattice.js` | the CLI entry point and command dispatch |
| `src/` | the scaffolder's own code — arg parsing, the registry, the storage seam, rendering, the logger, `doctor` |
| `stacks/` | the templates themselves, one folder per stack |
| `tests/` | the suite; conventions are enforced here, not just documented |
| `scripts/` | release tooling (the changelog cutter) |
| `docs/adr/` | the decisions worth remembering, and why |

`ARCHITECTURE.md` explains *why* it is shaped this way, including why it is
deliberately not an "enterprise-layered" application.

## The conventions are tests

Read [`CONVENTIONS.md`](CONVENTIONS.md). It is not aspirational — `tests/registry.test.js`
turns those rules into assertions, so a template that drifts fails the build. The
most-broken one, historically: the storage layer is spelled **`database`**, never
`db`, everywhere. If you add a template, it must obey the conventions or the suite
goes red.

## Adding a template

1. Add the files under `stacks/<category>/<language>/<framework>/`.
2. Register it in `src/registry.js`.
3. It must ship: a README, a one-command test suite that passes on a clean clone,
   a `.gitignore` (as `_gitignore`), health probes if it is a server, and a
   `database/` directory if it has a database. See CONVENTIONS.md §9.

## Before you open a PR

```bash
npm test                    # the whole suite, including the convention checks
node bin/lattice.js doctor  # score your working tree; aim not to lower it
```

Write the *why* in commit messages and comments — a comment states a constraint the
code cannot (a library trap, a load-bearing ordering), never what the next line does.
See CONVENTIONS.md §10.

## Releasing (maintainers)

Add your changes under `## [Unreleased]` in `CHANGELOG.md` as you go. Publishing a
GitHub Release with tag `vX.Y.Z` does the rest — the workflow cuts the changelog,
publishes to npm via OIDC trusted publishing (no token), and records it on `main`.
See the header of `.github/workflows/release.yml`.
