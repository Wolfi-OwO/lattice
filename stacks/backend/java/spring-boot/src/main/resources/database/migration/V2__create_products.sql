-- This file, not the entity, owns the schema (CONVENTIONS.md rule 8). Hibernate
-- runs with ddl-auto: validate, so a column that exists on Product.java and not
-- here — or a nullability that disagrees — fails at BOOT rather than quietly
-- altering a table. Keep the two in lockstep: column name for column name.
CREATE TABLE products (
    id          UUID PRIMARY KEY,
    sku         VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NOT NULL,
    -- Integer cents, never NUMERIC or DOUBLE. See Product.java: binary floating
    -- point cannot hold 0.10 exactly, and BIGINT leaves no room for a rounding
    -- question to be asked in the first place.
    price_cents BIGINT       NOT NULL,
    stock       INTEGER      NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL
);

-- SKUs are stored uppercase (Product.normaliseSku), so a plain index serves the
-- lookups the repository does. The UNIQUE above already indexes the column; this
-- covers the `?q=` search, which matches on a fragment of name or SKU.
CREATE INDEX idx_products_name ON products (name);
