# Conventions

Every template in `stacks/` obeys this document. It is the reason twenty
templates across nine languages read like one product rather than twenty
personal styles.

If a template has to break a rule here, it breaks it **loudly** — with a comment
saying why — rather than quietly.

---

## 1. Names are spelled out. Always.

No abbreviations, no initialisms, no clipped words. Not in a directory name, a
file name, a variable, a function, a package, a script, or a service name in a
compose file.

| Write this  | Not this                       |
| ----------- | ------------------------------ |
| `database`  | `db`, `Db`, `DB`               |
| `configuration` / `config` (only as a directory name, never mixed) | `cfg`, `conf` |
| `repository`| `repo`                         |
| `request`   | `req`                          |
| `response`  | `res`, `resp`                  |
| `button`    | `btn`                          |
| `navigation`| `nav` (except the established `TopNavigation` component name) |
| `error`     | `err`                          |
| `number`    | `num`, `no`                    |
| `identifier` / `id` (`id` is universal and stays) | `ident`, `idx` |
| `message`   | `msg`                          |
| `properties`| `props` (React's `props` parameter stays — it is the framework's word) |

**The one word for storage is `database`.** Everywhere, in every language:

```
src/database/          the storage seam (code)
database/              demo data and its loader (data)
database.users         the repository object
config.database        the configuration key
--database postgres    the CLI flag
services: database:    the compose service
npm run database:seed  the script
```

There is no `db` anywhere in this repository, and adding one is a review
comment. The exception carved out on purpose: `DATABASE_URL` and other
environment variables keep their conventional SCREAMING_SNAKE names, and a
third-party library's own API (`req`, `res` in an Express signature) is that
library's vocabulary, not ours.

---

## 2. One error envelope, in every language

Every backend returns exactly this on failure, and nothing else:

```json
{
  "error": {
    "status": 400,
    "message": "Validation failed",
    "details": [{ "field": "email", "message": "must be a valid email" }]
  }
}
```

`details` is present only for validation failures. A client needs **one** branch
to handle any failure from any backend in this repository.

Services raise/throw a domain error (`ApiError`, `ApiException`, `HTTPException`,
`ApiError` enum…). Exactly one handler maps it to a response. **No controller
contains a try/catch.** An unexpected exception becomes a logged 500 whose
internals never reach the caller.

---

## 3. One resource, one shape

Every backend exposes the same `users` resource, so the templates are
interchangeable and every frontend can talk to every backend:

```
GET    /api/users?page=1&limit=20&q=      list, paginated
GET    /api/users/:id                      one
POST   /api/users                          create            201
PATCH  /api/users/:id                      update            authenticated
DELETE /api/users/:id                      delete   204      authenticated
GET    /api/health/liveness               liveness
GET    /api/health/readiness              readiness
```

The user, in every language:

```json
{ "id": "…", "email": "…", "name": "…", "role": "user|admin",
  "createdAt": "ISO-8601", "updatedAt": "ISO-8601" }
```

Every list endpoint returns this envelope:

```json
{ "items": [], "total": 0, "page": 1, "limit": 20, "pages": 0 }
```

**`passwordHash` never appears in a response.** Not because someone remembered to
delete it, but because it has no path out: the conversion to the public shape
happens in exactly one place per backend. Every backend has a test asserting it.

---

## 4. Layers, and the rule that keeps them honest

```
routes → controller → service → repository → driver
```

**No HTTP type crosses into the service.** No `request`, no `response`, no
`HttpServletRequest`, no `HttpContext`. That single constraint is what makes a
service testable without booting a server, and it is the first thing to break in
a codebase that later becomes untestable.

The tell that it has been violated: a controller growing `if`s that are not about
status codes.

**Entities never leave the service layer.** The database model is not the API
contract. Every backend converts to a data-transfer object before responding.

---

## 5. Demo data lives in `database/`, split by domain

Every backend ships:

```
database/
├── fill-demo-data.<ext>    the loader
├── README.md               how to add a domain
└── data/
    └── users.json          one file per domain — never one big seed file
```

- **One file per domain** (`users.json`, `products.json`, …). Adding a domain is
  adding a file; two people adding two domains do not collide in one file.
- The loader goes through the **repository**, never through a driver — so one
  loader works against every storage the template supports.
- It is **idempotent**: rows are matched on their natural key, so running it
  twice creates no duplicates and does not fail. Seeding is something you do
  repeatedly while developing, not once.
- `--reset` deletes existing rows first.
- Passwords in the JSON are plaintext **on purpose** — the loader hashes them the
  same way the API does, so a demo account can actually log in. The README says
  so, in those words.
- A data file with no registered loader is **reported and skipped**, never
  silently ignored.
- The script is called `database:seed` in every language's task runner.

---

## 6. Frontend structure

Every frontend template — React, Vue, Svelte, Angular, Nuxt, Next, vanilla —
uses this structure. The names are the same across frameworks; only the file
extension changes.

| Directory                  | Contains                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| `components/`              | Simple, reusable components                                              |
| `components/core/`         | Components with **no domain meaning** — Button, Card, Spinner            |
| `components/toasts/`       | Components that display toasts                                           |
| `components/<domain>/`     | Components for one specific domain — e.g. `components/users/`            |
| `layouts/`                 | Components that define the app's frame                                   |
| `layouts/RegularLayout`    | The layout for normal use                                                |
| `layouts/AdminLayout`      | The layout for the administration area                                   |
| `layouts/TopNavigation`    | The horizontal navigation bar at the top                                 |
| `layouts/ErrorPage`        | Shown when something goes wrong                                          |
| `pages/`                   | The views the app renders. **One subdirectory per page**, holding every component that belongs to that page |
| `pages/welcome/`           | The landing page                                                          |
| `pages/users/`             | Everything that makes up the users page                                   |
| `lib/`                     | Libraries that provide functionality but are not components — the API client lives here |
| `config/`                  | Configuration and constants — the one central place to configure the app |
| `hooks/`                   | App-specific hooks (or composables / stores, per framework)              |
| `router.<ext>`             | Which URL renders which layout and which page                            |

### The dependency rules — these are the point

```
components/core/      → depends on nothing else in the app
components/<domain>/  → may depend on components/core/ only
layouts/              → may use components/, never pages/
pages/                → may use components/, never layouts/
```

A violation of these four lines is a bug, not a style preference. They are what
stop a component graph from becoming a cycle, and they are stated in every
frontend template's README.

### Navigation

`router.<ext>` maps URL → layout → page, in one file. Navigation happens either
through a `<NavigationButton>` component (built on the router's link primitive)
or, in code, through the framework's navigate hook. The `ErrorPage` demonstrates
the code path.

### Look

Bootstrap 5 (React Bootstrap / the framework's idiomatic Bootstrap binding) and
Bootstrap Icons, so every frontend in the library is visually consistent and
nobody has to design a button.

---

## 7. Configuration comes from the environment

One module reads the environment, validates at startup, and everything else
imports the validated object. A missing secret fails at **boot**, not on the
first login attempt at 3am. No other module touches the environment directly.

---

## 8. Migrations own the schema

Where the language has a migration tool (Flyway, Alembic, EF Core, sqlx), it owns
the schema, and the ORM runs in **validate** mode. A drifted entity fails at boot
instead of quietly altering a production table.

---

## 9. Draining is a behaviour, not a library

Every backend that serves HTTP shuts down the same way. The mechanism differs per
language; the behaviour is the contract, and it is the behaviour that is the rule.

On SIGTERM, in this order:

1. **readiness answers 503 — while the server is still accepting and serving.**
   This is the whole point. A load balancer's endpoint list is eventually
   consistent, so for a beat after the process decides to die it is still being
   sent new requests. They must arrive at a server that is still listening.
2. **liveness keeps answering 200.** A failing liveness probe makes the kubelet
   SIGKILL the pod — mid-drain, killing the very drain this exists to perform.
   Liveness must never consult the database, for the same reason.
3. Only then does the server stop accepting, finish what is in flight, and exit.

| | How |
| --- | --- |
| Express, Fastify | `@godaddy/terminus` — readiness is registered on the http.Server, *below* the framework, which is the only place it can answer 503 after the framework has been told to stop |
| Spring Boot | `ReadinessDrainLifecycle` — a `SmartLifecycle` at `DEFAULT_PHASE`, so it stops before the web server does |
| FastAPI | `app/core/lifecycle.py` — uvicorn's signal handler is intercepted, and handed back after the grace period |

**`server.shutdown: graceful` is not sufficient on its own**, and the name is why
this rule is written down. It stops accepting new connections *immediately*, so
readiness does not turn 503 — it becomes unreachable, and the connections still
being routed to this instance are refused rather than drained. Step 1 is the part
that has to be added, in every language.

A template that claims to drain has been drained: send it a real SIGTERM, and watch
readiness go 503 while liveness stays 200.

## 10. Every template ships

- `README.md` — what it is, how to run it, the layout, and **why** it is shaped
  that way. Written for someone who has never seen the project.
- A test suite that runs with **one command** and passes on a clean clone.
- `.gitignore` (as `_gitignore` — npm rewrites a real one).
- A `database/` directory, if it has a database.
- Health probes, if it is a server.
- No abbreviations. See rule 1.

## 11. Comments earn their place

A comment says **why**, never what. It states a constraint the code cannot: a
trap in a library, an ordering that is load-bearing, a decision that looks wrong
until you know the reason. It never narrates the next line, and it never says
where the code came from.
