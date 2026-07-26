---
title: 'Why the templates are shaped this way'
edit_url: https://github.com/Wolfi-OwO/lattice/edit/main/STRUCTURE.md
---

!!! info "Mirrored from the repository"

    This page is [`STRUCTURE.md`](https://github.com/Wolfi-OwO/lattice/blob/main/STRUCTURE.md), rendered here. It is generated
    on every build, so edit the source rather than this copy — the pencil above
    already points there.

# Structure & conventions

Why these templates are laid out the way they are. Two inputs shaped them: an
audit of every project in `htl-villach`, and how production codebases are
structured today.

## What the audit found

Across 1BHIF–5BHIF and the Diplomarbeit, the stacks that actually recur:

| Stack                            | Projects | Verdict                             |
| -------------------------------- | -------: | ----------------------------------- |
| Express (+ Mongoose)             |      ~40 | Dominant. Every WMC year.           |
| Spring Boot (JPA, Flyway, JWT)   |      ~18 | The serious Java work.              |
| React + Vite                     |      ~15 | Almost always inside a backend repo.|
| JavaFX (Maven, MVC)              |      ~20 | 3BHIF design-pattern exercises.     |
| Android + Compose + Retrofit     |        6 | Paired with a Spring backend.       |
| Python DS/ML (sklearn, OpenCV)   |      ~35 | Notebooks, a few real apps.         |

Two patterns already existed and were kept rather than replaced:

**Backend at root, frontend in `client/`.** Both the SYP quiz-app and the
Infineon ExMS Diplomarbeit do this. It is not the textbook monorepo, but it
means one repo, one PR, one deploy — and the API contract has one obvious home.
The templates make it the fullstack default.

**`at.htlvillach.<app>.{...}` packages** with mirrored `src/test/java`, and
Flyway `V*__*.sql` migrations. Kept verbatim.

Three things were consciously *not* carried over: the `ddl-auto: update` habit
(Flyway owns the schema now), entities serialised straight out of controllers
(DTOs now), and exact-pinned Python requirements (they rot — see below).

## The conventions

### One error shape, everywhere

Every backend returns the same envelope on failure:

```json
{ "error": { "status": 400, "message": "Validation failed",
             "details": [{ "field": "email", "message": "must be a valid email" }] } }
```

A client needs exactly one branch to handle any failure from any of the three
backends. Services `throw ApiError` / `raise ApiError`; a single handler maps it
to a response. No controller contains a try/catch, and an unexpected exception
becomes a logged 500 whose internals never reach the caller.

### Layers, and the rule that keeps them honest

Routes → controller → **service** → repository/model.

The load-bearing rule is: **no HTTP type crosses into the service.** No `req`,
no `res`, no `HttpServletRequest`, no FastAPI `Request`. That single constraint
is what makes services unit-testable without booting a server, and it is the
first thing to break in a codebase that later becomes untestable.

The tell that you've violated it: a controller growing `if`s that aren't about
status codes.

### Entities never leave the service layer

The DB model is not the API contract. Every backend converts to a DTO
(`UserDto` / `UserRead` / a Mongoose `toJSON` transform) before responding.

That is *why* `password_hash` cannot leak — not because someone remembered to
delete it, but because it has nowhere to go. Add a sensitive column tomorrow and
it is still safe by default. This is verified by a test in all three backends.

### The database is a choice, not a rewrite

The original `express-mongo` template welded Mongoose into the model *and* the
service layer: `User.find({ $or: [...] })` sat in business logic. Changing the
database meant rewriting the service.

It is now a seam. `src/db/index.js` exposes a six-method repository, and the
service talks only to that:

```
routes → controller → service → db.users → adapter → driver
                                 ^^^^^^^^
                       nothing above this line imports a driver
```

Six adapters implement it — MongoDB, PostgreSQL, MySQL, SQLite, plain files,
in-memory — and the scaffolder keeps exactly one, adds exactly its dependencies,
and deletes the rest. The invariant is greppable: no `mongoose` / `pg` /
`mysql2` / `better-sqlite3` import exists outside `src/db/adapters/`.

The payoff is that the *same test suite* runs green against all six. A test that
passes on the in-memory adapter is a test that passes on Postgres, because
neither the test nor the code under it knows which is underneath.

The file adapter is not a toy: writes go to a temp file and are `rename`d into
place (atomic on POSIX, so a crash cannot leave a half-written file), and every
mutation goes through one promise chain (so two concurrent requests cannot both
read the array, each append a row, and each write back a file missing the
other's). What it is *not* is safe across multiple processes — at that point,
use SQLite, which is the same "just a file" deal with real locking.

### Liveness and readiness are not the same probe

The two health endpoints are served by different things on purpose, and the
asymmetry is the whole point:

| | Served by | While draining | Why |
| --- | --- | --- | --- |
| `/api/health/liveness` | Express / Fastify | **200** | A failing liveness probe makes Kubernetes SIGKILL the pod. If it failed during a drain, graceful shutdown would be killed mid-drain — the exact thing it exists to prevent. |
| `/api/health/readiness` | terminus | **503** | Tells the load balancer to stop routing *before* the socket closes. A readiness route inside the framework keeps answering 200 all the way through the drain, so traffic keeps arriving at a process that is about to die. |

Both JavaScript backends use `@godaddy/terminus` for this, and for the same
reason. Fastify originally hand-rolled it — a `process.once('SIGTERM')` handler
that set a `draining` flag which a Fastify route then read. That works, and it is
still wrong: the route lives *inside* the app, so the ordering between "start
failing readiness" and "stop accepting connections" becomes something you maintain
by hand, in a signal handler, forever. Terminus puts readiness on the http.Server,
underneath the framework, where the ordering is structural rather than remembered.

Liveness therefore must not touch the database. If it did, a slow database would
read as a dead process, every replica would fail liveness at once, and the
orchestrator would restart the whole fleet — turning a database blip into an
outage of your own making. Dependency health is a *readiness* question.

Two traps in `@godaddy/terminus` that this template works around, both found by
running it rather than reading the docs:

- It fails **every** probe it owns during shutdown, liveness included. That is
  why liveness is not registered with it.
- With `verbatim: true` it merges a check's result into a *shared* response
  object, so fields from one probe leak into later responses on another. The
  default `{ status, info, details }` shape does not.

And one trap in the database drivers themselves: an idle pooled connection
dropped by the server (restart, failover, `docker compose stop`) surfaces as an
`error` event on the pool, and an **unhandled `error` event kills the process**.
Without a `pool.on('error')` listener the server does not report a degraded
database — it dies, right when the probe was supposed to speak up. Every
server-backed adapter attaches one, which is what lets a scaffolded app ride out
a database restart and recover on its own.

### Migrations own the schema

Flyway (Java), Alembic (Python). Hibernate runs with `ddl-auto: validate`, so a
drifted entity fails at **boot** instead of quietly altering a production table.

### Config comes from the environment

One module reads `process.env` / `os.environ` (`src/config`, `app/core/config.py`),
validates at startup, and everything else imports the validated object. A missing
`JWT_SECRET` fails at boot, not on the first login attempt at 3am.

### Package by feature, not by layer

For the Spring template specifically: `user/` contains its controller, service,
repository, entity and DTOs together. Not `controllers/` + `services/` +
`repositories/` each containing a slice of every feature.

This is where the industry has landed for team-sized apps — a feature can be
read, reviewed, moved or deleted without touching five sibling directories, and
two people on two features stop colliding in the same folders. The layer-first
split is fine for a small CRUD app and becomes a tax the moment it isn't one.

The JS/Python backends do the same thing under different names: `api/users/`
and `routes/` + `services/` per resource.

### Floors, not exact pins, in Python

`fastapi>=0.112,<1.0`, not `fastapi==0.112.0`. Exact pins in a *template* rot:
the first version of this scaffolder pinned `psycopg==3.2.1`, which has no wheel
for Python 3.14 and made the template uninstallable within a year. Applications
should still generate a real lockfile (`uv lock`, `pip-compile`) — that's a
deploy concern, not a template concern.

## Things deliberately left out

**The one committed binary: `gradle-wrapper.jar`.** Gradle's wrapper needs a
43 KB `gradle-wrapper.jar` and has no script-only form, so shipping a working
Android template means committing exactly one binary. The alternative — telling
the user to run `gradle wrapper` first — requires a Gradle they do not have yet
(the wrapper's whole job is to remove that precondition), and left the template
unbuildable from a fresh clone for as long as it existed.

The jar is not trusted on faith. Its SHA-256 is
`2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`, the official
Gradle 8.10.2 wrapper, and CI runs `gradle/wrapper-validation-action` on every
push, which fails if the committed jar is anything other than a byte-identical
published Gradle wrapper. That is what makes one binary acceptable where a blanket
rule cannot: the tree carries it, but nothing takes it on trust.

**`mvnw` needs no such exception**, because Maven ships a script-only
distribution — `mvnw` resolves Maven itself, so there is no `maven-wrapper.jar`.
It is shipped because the alternative was worse: without it the Java templates
ran only for people who already had a compatible Maven on PATH, and CI could not
see the problem because `actions/setup-java` provides one. A scaffolder exists to
remove exactly that kind of precondition — which is the same reason the Gradle
jar is now committed rather than wished away.

**No CI config.** It is too provider-specific to guess, and a stale
`.gitlab-ci.yml` is worse than none.

**No auth provider.** The backends ship plain JWT, not MSAL/Entra. Swapping the
token issuer means changing one module (`middlewares/auth.js`, `JwtService`,
`core/security.py`); baking in a provider would have meant changing ten.

## The CLI has to be as boring as the templates

The templates were the easy half. Three bugs that shipped in the scaffolder are
worth writing down, because each one is a class of mistake rather than a typo,
and each now has a regression test:

**Capturing output can kill the thing you are capturing.** `execFileSync`'s
default `maxBuffer` is 1 MB, and exceeding it does not truncate — it kills the
child with `ENOBUFS`. `better-sqlite3` builds through node-gyp and prints past
1 MB, so `--db sqlite` died half-installed, reported "install failed", and left a
`node_modules` missing the packages the project's own tests import. The install
was fine; the code watching it was not.

**A prompt on an ended stdin hangs forever.** A readline interface created after
stdin has hit EOF emits neither `line` nor `close` — it just waits. The first
prompt after EOF fell back to its default, and the second hung. So a
partially-flagged run in CI (`--stack spring-boot`, which needs a package *and* a
port) hung instead of finishing. Non-interactive runs now latch EOF and answer
from defaults; a *choice* with no defensible default fails loudly instead.

**Guessing which flags take a value eats the arguments.** Treating "the next
token isn't a flag" as "this flag's value" meant `lattice --force myapp` set
`force="myapp"` and scaffolded under the prompt's default name. Flags are
declared now, which also makes `--stak express` an error rather than a silent
drop into the interactive picker.

The through-line: all three failed *quietly*, and produced a project that looked
scaffolded but wasn't. A scaffolder that is wrong must be loudly wrong.

## Verification

Everything here was actually run, not just written:

- `express` — scaffolded, installed and tested against **all six storages**
  (MongoDB, PostgreSQL, MySQL, SQLite, files as JSON/NDJSON/YAML, in-memory):
  32 Mocha tests green (users and products) in all eight combinations, with the
  Postgres, MySQL and Mongo runs hitting real containers that the CLI started
  itself. The server was booted and the CRUD surface exercised over HTTP (create,
  paginate, validation errors, 401 guard).
- `fastify` — the same storage seam as express, so the same **eight
  combinations**: 28 node:test cases green (users and products) against every
  storage, real containers included.
- **Graceful shutdown** — the real generated server was drained under SIGTERM, in
  both JavaScript backends: `/readiness` flips to 503 while `/liveness` stays 200,
  then the process exits cleanly.
- **Database outage** — Postgres was stopped underneath a running app: the
  process survived, `/readiness` reported `storage: down` (503), and it recovered to
  200 by itself when the database came back, with no restart.
- `react-vite-ts` as a fullstack client — `tsc -b` under `strict` + `vite build`
  clean, installed automatically alongside the backend.
- `fastapi` — 29 pytest tests green (users and products).
- `ml-project` — tests green; `python -m src.models.train` trains end to end.
- `node-cli` — tests green, CLI runs.
- `spring-boot` — **25 JUnit tests green** (users and products) under `mvn test`,
  run in a `maven:3.9-eclipse-temurin-17` container (there is no Maven on this
  machine).
- `javafx` — compiles and packages (`mvn -DskipTests package`). Its tests want a
  display server, so CI builds it rather than running them.
- `android-compose` — **`./gradlew assembleDebug` builds the debug APK** in the
  `android` job, on a runner with only a JDK and the Android SDK. Nothing installs
  Gradle: the committed wrapper downloads it, which is the same path a user
  cloning the generated project takes. The job first runs
  `gradle/actions/wrapper-validation`, so a green build also certifies the one
  committed binary is an unmodified Gradle wrapper.

Both JVM templates target **JDK 17**.

All of the above runs on every push: the workflows in `.github/workflows/`
scaffold real projects and run *their* suites, because a scaffolder cannot be
tested by testing the scaffolder. See the CI table in the README.
