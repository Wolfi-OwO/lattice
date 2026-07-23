import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# SKU: 3-32 characters of letters, digits or hyphens. The same shape every
# template validates; stored uppercase, so `desk-1` and `DESK-1` are one product.
SKU_PATTERN = r"^[A-Za-z0-9-]{3,32}$"


class ProductCreate(BaseModel):
    sku: str = Field(pattern=SKU_PATTERN)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    # Money is an integer number of cents, never a float. `int` with ge=0 is what
    # enforces that: pydantic rejects 19.99 for an int field, so a float price
    # cannot reach the service, let alone a column.
    price_cents: int = Field(ge=0)
    stock: int = Field(default=0, ge=0)


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, pattern=SKU_PATTERN)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    price_cents: int | None = Field(default=None, ge=0)
    # `stock` is deliberately absent. It moves through POST /{id}/stock as a
    # delta, so a concurrent sale cannot be overwritten by a stale absolute value.


class StockAdjust(BaseModel):
    # A zero delta is a no-op the caller almost certainly did not mean, so it is
    # rejected. There is no single "not zero" constraint, so it is validated in
    # the service where the message can explain the sign convention.
    delta: int


class ProductRead(BaseModel):
    """What the API returns. Products have nothing to hide today, but the ORM
    object is never serialised directly — so the day a product grows a cost price
    or a supplier margin, there is already one place that decides what is public."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    name: str
    description: str
    price_cents: int
    stock: int
    created_at: datetime
    updated_at: datetime
