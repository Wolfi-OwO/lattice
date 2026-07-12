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

`.github/workflows/ci.yml` runs on every push and pull request. It does not
merely test the scaffolder — a scaffolder cannot be tested by testing the
scaffolder — it **scaffolds real projects and runs their suites**:

| Job         | What it proves                                                            |
| ----------- | ------------------------------------------------------------------------- |
| `unit`      | The CLI's own 30 tests, on Node 20/22/24 × Linux/macOS/Windows.            |
| `scaffold`  | `express` scaffolded against **all six databases**, installed, and the generated suite run — with Postgres, MySQL and Mongo as real containers the CLI starts itself. |
| `templates` | `react-vite`, `react-vite-ts` build; `node-cli` tests pass.                |
| `python`    | `fastapi` and `ml-project` install and pass pytest.                        |
| `java`      | `spring-boot` runs `mvn test`; `javafx` packages.                          |

## Releasing

Releases are cut **by hand**. Nothing pushes to this repository on your behalf,
so no bot ever lands in the history or the contributor list.

1. Bump `version` in `package.json`, commit, push.
2. Draft a Release on GitHub with the tag `vX.Y.Z` and publish it.

Publishing the Release triggers `.github/workflows/release.yml`, which checks the
tag against `package.json` (a mismatch fails loudly — npm will not let you
re-publish a version), re-runs the tests, and publishes to npm with
[provenance](https://docs.npmjs.com/generating-provenance-statements), so anyone
can verify the tarball was built from this repo.

Requires one secret: `NPM_TOKEN`, an npm automation token.

See [STRUCTURE.md](./STRUCTURE.md) for why the templates are shaped the way they
are — it is grounded in an audit of every project in `htl-villach`.
