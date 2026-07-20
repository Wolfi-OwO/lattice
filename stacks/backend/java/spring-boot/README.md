# {{projectTitle}}

REST API — Spring Boot 3, Java 21, JPA, Flyway, Spring Security + JWT.

## Getting started

```bash
docker compose up -d database   # Postgres on :5432
./mvnw spring-boot:run             # http://localhost:{{port}}
./mvnw test
```

## Demo data

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=seed                                    # database:seed
./mvnw spring-boot:run -Dspring-boot.run.profiles=seed -Dspring-boot.run.arguments=--reset
```

The loader and its data live in [`database/`](database/README.md). It is
idempotent (matched on email), it goes through `UserRepository` rather than SQL,
and it hashes the plaintext passwords in `database/data/users.json` with the same
`PasswordEncoder` the API uses — so a demo account can actually log in.

Everywhere else in this library the task is spelled `database:seed`. Maven has no
user-defined task names, so a Spring profile named `seed` is as close as it gets;
`database/README.md` says so.

## Layout — package by feature

```
{{javaPackage}}
├── {{mainClass}}.java
├── common/          Cross-cutting: ApiException, GlobalExceptionHandler, PageResponse
├── config/          SecurityConfig and other @Configuration
├── security/        JwtService, JwtAuthenticationFilter
└── user/            ONE FEATURE = ONE PACKAGE
    ├── UserController.java    HTTP surface
    ├── UserService.java       Business rules, no HTTP types
    ├── UserRepository.java    Spring Data
    ├── UserMapper.java        MapStruct entity -> DTO
    ├── User.java              JPA entity
    └── dto/                   Request/response records
```

Two directories sit outside the package tree, at the project root:

```
database/                       Demo data and its loader — FillDemoData.java
src/main/resources/database/    Flyway migrations
```

`FillDemoData.java` compiles into `{{javaPackage}}.database` even though it lives
outside `src/main/java` — `pom.xml` adds `database/` as a second source root, and
explains why.

Everything a feature needs sits in one package, with the layers *inside* it.
That is the structure the Spring community has converged on for anything
team-sized: a feature can be read, reviewed, moved or deleted without touching
five sibling directories.

**Adding a feature:** copy `user/`, rename, done. It needs no wiring — Spring
component-scans from the application class's package downward.

## Rules worth keeping

- **Entities never leave the service layer.** Controllers return DTOs. That is
  why `passwordHash` cannot leak: it simply has nowhere to go.
- **Flyway owns the schema**, `ddl-auto: validate` enforces it. Change the
  model → add `V2__…​.sql`. Never let Hibernate mutate a real database.
- **Throw `ApiException`** from services. `GlobalExceptionHandler` maps it, so
  no controller needs a try/catch.
- **`open-in-view: false`** is deliberate — it forces you to load what you need
  in the service instead of triggering lazy queries during JSON serialisation.

## Config

Everything is overridable by environment variable: `DATABASE_URL`, `DATABASE_USER`,
`DATABASE_PASSWORD`, `JWT_SECRET`, `PORT`. Defaults in `application.yml` target
local dev only — `JWT_SECRET` **must** be set to a real 32-byte secret in
production.

Health probes: `GET /api/health/liveness`, `GET /api/health/readiness` — the same paths
every other backend serves. Actuator is moved off `/actuator` in `application.yml` to
keep that contract. Graceful shutdown is on: SIGTERM flips readiness to 503 while
liveness stays 200, in-flight requests finish, then the process exits.
