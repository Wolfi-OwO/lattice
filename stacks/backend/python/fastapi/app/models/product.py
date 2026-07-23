import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Product(Base):
    __tablename__ = "products"

    # sqlalchemy.Uuid maps to native UUID on Postgres and CHAR(32) elsewhere,
    # so the same model runs against SQLite in tests.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # SKU is to a product what email is to a user: the key a human already knows.
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Text, not String(n): a description is prose, and capping it at some round
    # number is a limit nobody chose. Defaulted to "" so the column is never null.
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Integer cents, never a float. Binary floating point cannot hold 0.10
    # exactly, and money that drifts by a cent is a bug nobody can reproduce.
    # BigInteger so a price cannot silently overflow a 32-bit column.
    price_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    # Written by `app/services/product_service.py` on every update — the service
    # is the one layer that owns writes, so a caller cannot forget to touch this.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
