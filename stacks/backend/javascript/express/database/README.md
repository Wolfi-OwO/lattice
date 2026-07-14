# database/

Demo data, and the script that loads it.

```
database/
├── fill-demo-data.js   the loader — run it with `npm run database:seed`
└── data/
    └── users.json      one file per domain
```

## Why the data is split by domain

`data/` holds **one file per domain**, not one big `seed.json`. A domain's demo
rows live next to nothing else, so adding a domain is adding a file — and two
people adding two domains do not collide in the same file.

Adding one is two steps:

1. Drop `data/products.json` in, an array of plain objects.
2. Register how a row becomes a database row, in `fill-demo-data.js`:

```js
const DOMAINS = {
  users: seedUsers,
  products: seedProducts,   // <- yours
};
```

A file with no entry in `DOMAINS` is reported and skipped rather than silently
ignored — an unseeded domain that looks seeded is worse than a loud one.

## Running it

```bash
npm run database:seed            # add the demo rows that are not there yet
npm run database:seed -- --reset # delete every row first, then load
```

It is **idempotent**: rows are matched on their natural key (email, for users),
so running it twice does not create duplicates and does not fail. That matters
because seeding is something you do repeatedly while developing, not once.

## The passwords are not secrets

`password` in `users.json` is plaintext **on purpose** — the loader hashes it
with bcrypt on the way in, exactly like the API does, so a demo account can
actually log in. These are demo credentials for a demo database. Do not point
this script at production, and do not reuse the passwords anywhere real.
