<div align="center">

# lattice

**Pick a stack, pick a database, get a project that already runs.**
A zero-dependency scaffolder whose output boots on the first command — no `npm install`, no `.env` to copy, no database to remember to start.

[![Unit](https://github.com/Wolfi-OwO/lattice/actions/workflows/unit.yml/badge.svg)](https://github.com/Wolfi-OwO/lattice/actions/workflows/unit.yml)
[![Storages](https://github.com/Wolfi-OwO/lattice/actions/workflows/storages.yml/badge.svg)](https://github.com/Wolfi-OwO/lattice/actions/workflows/storages.yml)
[![Templates · JavaScript](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-javascript.yml/badge.svg)](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-javascript.yml)
[![Templates · Java](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-java.yml/badge.svg)](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-java.yml)
[![Templates · Python](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-python.yml/badge.svg)](https://github.com/Wolfi-OwO/lattice/actions/workflows/templates-python.yml)

[![Documentation](https://github.com/Wolfi-OwO/lattice/actions/workflows/docs.yml/badge.svg)](https://wolfi-owo.github.io/lattice/)

[![npm](https://img.shields.io/npm/v/create-lattice?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-lattice)
[![npm downloads](https://img.shields.io/npm/dm/create-lattice?color=cb3837&label=downloads)](https://www.npmjs.com/package/create-lattice)
[![Release](https://img.shields.io/github/v/release/Wolfi-OwO/lattice?label=release&color=blue)](https://github.com/Wolfi-OwO/lattice/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)
![Repo views](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Wolfi-OwO/Wolfi-OwO/main/traffic/badges/lattice.json)

![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?logo=springboot&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin_+_Compose-7F52FF?logo=kotlin&logoColor=white)

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Open issues](https://img.shields.io/github/issues/Wolfi-OwO/lattice)](https://github.com/Wolfi-OwO/lattice/issues)
[![Contributors](https://img.shields.io/github/contributors/Wolfi-OwO/lattice)](https://github.com/Wolfi-OwO/lattice/graphs/contributors)

### 📖 [Read the documentation](https://wolfi-owo.github.io/lattice/)

</div>

```bash
npm create lattice@latest
```

```
◆ lattice · project scaffolder

?  Project name:            my-api
?  What are you building?   Backend / API
?  Language:                JavaScript
?  Framework:               Express (any database)
?  Database:                PostgreSQL

✔ Scaffolded my-api (35 files)
    stack     JavaScript · Express (any database)
    database  PostgreSQL · host port 5432
✔ Wired up (.env written, postgres adapter, compose file)
✔ Installed dependencies in my-api (npm)
✔ PostgreSQL is running (docker compose)

Next steps

  cd my-api
  npm run dev
```

That is the point: no `npm install`, no `cp .env.example .env`, no "remember to
start the database first". The project you land in **boots**.

## Choosing a database

The Express stack is storage-agnostic. The database is a choice made at scaffold
time, not a rewrite:

```bash
lattice my-api --stack express --database postgres
lattice my-api --stack express --database mongodb
lattice notes  --stack express --database file --format ndjson   # no database at all
lattice demo   --stack express --database memory                 # nothing persisted
```

Six options: **MongoDB · PostgreSQL · MySQL · SQLite · plain files · in-memory.**

`--database file` persists rows to disk as **JSON**, **NDJSON** or **YAML**. Writes are
atomic (temp file, then rename) and serialised through a queue, so a crash
mid-write cannot corrupt the file and two concurrent requests cannot clobber
each other's rows.

Every option implements the same six-method repository, so the routes, the
controllers, the services and **the test suite are identical** whichever you
pick. All eight combinations are verified green.

## Where the database lives

```
src/
  api/users/          routes → controller → service     (never touches a driver)
  database/
    index.js          the seam: database.users, connectDatabase(), ping()
    serialize.js      toPublicUser — the reason passwordHash cannot leak
    adapters/
      postgres.js     ← exactly one of these survives scaffolding
```

Everything above `src/database/` talks to `database.users` and imports no driver,
which is enforceable by grep: no `mongoose` / `pg` / `mysql2` import exists
anywhere outside `src/database/adapters/`. Swapping Postgres for Mongo is one
adapter file, and no service or controller changes.

Adding a seventh database is one entry in `src/storage.js` plus one adapter file.

## Commands

```bash
lattice [name] [options]

  --stack <id>          see --list
  --database <id>       mongodb | postgres | mysql | sqlite | file | memory
  --format <fmt>        json | ndjson | yaml    (only with --database file)
  --client <id>         frontend for a fullstack project, placed in client/
  --port <n>            backend port (default 3000)
  --generator <id>      scaffold with a framework's own tool instead of a stack
  --enterprise          add docs/adr, todo, CI, and community-health files
  --owner <name>        GitHub owner/org for the enterprise badges (default your-org)
  --no-install          skip dependency installation
  --no-database-start   do not "docker compose up -d database"
  --force               scaffold into a non-empty directory
  --list                show all stacks, databases and generators
  --version             print the version
```

### `--generator` — delegate to the real tool

The built-in stacks are the ones lattice promises will boot. For everything else,
`--generator` runs the framework's own official tool and then layers lattice's
overlay on top:

```bash
lattice web-app --generator vite-react --enterprise
lattice api     --generator dotnet-webapi --enterprise
lattice svc     --generator go --enterprise
```

This is opt-in on purpose, because it gives up three things the built-in stacks
guarantee: it needs the network, it needs that toolchain installed, and its output
is whatever the upstream tool ships today rather than something lattice verified.
`--list` shows every generator.

### Language coverage, and the two tiers

The tiers are not equal, and the difference is the point. A **built-in stack** is
held to [CONVENTIONS.md](CONVENTIONS.md) — the same `users` resource, the same error
envelope, drain behaviour verified with a real SIGTERM — and CI builds and tests it
on every push. That is expensive per language, which is why the list is short and
stays short. A **generator** delegates to the framework's own tool: broad, current,
and not verified by lattice.

| Language | Built-in stack | Generator |
| --- | --- | --- |
| JavaScript / TypeScript | `express`, `fastify`, `node-cli`, `react-vite`, `react-vite-ts` | Vite ×9, Next, Nuxt, SvelteKit, Astro, Remix, Vue, Expo |
| Java | `spring-boot`, `javafx` | — |
| Kotlin / Android | `android-compose` | — |
| Python | `fastapi`, `ml-project` | — |
| C# / .NET | — | `dotnet-webapi`, `dotnet-mvc`, `dotnet-blazor` |
| Go | — | `go` |
| Rust | — | `cargo`, `cargo-lib` |
| PHP | — | `laravel` |
| Ruby | — | `rails` |
| Dart / Flutter | — | `dart`, `flutter` |
| Swift | — | `swift` |
| C / C++ | — | — |

C and C++ have no official scaffolding tool to delegate to — there is no
`cargo new` for CMake — so lattice claims neither tier rather than inventing a
layout and calling it standard. That is a gap, stated as one.

Everything in either column gets `--enterprise`, and gets the CI of its own build
tool: eleven toolchains, from `npm ci` to `swift test` to `bundle install`.

### `--enterprise` — the overlay

Adds the scaffolding a repository needs to be worked on by more than one person:
`docs/adr/`, `todo/`, `organizational/`, community-health files, a Trivy security
scan, a release workflow, and a CI workflow.

The CI is **chosen from the project's build tool**, not from a template — lattice
looks for `package.json`, `go.mod`, `pom.xml`, `Cargo.toml`, `build.gradle`,
`pyproject.toml` or a `.csproj` and lays down the matching `ci.yml` and
`dependabot.yml`. A Go module gets `go test`; a Maven project gets `mvn -B verify`.
A project whose build tool is unrecognised gets everything except the CI, which is
better than a workflow that cannot pass.

Fullstack composes a backend at the root with a frontend in `client/`, and
installs both:

```bash
lattice shop --stack express --database sqlite --client react-vite-ts
```

Fully flagged, it is non-interactive — safe to run in a script or in CI. An
underspecified run there does not hang and does not guess: a missing choice
(`--database` on a stack that has one) exits non-zero and names the flag, because
silently taking the first option would build the project against a database
nobody asked for.

## Health probes

Generated backends expose two probes, served by different layers on purpose:

```
GET /api/health/liveness    Express   — 200 while alive, even while draining
GET /api/health/readiness   terminus  — 503 while draining, or if storage is down
```

Readiness turning 503 the moment a SIGTERM lands is what lets a load balancer
take the instance out of rotation *before* the socket closes. Liveness stays 200
throughout, because a failing liveness probe makes Kubernetes SIGKILL the pod —
which would kill the graceful shutdown mid-drain.

A scaffolded app also survives its database going away: it reports `storage:
down`, keeps running, and recovers on its own when the database comes back.

## Two things it does that most scaffolders don't

**It picks a free port.** If something already listens on 27017, the Mongo
container is published on 27018 and `.env` is written to match. A scaffolder
that hardcodes the port either fails to bind — or, much worse, silently connects
your new project to a database that was already running there.

**It waits for the database to be healthy**, not merely started. `docker compose
up -d` returns while Postgres is still initialising, so the next command you run
dies on a refused connection and it looks like the scaffold is broken.

## Layout

```
lattice/
  bin/lattice.js      the CLI
  src/
    args.js           flag parsing — declared flags, so a typo is an error
    registry.js       the stack catalogue
    storage.js        the database catalogue — deps, env, compose, adapter
    scaffold.js       copy + variable substitution
    setup.js          prune, install, write .env, compose, find a free port
    prompts.js        zero-dependency select / text
  stacks/             the templates themselves
```

`lattice` has **no dependencies of its own**. That is why `npm create
lattice@latest` starts instantly.

## CI

Every push and pull request runs the workflows below. They do not merely test the
scaffolder — a scaffolder cannot be tested by testing the scaffolder — they
**scaffold real projects and run their suites**:

| Workflow                  | What it proves                                                  |
| ------------------------- | --------------------------------------------------------------- |
| `unit.yml`                | The CLI's own suite, on Node 20/22/24 × Linux/macOS/Windows.     |
| `storages.yml`            | `express` **and** `fastify`, each scaffolded against **all six databases**, installed, and the generated suite run — with Postgres, MySQL and Mongo as real containers the CLI starts itself. Twelve jobs. |
| `templates-javascript.yml`| `react-vite`, `react-vite-ts` build; `node-cli` tests pass.      |
| `templates-python.yml`    | `fastapi` and `ml-project` install and pass pytest.              |
| `templates-java.yml`      | `spring-boot` runs `mvn test`; `javafx` packages.                |
| `generators.yml`          | All **24** `--generator` delegations, scaffolded with `--enterprise`, installed and built — and each asserted to have received the CI of its own build tool. |

`release.yml` reuses `unit.yml` rather than restating the matrix, so the suite
that guards a publish is the same suite that guards a pull request — by
construction, not by discipline.

`generators.yml` is the one exception to "every push and pull request". It calls
other people's CLIs over the network, so an upstream outage would turn the repo red
for reasons no change here caused. It runs weekly, on demand, and on pushes to
`main` that touch the generator machinery. That is also the only thing that can
catch `create-next-app` renaming a flag — the argv in `src/generators.js` are claims
about tools lattice does not control, and inspection cannot verify them.

## Releasing

Two steps, both of which you drive. You write down what changed; the version bump
is prepared for your review, and only then does anything reach npm.

1. As you work, add entries under `## [Unreleased]` in
   [CHANGELOG.md](./CHANGELOG.md). This is the only writing you do, and it is
   deliberate: notes written at release time are notes nobody can write, because
   by then nobody remembers.
2. Run the **Prepare release** workflow with the version (`1.2.0`, no leading `v`).
   It refuses early if that version is already on npm or if `[Unreleased]` is
   empty, then stamps `package.json`, cuts `[Unreleased]` into
   `## [1.2.0] - <today>`, pushes a `release/v1.2.0` branch, and links the pull
   request to open. The workflow does not open it itself: that would need *"Allow
   GitHub Actions to create and approve pull requests"*, one toggle that also grants
   approval — and approval is exactly what `main-protection` requires a human for.
3. Open that pull request, review it, and merge it.
4. Publish a GitHub Release tagged `v1.2.0` **from `main`'s HEAD**.

Publishing the Release triggers `.github/workflows/release.yml`, which:

- re-runs the full unit matrix on the code being shipped;
- **refuses** if the tag is not `main`'s HEAD, if `package.json` disagrees with the
  tag, if the changelog has no section for that version, or if the version is
  already on npm — all *before* anything is published, because `npm publish` cannot
  be undone;
- **waits for a human** to approve the `production` environment. This is the last
  point at which a release can be stopped;
- publishes to npm with
  [provenance](https://docs.npmjs.com/generating-provenance-statements), so anyone
  can verify the tarball was built from this repo;
- sets the Release body to the notes already in the changelog — the same text you
  reviewed, so the two agree by construction rather than by careful pasting.

### Why the version bump comes first

It used to happen inside the release, *after* `npm publish`, and land on `main`
with a direct push. Both halves of that were wrong.

`main` is governed by the `main-protection` ruleset, and CI cannot push through it:
GitHub does not allow the Actions app to bypass a ruleset on a user-owned
repository, and no repository-role bypass exempts `github-actions[bot]` either.
Both were tested; both fail with `GH013`.

The deeper problem was the ordering. A version commit landing after an
irreversible publish means any failure in that last step leaves a version on a
registry that never forgets, and no record of it on `main`. Preparing the bump in
a reviewed pull request removes that window rather than working around it: by the
time anything is published, the version and its notes are already on `main`.
Nothing is written to the repository during a release.

What was a mutation became an assertion. Rather than setting `package.json` from
the tag, the release now refuses to publish if the two disagree — which catches a
Release cut from the wrong commit, the case the old stamping quietly hid.

The cost is honest: releasing is two steps instead of one. That is the price of
`main` being genuinely protected.

No bot writes to this repository. The release pull request is authored by you —
the token only authorises the push — so `github-actions[bot]` never lands in the
contributor list. That is also why there is no `release-please` or
`semantic-release` here: both work by having a bot open *and merge* a release PR,
and the merge is the part this setup deliberately keeps human.

No secret required. Publishing uses
[trusted publishing](https://docs.npmjs.com/trusted-publishers) over OpenID
Connect, so npm trusts this workflow directly — there is no `NPM_TOKEN` to store,
leak, or rotate.

See [STRUCTURE.md](./STRUCTURE.md) for why the templates are shaped the way they
are — it is grounded in an audit of every project in `htl-villach`.
