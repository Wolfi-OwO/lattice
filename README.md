# lattice

Pick a stack, pick a database, get a project that already runs.

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
lattice my-api --stack express --db postgres
lattice my-api --stack express --db mongodb
lattice notes  --stack express --db file --format ndjson   # no database at all
lattice demo   --stack express --db memory                 # nothing persisted
```

Six options: **MongoDB · PostgreSQL · MySQL · SQLite · plain files · in-memory.**

`--db file` persists rows to disk as **JSON**, **NDJSON** or **YAML**. Writes are
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
  db/
    index.js          the seam: db.users, connectDatabase(), ping()
    serialize.js      toPublicUser — the reason passwordHash cannot leak
    adapters/
      postgres.js     ← exactly one of these survives scaffolding
```

Everything above `src/db/` talks to `db.users` and imports no driver, which is
enforceable by grep: no `mongoose` / `pg` / `mysql2` import exists anywhere
outside `src/db/adapters/`. Swapping Postgres for Mongo is one adapter file, and
no service or controller changes.

Adding a seventh database is one entry in `src/storage.js` plus one adapter file.

## Commands

```bash
lattice [name] [options]

  --stack <id>      see --list
  --db <id>         mongodb | postgres | mysql | sqlite | file | memory
  --format <fmt>    json | ndjson | yaml        (only with --db file)
  --client <id>     frontend for a fullstack project, placed in client/
  --port <n>        backend port (default 3000)
  --no-install      skip dependency installation
  --no-db-start     do not "docker compose up -d db"
  --force           scaffold into a non-empty directory
  --list            show all stacks and databases
  --version         print the version
```

Fullstack composes a backend at the root with a frontend in `client/`, and
installs both:

```bash
lattice shop --stack express --db sqlite --client react-vite-ts
```

Fully flagged, it is non-interactive — safe to run in a script or in CI. An
underspecified run there does not hang and does not guess: a missing choice
(`--db` on a stack that has one) exits non-zero and names the flag, because
silently taking the first option would build the project against a database
nobody asked for.

## Health probes

Generated backends expose two probes, served by different layers on purpose:

```
GET /api/health/live    Express   — 200 while alive, even while draining
GET /api/health/ready   terminus  — 503 while draining, or if storage is down
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

`release.yml` reuses `unit.yml` rather than restating the matrix, so the suite
that guards a publish is the same suite that guards a pull request — by
construction, not by discipline.

## Releasing

You write down what changed, and you publish a Release. Everything else — the
version number, the changelog, npm — happens on its own.

1. As you work, add entries under `## [Unreleased]` in
   [CHANGELOG.md](./CHANGELOG.md). This is the only manual step, and it is
   deliberate: notes written at release time are notes nobody can write, because
   by then nobody remembers.
2. Draft a Release on GitHub with the tag `vX.Y.Z` and publish it.

Publishing the Release triggers `.github/workflows/release.yml`, which:

- **refuses early** if `vX.Y.Z` is already on npm, if `[Unreleased]` is empty, or if
  the Release was cut from anything other than `main`'s HEAD — all *before* anything
  is written, because `npm publish` cannot be undone. (That last one matters: the
  job publishes `main`, so a tag pointing at an older commit would ship code nobody
  tagged, under a version number that can never be reused.)
- re-runs the full unit matrix on the code being shipped;
- **sets the version** from the tag, so the tag is the single source of truth and
  `package.json` cannot drift from it;
- **cuts the changelog**: `[Unreleased]` becomes `## [X.Y.Z] - <today>`, and a
  fresh empty `[Unreleased]` is left above it for the next change;
- publishes to npm with
  [provenance](https://docs.npmjs.com/generating-provenance-statements), so anyone
  can verify the tarball was built from this repo;
- commits the version and the changelog to `main` **as you**, moves the tag onto
  that commit, and sets the Release body to the notes it just wrote.

The version bump and the release notes land in one commit on purpose: a version
that shipped and the notes saying what was in it are the same fact.

No bot writes to this repository. The commit is authored by you — the token only
authorises the push — so `github-actions[bot]` never lands in the contributor
list. That is also why there is no `release-please` or `semantic-release` here:
both work by having a bot open and merge a release PR, which is the one thing this
setup is built to avoid.

Requires one secret: `NPM_TOKEN`, an npm automation token.

See [STRUCTURE.md](./STRUCTURE.md) for why the templates are shaped the way they
are — it is grounded in an audit of every project in `htl-villach`.
