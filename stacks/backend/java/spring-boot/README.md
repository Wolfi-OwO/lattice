# {{projectTitle}}

REST API — Spring Boot 3, Java 21, JPA, Flyway, Spring Security + JWT.

## Getting started

```bash
docker compose up -d db      # Postgres on :5432
mvn spring-boot:run          # http://localhost:{{port}}
mvn test
```

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

Everything is overridable by environment variable: `DB_URL`, `DB_USER`,
`DB_PASSWORD`, `JWT_SECRET`, `PORT`. Defaults in `application.yml` target local
dev only — `JWT_SECRET` **must** be set to a real 32-byte secret in production.

Health probes: `GET /actuator/health/liveness`, `/actuator/health/readiness`.
