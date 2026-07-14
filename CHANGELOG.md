# Changelog

Every notable change to lattice, newest first. The format is
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions are
[semantic](https://semver.org/spec/v2.0.0.html).

**Write your changes under `## [Unreleased]` as you make them**, not at release
time — by then nobody remembers what changed, and a release with no notes is a
release nobody can review. Publishing a GitHub Release moves that section under
the new version number and stamps it with the date; the `[Unreleased]` heading is
put back empty for the next change. Nothing about that is manual, and a release
whose `[Unreleased]` section is empty is refused before it can reach npm.

## [Unreleased]

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
  serving the requests already in flight. Verified against a real booted server:
  readiness flips to 503 under SIGTERM while liveness stays 200, then the process
  exits cleanly.
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
- A failed `before` hook in the Fastify template reported `Cannot read properties
  of undefined (reading 'close')` from its teardown, burying the error that
  actually caused it.

- The CLI told you to run `docker compose up -d db`, but the service it generates
  is named `database` — the command it printed errored out. It also pointed at
  `src/db/` after that directory had been renamed. Both were user-facing, and
  both shipped green, because the test guarding the spelling only looked at the
  templates and never at the scaffolder itself. It looks at both now.

[Unreleased]: https://github.com/Wolfi-OwO/lattice/commits/main
