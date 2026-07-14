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
- **CI scaffolds real projects and runs *their* suites**, across six storages and
  two backends. A scaffolder cannot be tested by testing the scaffolder.

### Fixed

- The CLI told you to run `docker compose up -d db`, but the service it generates
  is named `database` — the command it printed errored out. It also pointed at
  `src/db/` after that directory had been renamed. Both were user-facing, and
  both shipped green, because the test guarding the spelling only looked at the
  templates and never at the scaffolder itself. It looks at both now.

[Unreleased]: https://github.com/Wolfi-OwO/lattice/commits/main
