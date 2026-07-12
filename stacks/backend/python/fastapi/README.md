# {{projectTitle}}

REST API — FastAPI, SQLAlchemy 2, Alembic, Pydantic v2.

## Getting started

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env

docker compose up -d db          # Postgres on :5432
alembic revision --autogenerate -m "create users"
alembic upgrade head

uvicorn app.main:app --reload    # http://localhost:{{port}}/docs
pytest
```

## Layout

```
app/
├── main.py           App assembly: middleware, error handlers, router
├── core/             config (pydantic-settings), security (JWT/bcrypt), errors
├── api/
│   ├── router.py     Mounts every route module
│   ├── deps.py       Reusable dependencies: DbSession, CurrentUser, require_admin
│   └── routes/       One file per resource — HTTP surface only
├── services/         Business rules. No FastAPI types cross this boundary.
├── models/           SQLAlchemy ORM (the database)
├── schemas/          Pydantic (the API contract)
└── db/session.py     Engine, SessionLocal, Base, get_db
```

The split that does the work here is **models vs schemas**. The ORM object is
never returned from a route — a `UserRead` schema is. That is why
`password_hash` cannot leak: it has nowhere to go.

Routes stay thin because everything reusable is a dependency (`app/api/deps.py`).
`DbSession` and `CurrentUser` are just annotated types — add them to a signature
and FastAPI wires them up.

## Migrations

`alembic revision --autogenerate -m "..."` after every model change, then
`alembic upgrade head`. Autogenerate only sees models imported in
`alembic/env.py` — add new model modules to the import there.

## Docs

`/docs` is served in development only — `main.py` disables it when
`ENVIRONMENT=production`.
