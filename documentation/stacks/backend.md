# Backend stacks

Four backends, in three languages, all built to the same contract.

| Stack | Language | What it is | Tests |
| --- | --- | --- | --- |
| `express` | JavaScript | Layered REST API — Joi validation, JWT, Winston, Mocha | 32 |
| `fastify` | JavaScript | Schema-first REST API — JSON Schema validation, JWT, `node:test` | 28 |
| `spring-boot` | Java | Feature-packaged REST API — JPA, Flyway, JWT, Lombok, MapStruct | 25 |
| `fastapi` | Python | Async REST API — SQLAlchemy, Alembic, Pydantic settings, pytest | 29 |

Those test counts are the suites that ship *in the generated project* and pass
before you touch it.

```bash
lattice my-api --stack express     --database postgres
lattice my-api --stack fastify     --database mongodb
lattice my-api --stack spring-boot --port 8080
lattice my-api --stack fastapi
```

## The shared contract

The four are not four unrelated templates that happen to be in one repository.
Each ships the **same two domains** — `users` and `products` — with the same
route shapes, the same error envelope, and the same shutdown behaviour, so moving
between them is a change of language rather than a change of shape.

`products` exists specifically to keep the first domain honest. A template with
one domain proves nothing about whether its layering generalises: everything can
be a special case when there is only one case. Products is the second, and
porting it to the other three backends is what surfaced three real bugs that were
unreachable before, because the code that exposed them did not exist.

The full contract is [CONVENTIONS.md](../project/conventions.md).

### The error envelope

Every error, in every backend, in one shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [] } }
```

A client written against one backend can read the errors of all four.

### Authentication and authorisation are separate

One guard answers *"is this caller signed in"*, a second answers *"is this caller
allowed"*. Every backend has both, in its own idiom:

| Stack | Authenticated | Authorised |
| --- | --- | --- |
| `express`, `fastify` | `requireAuth` | `requireRole` |
| `spring-boot` | Spring Security filter chain | `@PreAuthorize` |
| `fastapi` | `current_user` dependency | `require_admin` dependency |

A template that ships only the first quietly makes every admin-only operation
available to any signed-in user — which is exactly the bug Fastify had until
1.3.0, when it had `requireAuth` and nothing else.

## Storage

`express` and `fastify` are storage-agnostic and take
[`--database`](../guides/choosing-a-database.md): six options behind one
six-method repository interface, so the routes, controllers, services and the
test suite are identical whichever you pick.

```
src/
  api/users/          routes → controller → service     (never touches a driver)
  database/
    index.js          the seam: database.users, connectDatabase(), ping()
    adapters/
      postgres.js     ← exactly one of these survives scaffolding
```

Everything above `src/database/` imports no driver, which is enforceable by grep:
no `mongoose` / `pg` / `mysql2` import exists anywhere outside
`src/database/adapters/`.

`spring-boot` and `fastapi` are not storage-agnostic in this sense — they are
built on JPA and SQLAlchemy respectively, which are their own answer to the same
question — so they do not take `--database`.

## Health probes

Every backend exposes two, served by different layers on purpose:

```
GET /api/health/liveness    200 while alive, even while draining
GET /api/health/readiness   503 while draining, or if storage is down
```

Why they disagree, and why that is the correct behaviour under Kubernetes, is in
[Health probes and shutdown](../guides/health-and-shutdown.md).

## What CI proves about these

`storages.yml` scaffolds **`express` and `fastify` against all six databases**,
installs each, and runs the generated suite — with Postgres, MySQL and Mongo as
real containers the CLI starts itself. Twelve jobs. `templates-java.yml` runs
`mvn test` against a scaffolded `spring-boot`; `templates-python.yml` runs pytest
against a scaffolded `fastapi`.

None of that tests the scaffolder by testing the scaffolder. It scaffolds real
projects and runs their suites, which is the only thing that can catch a template
that is subtly wrong.
