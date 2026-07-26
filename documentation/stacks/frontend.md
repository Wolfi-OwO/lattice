# Frontend stacks

| Stack | Language | What it is |
| --- | --- | --- |
| `react-vite` | JavaScript | React + Vite — react-router, an API client, a dev proxy |
| `react-vite-ts` | TypeScript | The same project, typed |

```bash
lattice shop --stack react-vite
lattice shop --stack react-vite-ts
```

The two are deliberately the same project twice. Same folders, same components,
same router — the TypeScript one adds types and changes nothing else. That is
what makes "should this be TypeScript" a decision you make at scaffold time
rather than one you have to live with.

## Layout

```
src/
  lib/api.js          the single place that knows how to talk to the backend
  hooks/useUsers.js   data fetching, one hook per resource
  pages/              one component per route
  layouts/            RootLayout — the shell every page renders inside
  components/         the pieces used by more than one page
  router.jsx          react-router configuration
  main.jsx
```

## Talking to a backend

`src/lib/api.js` is the only file that knows where the API lives, and the only
one that calls `fetch`. It understands the backends'
[shared error envelope](backend.md#the-error-envelope) and turns it into a thrown
`ApiError` carrying the status, the message and the validation details:

```js
try {
  await api.post('/users', { email, password });
} catch (error) {
  // error.status, error.message, error.details — from the envelope
}
```

That is the part that is easy to skip and expensive to skip. `fetch` does not
reject on a `4xx`, so a component that awaits a bare `fetch` treats a rejected
write as a success. Every request in the generated project goes through the one
function that checks.

### No CORS, no hardcoded URL

In development, Vite proxies `/api` to the backend, so the browser only ever
talks to one origin:

```js
proxy: {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
}
```

The base URL stays relative, so nothing absolute is compiled into the bundle. For
production, where the API may live on another origin, `VITE_API_URL` overrides
it — and it is the only variable in `.env.example`.

When you scaffold a [fullstack project](fullstack.md), the port that proxy points
at is the port the backend was actually given, and the dev server takes a
different one, so both halves run at once without a collision to discover.

## What CI proves about these

`templates-javascript.yml` scaffolds both frontends and runs **every check the
template declares** — not a check chosen in the workflow. The list is derived
from the generated project's own `package.json`, so a script added to a template
is picked up automatically instead of being written down in two places and
drifting.

In practice that is `lint`, `build` and `prettier --check` for both, plus
`typecheck` for the TypeScript one. All of those had existed in the templates
long before anything ran them: the workflow used to run `npm run build` for
`react-vite` and nothing else, the TypeScript template's `typecheck` had never
run at all, and the first `prettier --check` against a scaffolded project found
23 unformatted files across five templates. None of it was broken. None of it was
verified.
