---
title: lattice
---

# lattice

**Pick a stack, pick a database, get a project that already runs.**

A zero-dependency scaffolder whose output boots on the first command — no
`npm install`, no `.env` to copy, no database to remember to start.

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

That is the point. No `npm install`, no `cp .env.example .env`, no "remember to
start the database first". The project you land in **boots**.

## Where to go

<div class="grid cards" markdown>

- :material-clock-fast: **[Getting started](getting-started/index.md)**

    Install it, scaffold your first project, and understand what the four lines
    of output actually did.

- :material-layers-triple: **[Stacks](stacks/index.md)**

    The ten built-in templates, the 28 external generators, and why those are
    two different tiers rather than one long list.

- :material-book-open-variant: **[Guides](guides/choosing-a-database.md)**

    Choosing a database, health probes and graceful shutdown, the enterprise
    overlay, and how a release actually reaches npm.

- :material-console: **[CLI reference](reference/cli.md)**

    Every flag, what it refuses, and what it does when you leave it out.

</div>

## What makes it different

**It boots.** Most scaffolders hand you a directory and a README of things to do
next. lattice does those things: it installs dependencies with the project's own
package manager, writes a real `.env` rather than an `.env.example`, and starts
the database container.

**It picks a free port.** If something already listens on 27017, the Mongo
container is published on 27018 and `.env` is written to match. A scaffolder that
hardcodes the port either fails to bind — or, much worse, silently connects your
new project to a database that was already running there.

**It waits for the database to be *healthy*,** not merely started. `docker compose
up -d` returns while Postgres is still initialising, so the next command you run
dies on a refused connection and it looks like the scaffold is broken.

**The database is a choice, not a rewrite.** Six options behind one six-method
repository interface, so the routes, the controllers, the services and the test
suite are identical whichever you pick. See
[Choosing a database](guides/choosing-a-database.md).

**It has no dependencies.** Not a small number — none. `npm create lattice@latest`
downloads and runs the package before showing you a single prompt, and every
dependency on that path is time you wait for. The reasoning is written down in
[ADR-0001](project/adr/0001-zero-dependency-core.md).

## What it does not claim

The built-in stacks and the external generators are **not** the same thing, and
the difference is the point:

| | Built-in stack | `--generator` |
| --- | --- | --- |
| Held to [CONVENTIONS.md](project/conventions.md) | yes | no |
| Built and tested in CI on every push | yes | weekly |
| Needs the network | no | yes |
| Needs that toolchain installed | no | yes |
| Output verified by lattice | yes | no |

A generator delegates to the framework's own official tool and then layers
lattice's overlay on top. That is broad and current and *not verified here* —
which is why it is opt-in. See [Generators](stacks/generators.md).

C and C++ have no official scaffolding tool to delegate to — there is no
`cargo new` for CMake — so lattice claims neither tier for them rather than
inventing a layout and calling it standard. That is a gap, stated as one.
