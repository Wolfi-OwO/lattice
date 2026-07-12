# {{projectTitle}}

React 18 + Vite + TypeScript (strict).

```bash
npm install
npm run dev        # http://localhost:{{clientPort}}
```

## Layout

```
src/
├── main.tsx        Entry point
├── router.tsx      Every route, in one place
├── layouts/        Shells that wrap routes (<Outlet />)
├── pages/          One component per route
├── components/     Reusable, presentational
├── hooks/          Data fetching (SWR) and shared state
├── lib/api.ts      The only module that calls fetch()
├── types/          Shared domain types — mirror the API contract here
└── styles.css
```

`@/` is aliased to `src/`, in both Vite and tsconfig.

## Talking to the API

`src/lib/api.ts` is the single choke point for HTTP. Its methods are generic —
`api.get<Paginated<User>>('/users')` — so response types flow through SWR into
components without a single cast.

In dev, `vite.config.ts` proxies `/api` to `http://localhost:{{port}}`, so the
browser sees one origin and there is no CORS. For a production build where the
API is on a different host, set `VITE_API_URL`.

Keep `src/types/` in sync with the backend's response shapes — it is the
contract, and `tsc --noEmit` is what enforces your side of it.
