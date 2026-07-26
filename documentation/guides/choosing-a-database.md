# Choosing a database

The `express` and `fastify` stacks are storage-agnostic. The database is a
**choice made at scaffold time, not a rewrite**.

```bash
lattice my-api --stack express --database postgres
lattice my-api --stack express --database mongodb
lattice notes  --stack express --database file --format ndjson   # no database at all
lattice demo   --stack express --database memory                 # nothing persisted
```

## The six

| `--database` | Driver | Durable | Needs a server | Default port |
| --- | --- | --- | --- | --- |
| `mongodb` | `mongoose` | yes | yes (Docker) | 27017 |
| `postgres` | `pg` | yes | yes (Docker) | 5432 |
| `mysql` | `mysql2` | yes | yes (Docker) | 3306 |
| `sqlite` | `better-sqlite3` | yes | no | — |
| `file` | none | yes | no | — |
| `memory` | none | **no** | no | — |

The first three get a `docker-compose.yml` with a health check, started for you
unless you pass `--no-database-start`. The last three need nothing running.

### Which to pick

- **`postgres`** if the data has real relations. It is the boring correct default.
- **`mongodb`** if the shape of a record is still moving.
- **`mysql`** if something else you run already speaks it.
- **`sqlite`** for a single-process app, a prototype, or anything that should not
  need Docker to start. A file on disk, full SQL, zero configuration.
- **`file`** when the answer is "this does not need a database" and you would
  rather say so than run one anyway.
- **`memory`** for demos, tests, and CI. Wiped on restart, and honest about it.

## `--database file`

Rows are persisted to disk in one of three formats:

```bash
lattice notes --stack express --database file --format json     # default
lattice notes --stack express --database file --format ndjson
lattice notes --stack express --database file --format yaml
```

| `--format` | Shape | Good for |
| --- | --- | --- |
| `json` | One `.json` file, rewritten on change | Small data you want to read |
| `ndjson` | One row per line | Appends cheaply, survives a partial write |
| `yaml` | Same as JSON, hand-editable | Config-like data. Adds a `yaml` dependency |

This is not a toy adapter. Writes are **atomic** — written to a temp file and
then renamed — and **serialised through a queue**, so a crash mid-write cannot
corrupt the file and two concurrent requests cannot clobber each other's rows.
Those are the two failure modes that make people say "never persist to a file",
and they are the two that were closed.

## Why swapping is one file

Every option implements the same six-method repository, so the routes, the
controllers, the services and **the test suite are identical** whichever you pick.

```
src/
  api/users/          routes → controller → service     (never touches a driver)
  database/
    index.js          the seam: database.users, connectDatabase(), ping()
    serialize.js      toPublicUser — the reason passwordHash cannot leak
    adapters/
      postgres.js     ← exactly one of these survives scaffolding
```

Everything above `src/database/` talks to `database.users` and imports no driver.
That is not a convention people are asked to respect — it is enforceable by grep:
no `mongoose` / `pg` / `mysql2` import exists anywhere outside
`src/database/adapters/`.

The five adapters you did not choose are **deleted** at scaffold time, not left
in place unimported. What ships is one adapter, so the project reads as though it
had only ever been a Postgres project.

Adding a seventh database is one entry in `src/storage.js` plus one adapter file.
No service, route or controller changes.

## The install is verified, not assumed

`--database sqlite` used to produce a project that died on its first command with
`Could not locate the bindings file`. better-sqlite3 compiles a native binding
during install; npm silently skipped that install script; npm exited `0`; lattice
printed "Installed dependencies" over a project that did not work. Deterministic,
three runs out of three.

So each adapter now declares a **smoke expression**, run after install:

```js
mongodb:  "require('mongoose')"
sqlite:   "new (require('better-sqlite3'))(':memory:').close()"
```

The Mongo one is an import, because mongoose is pure JavaScript and importing it
is the whole check. The SQLite one **opens a database**, because requiring
better-sqlite3 proves nothing — the native binding loads when a `Database` is
constructed, not at import, which is exactly how that bug shipped.

Neither opens a network connection. The question is "is this package usable",
not "is a server running".

## The port is found, not assumed

If something already listens on 5432, the Postgres container is published on 5433
and `.env` is written to match.

Hardcoding it has two outcomes, and the second is worse than the first: the
container fails to bind, which you notice — or it binds, and your new project
silently talks to a database that was already running there, which you do not.

lattice also waits for the container to be **healthy**, not merely started.
`docker compose up -d` returns while Postgres is still initialising, so a
scaffolder that stops there hands you a project whose first command dies on a
refused connection and looks broken.

## What CI proves about this

`storages.yml` scaffolds **`express` and `fastify` against all six databases**,
installs each, and runs the generated project's own suite — with Postgres, MySQL
and Mongo as real containers the CLI starts itself. Twelve jobs, on every push.

That is the only way to know the claim on this page is true. Reading the adapters
cannot tell you whether `--database mysql` produces a project whose tests pass.
