# {{projectTitle}}

REST API — Express 4, Joi, JWT, Winston. Storage: **{{databaseLabel}}**.

## Getting started

```bash
npm run dev               # http://localhost:{{port}}
```

That is all. `lattice` already installed the dependencies, wrote `.env` with a
real `JWT_SECRET`, and started the database if this project needs one.

## Scripts

| Script                  | Does                                          |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Watch mode, restarts on change                |
| `npm start`             | Production start                              |
| `npm test`              | Mocha + supertest against a throwaway test DB |
| `npm run test:coverage` | Same, with c8 coverage                        |
| `npm run lint`          | ESLint                                        |
| `npm run format`        | Prettier                                      |

## Layout

```
src/
├── server.js           The ONLY startup file: builds and exports the Express
│                        app (module scope, no createApp() factory), mounts
│                        routes, and — guarded so importing it for tests never
│                        triggers this — connects storage, starts the HTTP
│                        server, and wires graceful shutdown.
├── config/              The only place that reads process.env
├── routes/
│   ├── index.js          Mounts every resource router
│   ├── health.routes.js
│   ├── users.routes.js         HTTP surface + middleware chain
│   └── products.routes.js
├── handlers/             One file per resource — translates HTTP <-> service
│   ├── users.handlers.js
│   └── products.handlers.js
├── services/              Business logic, no Express types. One file per
│   ├── user-service.js     entity.
│   └── product-service.js
├── validation/            Joi schemas, one file per resource
│   ├── user.validation.js
│   └── product.validation.js
├── middlewares/          auth, validate, error, requestLogger
├── database/             The storage seam — see below
└── utils/                ApiError, asyncHandler, logger
```

**Adding a resource:** copy `users.routes.js` / `users.handlers.js` /
`user-service.js` / `user.validation.js`, rename them for the new resource,
mount the route in `routes/index.js`. Nothing else changes.

The layering rule that keeps this maintainable: **routes** declare the HTTP
surface, **handlers** do nothing but call a service and shape a response,
**services** hold the business rules and never see `req`/`res`. When a
handler starts growing `if`s that aren't about status codes, that logic
belongs in the service.

## The storage seam

```
src/database/
├── index.js         exposes database.users, connectDatabase(), ping()
├── serialize.js     toPublicUser — the reason passwordHash cannot leak
└── adapters/
    └── {{databaseAdapter}}.js
```

Nothing above `src/database/` imports a database driver. The service layer calls
`database.users.list / findById / findByEmail / create / update / remove`, and the
adapter underneath decides whether that means a Mongo query, a SQL statement, or
a JSON file.

Two consequences worth knowing:

- **Changing database is one file.** Drop a new adapter into `adapters/`, point
  `index.js` at it, and no route, controller, service or test changes.
- **`passwordHash` cannot leak.** Every adapter returns rows through
  `toPublicUser`, which allowlists fields. The hash is only ever returned when
  `findByEmail` is explicitly asked for it, which only the login path does. Add a
  sensitive column tomorrow and it stays invisible by default.

## Errors

Throw `ApiError` from anywhere; `middlewares/error.js` maps it to a response.
Anything else becomes a 500 and gets logged with a stack trace — in production
the message is not leaked to the client.

```js
import { ApiError } from '../utils/ApiError.js';

if (!order) throw ApiError.notFound(`Order ${id} not found`);
```

Async handlers must be wrapped in `asyncHandler` — Express 4 does not catch
promise rejections on its own.
