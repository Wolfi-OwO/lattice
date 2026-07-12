# {{projectTitle}}

REST API — Express 4, Joi, JWT, Winston. Storage: **{{dbLabel}}**.

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
├── server.js          Boot: connect storage, listen, graceful shutdown
├── app.js             Express app (no port) — tests import this
├── config/            The only place that reads process.env
├── api/
│   ├── index.js       Mounts every resource router
│   ├── health/        Liveness + readiness probes
│   └── users/         One resource = one folder
│       ├── user.routes.js       HTTP surface + middleware chain
│       ├── user.controller.js   Translates HTTP <-> service
│       ├── user.service.js      Business logic, no Express types
│       └── user.validation.js   Joi schemas
├── middlewares/       auth, validate, error, requestLogger
├── db/                The storage seam — see below
└── utils/             ApiError, asyncHandler, logger
```

**Adding a resource:** copy `api/users/`, rename the files, mount it in
`api/index.js`. Nothing else changes.

The layering rule that keeps this maintainable: **routes** declare the HTTP
surface, **controllers** do nothing but call a service and shape a response,
**services** hold the business rules and never see `req`/`res`. When a
controller starts growing `if`s that aren't about status codes, that logic
belongs in the service.

## The storage seam

```
src/db/
├── index.js         exposes db.users, connectDatabase(), ping()
├── serialize.js     toPublicUser — the reason passwordHash cannot leak
└── adapters/
    └── {{dbAdapter}}.js
```

Nothing above `src/db/` imports a database driver. The service layer calls
`db.users.list / findById / findByEmail / create / update / remove`, and the
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
import { ApiError } from '../../utils/ApiError.js';

if (!order) throw ApiError.notFound(`Order ${id} not found`);
```

Async handlers must be wrapped in `asyncHandler` — Express 4 does not catch
promise rejections on its own.
