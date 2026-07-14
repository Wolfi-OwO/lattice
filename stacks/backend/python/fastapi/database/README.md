# database/

Demo data, and the script that loads it.

```
database/
├── fill_demo_data.py   the loader — run it with `python database/fill_demo_data.py`
└── data/
    └── users.json      one file per domain
```

## Why the data is split by domain

`data/` holds **one file per domain**, not one big `seed.json`. A domain's demo
rows live next to nothing else, so adding a domain is adding a file — and two
people adding two domains do not collide in the same file.

Adding one is two steps:

1. Drop `data/products.json` in, an array of plain objects.
2. Register how a row becomes a database row, in `fill_demo_data.py`:

```python
DOMAINS = {
    "users": fill_users,
    "products": fill_products,   # <- yours
}
```

A file with no entry in `DOMAINS` is reported and skipped rather than silently
ignored — an unseeded domain that looks seeded is worse than a loud one.

## Running it

```bash
python database/fill_demo_data.py            # add the demo rows that are not there yet
python database/fill_demo_data.py --reset    # delete every row first, then load
```

Run it from the project root, with the virtualenv active and the schema
migrated (`alembic upgrade head`) — the loader fills tables, it does not create
them. Migrations own the schema.

It goes through `app/services/user_service.py` — the same service the routes
call — and never through raw SQL, which is what lets one loader work against
{{databaseLabel}} and every other storage this template can be pointed at.

It is **idempotent**: rows are matched on their natural key (email, for users),
so running it twice does not create duplicates and does not fail. That matters
because seeding is something you do repeatedly while developing, not once.

## The passwords are not secrets

`password` in `users.json` is plaintext **on purpose** — the loader hashes them
the same way the API does (`app/core/security.py`, bcrypt), so a demo account
can actually log in. These are demo credentials for a demo database. Do not
point this script at production, and do not reuse the passwords anywhere real.
