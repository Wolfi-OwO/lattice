import math
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.product import Product
from app.repository import product_repository
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.schemas.user import Page


def _normalise_sku(sku: str) -> str:
    """Stored uppercase so `desk-1` and `DESK-1` are one product. Done here
    because the unique constraint is on the stored value: normalise anywhere
    else and two rows the database calls distinct are the same to a human."""
    return sku.upper()


def list_products(database: Session, *, page: int, limit: int, q: str | None) -> Page[ProductRead]:
    rows, total = product_repository.list_products(database, page=page, limit=limit, q=q)

    return Page[ProductRead](
        items=[ProductRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if limit else 0,
    )


def get_product(database: Session, product_id: uuid.UUID) -> Product:
    product = product_repository.get_by_id(database, product_id)
    if product is None:
        raise ApiError.not_found(f"Product {product_id} not found")
    return product


def find_product_by_sku(database: Session, sku: str) -> Product | None:
    return product_repository.find_by_sku(database, _normalise_sku(sku))


def create_product(database: Session, payload: ProductCreate) -> Product:
    if find_product_by_sku(database, payload.sku) is not None:
        raise ApiError.conflict(f"A product with SKU {payload.sku} already exists")

    product = Product(
        sku=_normalise_sku(payload.sku),
        name=payload.name,
        description=payload.description,
        price_cents=payload.price_cents,
        stock=payload.stock,
    )
    return product_repository.add(database, product)


def update_product(database: Session, product_id: uuid.UUID, payload: ProductUpdate) -> Product:
    product = get_product(database, product_id)

    changes = payload.model_dump(exclude_unset=True)

    if "sku" in changes:
        # Checked against the row being edited, not just for existence: without
        # the id comparison, a PATCH carrying the product's own unchanged SKU
        # would conflict with itself.
        existing = find_product_by_sku(database, changes["sku"])
        if existing is not None and existing.id != product_id:
            raise ApiError.conflict(f"A product with SKU {changes['sku']} already exists")
        changes["sku"] = _normalise_sku(changes["sku"])

    for field, value in changes.items():
        setattr(product, field, value)

    # Stamped here rather than with `onupdate=` on the column, because the
    # service is the only layer allowed to write and this keeps the rule visible.
    product.updated_at = datetime.now(UTC)

    return product_repository.save(database, product)


def delete_product(database: Session, product_id: uuid.UUID) -> None:
    product_repository.delete(database, get_product(database, product_id))


def adjust_stock(database: Session, product_id: uuid.UUID, delta: int) -> Product:
    """Stock movement, expressed as a delta rather than a new absolute value.

    "Set stock to 7" loses a concurrent sale; "subtract 1" does not. This is the
    one product operation with a real invariant — stock must not go negative —
    and it belongs here rather than in a route, where a caller could skip it by
    PATCHing `stock` directly. That is also why `stock` is not on ProductUpdate.
    """
    if delta == 0:
        raise ApiError.bad_request(
            "delta must be a non-zero integer — use a negative number to remove stock"
        )

    product = get_product(database, product_id)

    nxt = product.stock + delta
    if nxt < 0:
        raise ApiError.conflict(
            f"Cannot remove {abs(delta)} from stock — only {product.stock} of {product.sku} remain"
        )

    product.stock = nxt
    product.updated_at = datetime.now(UTC)

    return product_repository.save(database, product)
