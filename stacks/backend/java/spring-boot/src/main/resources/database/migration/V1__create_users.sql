-- This file, not the entity, owns the schema (CONVENTIONS.md rule 8). Hibernate
-- runs with ddl-auto: validate, so a column that exists on User.java and not
-- here — or a nullability that disagrees — fails at BOOT rather than quietly
-- altering a table. Keep the two in lockstep: column name for column name.
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(80)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(16)  NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL
);

CREATE INDEX idx_users_email ON users (email);
