# {{projectTitle}}

React 18 + Vite.

```bash
npm install
npm run dev        # http://localhost:{{clientPort}}
```

## Layout

```
src/
├── main.jsx        Entry point
├── router.jsx      Every route, in one place
├── layouts/        Shells that wrap routes (<Outlet />)
├── pages/          One component per route
├── components/     Reusable, presentational
├── hooks/          Data fetching (SWR) and shared state
├── lib/api.js      The only module that calls fetch()
└── styles.css
```

## Talking to the API

`src/lib/api.js` is the single choke point for HTTP. Nothing else in the app
calls `fetch` — that way auth headers, error shaping and the base URL are
defined once.

In dev, `vite.config.js` proxies `/api` to `http://localhost:{{port}}`, so the
browser sees one origin and there is no CORS to configure. For a production
build where the API is on another host, set `VITE_API_URL`.

Data fetching goes through SWR in `src/hooks/` — see `useUsers.js` for the
pattern to copy: the hook owns the request and cache, the page owns UI state,
components stay dumb.
