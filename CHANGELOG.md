# Changelog

Every notable change to lattice, newest first. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions are
[semantic](https://semver.org/spec/v2.0.0.html).

**Write your changes under `## [Unreleased]` as you make them**, not at release
time — by then nobody remembers what changed, and a release with no notes is a
release nobody can review. The **Prepare release** workflow moves that section
under the new version number and stamps it with the date, leaving `[Unreleased]`
empty for the next change, and opens a pull request for you to review. A release
whose `[Unreleased]` section is empty is refused before any of that happens.

## [Unreleased]

### Added

- **`--generator <id>`** — scaffold with a framework's own official tool instead of
  a built-in stack. 28 of them: every `create-vite` template, Next, Nuxt, SvelteKit,
  Astro, React Router, Vue, Expo, Angular, three .NET project types, Cargo, Go,
  Laravel, Rails, Dart, Flutter and Swift. Opt-in on purpose — it needs the network,
  it needs that toolchain installed, and its output is whatever upstream ships today
  rather than something lattice verified. The built-in stacks remain the default and
  the thing that is promised to boot. `--list` shows them; ADR-0003 explains the
  tiers.
- **`--enterprise`** — overlay the scaffolding a repository needs once more than one
  person works on it: `docs/adr/`, `todo/`, `organizational/`, community-health
  files, a Trivy security scan, a release workflow, and CI. The project's own README
  is kept and composed under a badge header rather than replaced, and a directory
  table is generated from the tree — including a column for what must *never* go in
  each directory, which is the half that stops a layout from rotting.
- **CI matched to the project's build tool.** `--enterprise` detects what a project
  is built with — `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, `build.gradle`,
  `pyproject.toml`, `composer.json`, `Gemfile`, `Package.swift`, `pubspec.yaml` or a
  `.csproj` — and writes the matching `ci.yml` and `dependabot.yml`. Eleven
  toolchains. A Go module gets `go test`, a Maven project `mvn -B verify`, a Rails
  app `bin/rails test`. A project whose build tool is unrecognised gets everything
  except the CI, which is better than a workflow that cannot pass.
- **`--owner <name>`** — the GitHub owner or organisation that fills the badge and
  link slots in the enterprise overlay.
- **`.github/workflows/generators.yml`** — scaffolds all 28 delegations, installs
  and builds each, and asserts every one received the CI of its own build tool. The
  argv for these are claims about *other people's* CLIs, and nothing but running
  them can tell you when one goes stale. It earned this on its first run: Remix v2
  had been upstreamed into React Router and `create-remix` no longer created
  anything.

### Changed

- **Releasing is now two steps, and nothing writes to `main` during one.** The
  version bump and changelog cut happen in a reviewed pull request opened by the new
  **Prepare release** workflow; publishing then only verifies and publishes, with
  `contents: read`. Previously the version commit landed *after* `npm publish`, so a
  failure in that final step would leave a version on a registry that never forgets
  and no record of it here. `npm publish` also now waits for a human approval on the
  `production` environment. See *Releasing* in the README.

- **`lattice doctor [path]`** — score a project's structure and hygiene, offline.
  It grades a tree 0–100 across structure, hygiene, testing, CI/CD, containerization,
  observability and security, and lists what to fix most-load-bearing-first with the
  *why* and the *fix*. Deterministic and local by design — no network, no model — so
  it stays a scaffolder, not a service. The checks encode the bar these repositories
  already hold themselves to. `--strict` exits non-zero below 60 so it can gate CI.
- **A leveled logger** (`src/logger.js`) modeled on the Winston format used across
  the author's services: level from `LATTICE_LOG_LEVEL` / `LOG_LEVEL`, colourized
  `timestamp level: message`, stacks on errors. Diagnostics go to **stderr** (so
  `--verbose` never contaminates stdout); the user-facing progress stays as it was.
- **`--verbose`** turns on debug diagnostics for a run.
- **Project hygiene to match the rest of the author's repositories** — `ARCHITECTURE.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `.editorconfig`, `.github/CODEOWNERS`, and
  `docs/adr/` with the first two decision records (zero-dependency core; why lattice
  is a library, not an enterprise-layered app). `lattice doctor` scores itself 100
  now — it did not before, and it said so.

## [1.0.0] - 2026-07-15

### Added

- **Fastify backend template.** The same six storage adapters and the same
  repository seam as Express, so `--stack fastify --database postgres` gets you a
  schema-first API whose generated suite is green on all six.
- **`database/` demo data in every backend.** One file per domain, an idempotent
  loader that goes through the repository rather than a driver, and a
  `database:seed` script that means the same thing in every language.
- **`CONVENTIONS.md`** — the rules every template obeys, and the reason the
  templates read like one product instead of twenty personal styles.
- **The conventions are tests now, not prose.** `tests/registry.test.js` asserts
  the user shape, the demo-data layout, the frontend dependency rules and the
  storage spelling, so a template that drifts fails the build instead of being
  noticed a year later.

### Changed

- **The storage seam is spelled `database` everywhere** — `src/database/`, not
  `src/db/`. One word for one concept, in every language and every template.
- **The health probes are spelled out**: `/api/health/liveness` and
  `/api/health/readiness`, replacing `/live` and `/ready`. Rule 1 applies to URLs
  too, and Spring Boot's Actuator already served the long names — the other three
  backends were the ones out of step.
- **Fastify drains through terminus**, like Express, instead of a hand-rolled
  `process.once('SIGTERM')` handler that flipped a flag a route read. Readiness
  now lives on the http.Server *underneath* Fastify, which is the only place it
  can answer 503 from the instant a signal lands while the app above goes on
  serving the requests already in flight.
- **Every backend now drains the same way, in every language.** Terminus was only
  ever the JavaScript spelling of it; the behaviour is the contract:

  | | Mechanism |
  | --- | --- |
  | Express, Fastify | `@godaddy/terminus` — readiness on the http.Server, below the framework |
  | Spring Boot | `ReadinessDrainLifecycle`, a `SmartLifecycle` that stops before the web server does |
  | FastAPI | `app/core/lifecycle.py`, which intercepts uvicorn's signal handler |

  `server.shutdown: graceful` alone was *not* enough for Spring, which is worth
  writing down because the name suggests it is: it stops accepting new connections
  immediately, so readiness does not go to 503 — it becomes unreachable, and a load
  balancer that is still routing to this instance gets connections refused rather
  than drained. The new lifecycle bean buys the window back.

  All three were drained under a real SIGTERM against a real booted server, not
  asserted: readiness flips to 503 while liveness stays 200, in-flight requests
  finish, then the process exits.
- **CI scaffolds real projects and runs *their* suites**, across six storages and
  two backends. A scaffolder cannot be tested by testing the scaffolder.

### Fixed

- **Two Postgres races that only a parallel test runner could find.** `node:test`
  runs test files in a process each, so two processes booted the app against a
  fresh database at once, and both `CREATE DATABASE` and `CREATE TABLE IF NOT
  EXISTS` turned out to be check-then-act races — the second one despite its name.
  The losers died on `pg_database_datname_index` and `pg_type_typname_nsp_index`,
  neither of which mentions the thing that actually collided. Creating the database
  now tries and forgives, and the schema is created under an advisory lock, which
  are the only forms of each that are atomic. It failed roughly one CI run in two;
  it now survives a fresh database six times out of six. Fixed in Express as well
  as Fastify: Mocha's sequential files hid it there, but the adapter is what has to
  be right, not the runner that happens to hide it.
- **The Spring Boot template could not start.** Flyway 10 (which Spring Boot 3.3
  manages) moved per-database support out of `flyway-core` into separate modules, so
  with only `flyway-core` on the classpath it connects, throws `Unsupported Database:
  PostgreSQL`, and dies during context initialisation. `mvn spring-boot:run` — the
  command the CLI prints as your next step — crashed, while `mvn test` passed,
  because the test profile runs H2 with `flyway.enabled=false` and never executes a
  migration at all. A green suite on top of an application that does not boot is the
  exact failure this project exists to prevent, so CI now boots the template against
  a real PostgreSQL and probes it, rather than trusting the tests.
- **SQLite could not be opened by two processes at once.** `busy_timeout` was missing,
  and adding it was necessary but not sufficient: `PRAGMA journal_mode = WAL` needs an
  exclusive lock and SQLite does not run the busy handler for it, so it fails
  instantly regardless. It is set once now, by whoever gets there first.
- A failed `before` hook in the Fastify template reported `Cannot read properties
  of undefined (reading 'close')` from its teardown, burying the error that
  actually caused it.

- The CLI told you to run `docker compose up -d db`, but the service it generates
  is named `database` — the command it printed errored out. It also pointed at
  `src/db/` after that directory had been renamed. Both were user-facing, and
  both shipped green, because the test guarding the spelling only looked at the
  templates and never at the scaffolder itself. It looks at both now.

[Unreleased]: https://github.com/Wolfi-OwO/lattice/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Wolfi-OwO/lattice/releases/tag/v1.0.0
