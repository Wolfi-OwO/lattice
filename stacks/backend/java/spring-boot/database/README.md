# database/

Demo data, and the code that loads it.

```
database/
├── FillDemoData.java   the loader — see "Running it" below
└── data/
    └── users.json      one file per domain
```

## Why the data is split by domain

`data/` holds **one file per domain**, not one big `seed.json`. A domain's demo
rows live next to nothing else, so adding a domain is adding a file — and two
people adding two domains do not collide in the same file.

Adding one is two steps:

1. Drop `data/products.json` in, a JSON array of plain objects.
2. Register how a row becomes a database row, in `FillDemoData.java`:

```java
private Map<String, DomainLoader> domains() {
    return Map.of(
            "users", this::fillUsers,
            "products", this::fillProducts);   // <- yours
}
```

A file with no entry in `domains()` is reported and skipped rather than silently
ignored — an unseeded domain that looks seeded is worse than a loud one.

The loader goes through `UserRepository`, the same repository the services use,
and never through JDBC. That is what lets one loader work unchanged against every
storage the template supports.

## Running it

CONVENTIONS.md rule 5 calls this task `database:seed` in every language. Maven has
no user-defined task names — only `plugin:goal` — so this is the closest it gets,
and it is the one place the convention is bent:

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=seed
mvn spring-boot:run -Dspring-boot.run.profiles=seed -Dspring-boot.run.arguments=--reset
```

The first adds the demo rows that are not there yet. The second deletes every row
first, then loads.

The loader only exists under the `seed` profile, so a normal `mvn spring-boot:run`
and `mvn test` never touch your data.

It reads `database/data/*.json` **relative to the working directory**, which
`pom.xml` pins to the project root for `spring-boot:run`. If you launch it any
other way, launch it from the project root.

It is **idempotent**: rows are matched on their natural key (email, for users), so
running it twice does not create duplicates and does not fail. That matters because
seeding is something you do repeatedly while developing, not once.

## How this compiles at all

`database/` is not on Maven's source path by default. `pom.xml` adds it as a second
compile source root with `build-helper-maven-plugin`, so `FillDemoData.java` is a
real class in the `…​.database` package and Spring's component scan finds it. The
comment in `pom.xml` says why.

## The passwords are not secrets

`password` in `users.json` is plaintext **on purpose** — the loader hashes it with
the same `PasswordEncoder` the API uses, so a demo account can actually log in.
These are demo credentials for a demo database. Do not point this loader at
production, and do not reuse the passwords anywhere real.
