# Frontend stacks

| Stack | Language | What it is |
| --- | --- | --- |
| `react-vite` | JavaScript | React 19 + Vite — react-router, an API client, a dev proxy |
| `react-vite-ts` | TypeScript | The same project, typed |

```bash
lattice shop --stack react-vite
lattice shop --stack react-vite-ts
```

The two are deliberately the same project twice. Same folders, same components,
same router — the TypeScript one adds types and changes nothing else. That is
what makes "should this be TypeScript" a decision you make at scaffold time
rather than one you have to live with.

## Choosing a look

`--styling` is to a frontend what [`--database`](../guides/choosing-a-database.md)
is to a backend: the template ships every variant and the scaffold keeps exactly
one.

```bash
lattice shop --stack react-vite    --styling tailwind
lattice shop --stack react-vite-ts --styling bootstrap
```

| | Adds | Touches `vite.config.js` |
| --- | --- | --- |
| `plain` (default) | nothing | no |
| `scss` | `sass` (dev) | no |
| `bootstrap` | `bootstrap`, `sass` (dev) | no |
| `tailwind` | `tailwindcss`, `@tailwindcss/vite` (dev) | yes |

What makes the four interchangeable is a **class-name contract**:

`.app__header` · `.app__brand` · `.app__nav` · `.app__main` · `.table` ·
`.pager` · `.muted` · `.error`

The components are written against those names and never against a framework's,
so choosing Bootstrap changes the stylesheet and nothing else. Plain and SCSS
compile to byte-identical CSS; Bootstrap and Tailwind are themed to match the
others rather than left at their defaults.

The variants you did not choose are **deleted**, not left unimported — a stray
`bootstrap.scss` stops compiling the moment anyone imports it, because Bootstrap
is only installed if it was chosen. What ships is one `src/styles.css` (or
`styles.scss`), so the project reads as though it had only ever had one look.

Sass and Tailwind land in `devDependencies`. They are compile-time tools, and a
CSS compiler has no business in a production install.

!!! note "Only Tailwind touches the build"

    The other three leave `vite.config.js` reading exactly as though the feature
    did not exist. That is worth more than it sounds: a scaffolder that adds
    machinery for a choice you did not make is a scaffolder whose output you have
    to read before you can trust.

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
`typecheck` for the TypeScript one. Each styling variant is scaffolded and built
separately on top of that, and its **compiled** CSS grepped for the class
contract — a Tailwind run that matched nothing would still produce a stylesheet
and still go green otherwise. All of those had existed in the templates
long before anything ran them: the workflow used to run `npm run build` for
`react-vite` and nothing else, the TypeScript template's `typecheck` had never
run at all, and the first `prettier --check` against a scaffolded project found
23 unformatted files across five templates. None of it was broken. None of it was
verified.
