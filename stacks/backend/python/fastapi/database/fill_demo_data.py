#!/usr/bin/env python3
"""Loads database/data/<domain>.json into whatever storage this project was
scaffolded with.

    python database/fill_demo_data.py             add what is missing
    python database/fill_demo_data.py --reset     delete everything first

It goes through `app.services.user_service` — the same service the routes use —
and never through raw SQL. That is what makes one loader work unchanged against
{{databaseLabel}} and against every other storage the template supports: the
loader does not know which one is underneath, and does not need to.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

# The loader sits outside the `app` package on purpose — the Dockerfile copies
# only `app/`, so demo data cannot reach a production image. The price is that
# the project root has to be put on the path by hand.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm import Session  # noqa: E402

from app.database.session import SessionLocal  # noqa: E402
from app.models.user import Role  # noqa: E402
from app.schemas.product import ProductCreate, ProductUpdate  # noqa: E402
from app.schemas.user import UserCreate, UserUpdate  # noqa: E402
from app.services import product_service, user_service  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "data"

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("database.seed")


def fill_users(database: Session, rows: list[dict[str, Any]], *, reset: bool) -> tuple[int, int]:
    """Matched on email, which is the natural key the API already enforces as
    unique. Re-running therefore updates the name and role of a demo user rather
    than failing on a duplicate — seeding is not a once-per-database event.
    """
    if reset:
        page = user_service.list_users(database, page=1, limit=1000, q=None)
        for user in page.items:
            user_service.delete_user(database, user.id)

    created = 0
    updated = 0

    for row in rows:
        email = row["email"]
        name = row["name"]
        role = Role(row.get("role", Role.USER))

        existing = user_service.find_user_by_email(database, email)
        if existing is not None:
            user_service.update_user(database, existing.id, UserUpdate(name=name, role=role))
            updated += 1
            continue

        # Created through the service, so the plaintext in the JSON is hashed by
        # `app/core/security.py` — the exact code path the API uses — and a demo
        # account can therefore actually log in. The plaintext never lands in a row.
        user = user_service.create_user(
            database, UserCreate(email=email, name=name, password=row["password"])
        )
        # `UserCreate` has no `role`: the API refuses to let a caller sign itself
        # up as an admin. The loader is not a caller, so it sets the role after.
        user_service.update_user(database, user.id, UserUpdate(role=role))
        created += 1

    return created, updated


def fill_products(database: Session, rows: list[dict[str, Any]], *, reset: bool) -> tuple[int, int]:
    """Matched on SKU, the natural key the API already enforces as unique — so a
    second run adjusts price and stock rather than failing on a duplicate."""
    if reset:
        page = product_service.list_products(database, page=1, limit=1000, q=None)
        for product in page.items:
            product_service.delete_product(database, product.id)

    created = 0
    updated = 0

    for row in rows:
        existing = product_service.find_product_by_sku(database, row["sku"])
        if existing is not None:
            product_service.update_product(
                database,
                existing.id,
                ProductUpdate(
                    name=row["name"],
                    description=row.get("description", ""),
                    price_cents=row["price_cents"],
                ),
            )
            # stock is not on ProductUpdate — it moves as a delta. On a re-seed we
            # set it to the demo value directly, which is the one place allowed to.
            existing.stock = row.get("stock", 0)
            database.commit()
            updated += 1
            continue

        product_service.create_product(
            database,
            ProductCreate(
                sku=row["sku"],
                name=row["name"],
                description=row.get("description", ""),
                price_cents=row["price_cents"],
                stock=row.get("stock", 0),
            ),
        )
        created += 1

    return created, updated


# How a row in data/<domain>.json becomes a row in the database.
#
# One entry per domain. A data file with no entry here is a mistake worth
# hearing about, so it is reported rather than skipped quietly.
DOMAINS: dict[str, Callable[..., tuple[int, int]]] = {
    "users": fill_users,
    "products": fill_products,
}


def read_domain(file: Path) -> list[dict[str, Any]]:
    rows = json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"database/data/{file.name} must contain a JSON array.")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Load the demo data in database/data/.")
    parser.add_argument("--reset", action="store_true", help="delete existing rows first")
    arguments = parser.parse_args()

    if arguments.reset:
        logger.warning("--reset: existing rows will be deleted")

    files = sorted(DATA_DIR.glob("*.json")) if DATA_DIR.is_dir() else []

    with SessionLocal() as database:
        for file in files:
            domain = file.stem
            fill = DOMAINS.get(domain)

            if fill is None:
                logger.warning(
                    'No loader registered for "%s" — add it to DOMAINS in fill_demo_data.py',
                    domain,
                )
                continue

            created, updated = fill(database, read_domain(file), reset=arguments.reset)
            logger.info("%s: %d created, %d already there", domain, created, updated)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        logger.error("Seeding failed: %s", error)
        sys.exit(1)
