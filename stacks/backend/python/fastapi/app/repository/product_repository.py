import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.product import Product


def list_products(
    database: Session, *, page: int, limit: int, q: str | None
) -> tuple[list[Product], int]:
    stmt = select(Product)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Product.name.ilike(pattern), Product.sku.ilike(pattern)))

    total = database.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = database.scalars(
        stmt.order_by(Product.created_at.desc()).offset((page - 1) * limit).limit(limit)
    ).all()

    return list(rows), total


def get_by_id(database: Session, product_id: uuid.UUID) -> Product | None:
    return database.get(Product, product_id)


def find_by_sku(database: Session, sku: str) -> Product | None:
    """SKU is the natural key. Returns None instead of raising, because a caller
    deciding between create and update is not in an error case."""
    return database.scalar(select(Product).where(Product.sku == sku))


def add(database: Session, product: Product) -> Product:
    database.add(product)
    database.commit()
    database.refresh(product)
    return product


def save(database: Session, product: Product) -> Product:
    """Persists mutations already applied to a tracked instance."""
    database.commit()
    database.refresh(product)
    return product


def delete(database: Session, product: Product) -> None:
    database.delete(product)
    database.commit()
