# Fullstack

A backend at the root, a frontend in `client/`, both installed.

```bash
lattice shop --stack express --database sqlite --client react-vite-ts
```

```
shop/
  src/                 the backend
  tests/
  .env
  docker-compose.yml
  package.json
  client/
    src/
    package.json
```

Fullstack is **not a template**. There is no `stacks/fullstack/` directory and
nothing to keep in sync with the two halves it is made of — it is composed at
scaffold time from a backend template plus a frontend template, which is why
every backend improvement reaches it for free.

| Backends | Frontends |
| --- | --- |
| `express` · `spring-boot` · `fastapi` | `react-vite` · `react-vite-ts` |

## The ports line up

The backend takes `--port` (default `3000`); the client takes that plus 2000, so
`3000` and `5000`. Vite's dev proxy is written pointing at the backend's actual
port, so `/api` works from the moment both are running — there is no CORS to
configure and no URL to correct.

```bash
lattice shop --stack express --database sqlite --client react-vite --port 4000
# backend on 4000, client on 6000, proxy already pointing at 4000
```

Both halves are installed, so:

```bash
cd shop        && npm run dev     # terminal one
cd shop/client && npm run dev     # terminal two
```

## Why `client/` and not a monorepo

No workspaces, no root `package.json` orchestrating both, no `turbo.json`. Two
ordinary projects, one nested in the other.

A workspace setup is a real answer to a real problem — shared packages, one
install, one lockfile — and none of those problems exist yet in a project that
was created ninety seconds ago. What a workspace *does* cost immediately is that
neither half can be run, deployed, or reasoned about on its own, and that the
first thing you have to learn about your new project is its build tool. Splitting
`client/` out later is `git mv`; unpicking a workspace is not.

## What CI proves about this

The fullstack composition had **no coverage at all** until recently. It is the
shape the README leads with, it is the only path that writes two projects and
installs both, and nothing verified it. It worked; that was luck rather than
evidence.

`templates-javascript.yml` now scaffolds `express + react-vite` and
`express + react-vite-ts`, asserts that a backend really landed at the root and a
frontend really landed in `client/`, and then runs **each half's own derived
checks** — so the client is held to exactly the standard it would be held to if
it had been scaffolded on its own.
