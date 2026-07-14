# {{projectTitle}}

REST API — Fastify 4, JSON Schema validation, JWT, Winston. Storage: **{{databaseLabel}}**.

```bash
npm run dev                   # http://localhost:{{port}}
npm run database:seed         # load database/data/ into the database
npm test
```

## Layout

```
src/
├── server.js          Boots and drains. The only file that binds a port.
├── app.js             Builds the app without listening — this is what tests drive.
├── config/            The one module that reads process.env
├── api/
│   ├── health/        Liveness and readiness (they are not the same probe)
│   └── users/         routes → controller → service, plus the JSON Schema
├── plugins/auth.js    requireAuth preHandler, signToken
├── database/          The storage seam — see below
│   ├── index.js       exposes database.users, connectDatabase(), ping()
│   ├── serialize.js   toPublicUser — the reason passwordHash cannot leak
│   └── adapters/
│       └── {{databaseAdapter}}.js
└── utils/
database/
├── fill-demo-data.js  npm run database:seed
└── data/users.json    demo rows, one file per domain
```

## Why schema-first

Fastify validates the request against a JSON Schema **before** the handler runs,
and serialises the response through one too. Two things fall out of that:

- A malformed body never reaches a controller, so no handler starts with a guard
  clause. Validation failures come back as the same envelope everything else
  uses — `{ error: { status, message, details: [{ field, message }] } }` — mapped
  once in `app.js`.
- A field absent from the **response** schema is dropped on the way out. That is
  a second, independent reason `passwordHash` cannot leak: even if a bug put it
  on the object, it has no way through the serialiser. The first reason is
  `toPublicUser` in `database/serialize.js`. Both are tested.

## The database is a choice, not a rewrite

Everything above `src/database/` talks to `database.users` and imports no driver.
The repository is six methods:

```
database.users.list / findById / findByEmail / create / update / remove
```

Six adapters implement it — MongoDB, PostgreSQL, MySQL, SQLite, plain files,
in-memory — and scaffolding keeps exactly one. The **same test suite passes
against all of them**, because neither the tests nor the code under them knows
which is underneath.

This is the identical seam the Express template uses. Same interface, same
adapters, same guarantees — only the HTTP layer differs.

## Health probes

```
GET /api/health/live    200 while the process is alive, even while draining
GET /api/health/ready   503 while draining, or if the database is unreachable
```

Liveness never touches the database. If it did, a slow database would read as a
dead process, every replica would fail liveness at once, and the orchestrator
would restart the whole fleet — turning a database blip into an outage of your
own making. Dependency health is a **readiness** question.

On SIGTERM the server flips readiness to 503 *first* and keeps serving, then
stops accepting. That ordering is what lets a load balancer take the instance out
of rotation before the socket closes.

## Tests

`app.inject()` drives a real request through the real router, hooks, schemas and
error handler without opening a socket — so the suite exercises the entire HTTP
stack and still runs in milliseconds. There is no HTTP test client dependency.
