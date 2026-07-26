# Your first project

```bash
npm create lattice@latest
```

Answer five questions and you land in a project that runs. This page is about
what happened between the last question and the prompt coming back.

## The run

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

Four ticks, and each one is a thing you did not have to do.

### ✔ Scaffolded

The template tree is copied with variables substituted in both file contents and
path names, into a **staging directory** rather than straight into `my-api`.

Nothing is visible at the destination until the whole generation has succeeded.
A scaffolder that writes as it goes and then fails leaves you a half-project that
looks real — the worst possible output, because the only safe thing to do with it
is delete it, and it is not obvious that you must. lattice stages, verifies, and
then renames into place atomically. A failure leaves the destination untouched.

The last thing before that rename is a structural gate: a generated project whose
layout would *silently* not work is rejected rather than written. A `.java` outside
`src/main/java` is not on Maven's source path, so the class does not exist at
runtime and no compiler error points at it. A test under `src/main` is packaged
into the shipped artifact along with its test-only dependencies. Those are refused.
Anything that merely offends taste is left to `lattice doctor`, which scores rather
than refuses.

### ✔ Wired up

Three things, all of which are normally left to you:

- **`.env` is written**, not `.env.example`. With the real values — including the
  port the database actually got.
- **The storage adapter is pruned.** The template ships all six; the five you did
  not choose are deleted. What survives is one `src/database/adapters/postgres.js`,
  so the project reads as though it had only ever been a Postgres project.
- **A `docker-compose.yml` is written** for the database you chose, and only for it.

### ✔ Installed dependencies

With the project's own package manager — `npm`, `maven`, `pip` — not with a
hardcoded one.

This step is stricter than it looks. `--database sqlite` used to produce a project
that died on its first command with `Could not locate the bindings file`:
better-sqlite3 compiles a native binding during install, npm silently skipped that
install script, npm exited `0`, and lattice printed "Installed dependencies" over
a project that did not work. So the driver is now **loaded** after installing, and
the install is only reported as successful if it actually imports.

### ✔ PostgreSQL is running

Two details do the work here:

**A free port.** If something already listens on 5432, the container is published
on 5433 and `.env` is written to match. Hardcoding the port either fails to bind,
or — much worse — silently connects your new project to a database that was
already running there, which looks like it worked.

**Healthy, not started.** `docker compose up -d` returns while Postgres is still
initialising, so a scaffolder that stops there hands you a project whose first
command dies on a refused connection. lattice polls the container's health check
until it passes.

Skip the whole step with `--no-database-start`, which still writes the compose
file and the `.env`.

## Now run it

```bash
cd my-api
npm run dev
```

```bash
curl localhost:3000/api/health/readiness
npm test
```

The suite passes on a project you have not touched. That matters more than it
sounds: it means the tests are testing the template rather than describing it,
and [CI runs exactly this path](../guides/releasing.md#what-ci-actually-proves) —
scaffolding real projects and running their suites — because a scaffolder cannot
be tested by testing the scaffolder.

## What you got

```
src/
  api/users/          routes → controller → service     (never touches a driver)
  api/products/       the second domain, proving the first was not a special case
  config/             environment, parsed and validated once at boot
  database/
    index.js          the seam: database.users, connectDatabase(), ping()
    serialize.js      toPublicUser — the reason passwordHash cannot leak
    adapters/
      postgres.js     ← exactly one of these survives scaffolding
  middleware/         auth, error envelope, request logging
  models/             one flat file per domain, storage-neutral
tests/
```

Everything above `src/database/` talks to `database.users` and imports no driver,
which is enforceable by grep: no `mongoose` / `pg` / `mysql2` import exists
anywhere outside `src/database/adapters/`. That is what makes
[swapping the database](../guides/choosing-a-database.md) one file.

## Next

- [Choosing a database](../guides/choosing-a-database.md) — the six options and
  what each costs.
- [Non-interactive use](non-interactive.md) — the same run with no prompts.
- [Health probes and shutdown](../guides/health-and-shutdown.md) — why there are
  two probes and why they disagree on purpose.
