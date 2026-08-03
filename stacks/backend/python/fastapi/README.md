# {{projectTitle}}

REST API — FastAPI, SQLAlchemy 2, Alembic, Pydantic v2.

## Getting started

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env

docker compose up -d database    # Postgres on :5432
alembic upgrade head             # creates the users table — the migration ships with the template

python database/fill_demo_data.py   # six demo users you can log in as
uvicorn app.main:app --reload       # http://localhost:{{port}}/docs
pytest
```

## Layout

```
app/
├── main.py                 App assembly: middleware, error handlers, router
├── core/                   config (pydantic-settings), security (JWT/bcrypt), errors
├── api/
│   ├── router.py           Mounts every route module
│   ├── deps.py             Reusable dependencies: DatabaseSession, CurrentUser, require_admin
│   └── routes/             One file per resource — HTTP surface only
├── services/               Business rules. No FastAPI types, no SQLAlchemy
│                           queries — everything goes through repository/.
├── repository/             The only layer that queries. One file per entity
│                           (user_repository.py, product_repository.py).
├── models/                 SQLAlchemy ORM (the database)
├── schemas/                Pydantic (the API contract)
└── database/session.py     Engine, SessionLocal, Base, get_database

database/                   Demo data and its loader — see database/README.md
```

The split that does the work here is **models vs schemas**. The ORM object is
never returned from a route — a `UserRead` schema is. That is why
`password_hash` cannot leak: it has nowhere to go.

The other split is **services vs repository**. A service owns business rules
(uniqueness checks, the stock-can't-go-negative invariant, password hashing);
a repository owns nothing but the `Session` calls that read and write a row.
A service that needs data asks its repository for it — it never imports
`sqlalchemy` itself.

Routes stay thin because everything reusable is a dependency (`app/api/deps.py`).
`DatabaseSession` and `CurrentUser` are just annotated types — add them to a
signature and FastAPI wires them up.

## Demo data

```bash
python database/fill_demo_data.py            # add the demo rows that are missing
python database/fill_demo_data.py --reset    # delete every row first, then load
```

The loader goes through `app/services/user_service.py`, so it works against
whatever storage this project is pointed at. It is idempotent — running it twice
creates no duplicates. `database/README.md` explains how to add a domain.

## Migrations

The migrations own the schema; the models never create it. The initial
migration — `alembic/versions/0001_create_users.py` — ships with the template,
so a fresh project needs nothing but `alembic upgrade head` to run.

After a model change, autogenerate the next revision:

```bash
alembic revision --autogenerate -m "..."   # writes alembic/versions/<id>_....py
alembic upgrade head
```

Read the generated file before applying it. Autogenerate only sees models
imported in `alembic/env.py` — add new model modules to the import there.

## Docs

`/docs` is served in development only — `main.py` disables it when
`ENVIRONMENT=production`.
