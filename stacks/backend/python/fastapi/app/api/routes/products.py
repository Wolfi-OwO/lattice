import uuid

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, DatabaseSession, require_admin
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate, StockAdjust
from app.schemas.user import Page
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])


# Reading a catalogue is public; changing it is not. That split mirrors users,
# where anyone may register but only an authenticated caller may edit.
@router.get("", response_model=Page[ProductRead])
def list_products(
    database: DatabaseSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    q: str | None = None,
) -> Page[ProductRead]:
    return product_service.list_products(database, page=page, limit=limit, q=q)


@router.get("/{product_id}", response_model=ProductRead)
def get_product(product_id: uuid.UUID, database: DatabaseSession) -> ProductRead:
    return product_service.get_product(database, product_id)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    database: DatabaseSession,
    response: Response,
    _: CurrentUser,
) -> ProductRead:
    product = product_service.create_product(database, payload)
    response.headers["Location"] = f"/api/products/{product.id}"
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    database: DatabaseSession,
    _: CurrentUser,
) -> ProductRead:
    return product_service.update_product(database, product_id, payload)


# Stock is a delta, not an assignment — see product_service.adjust_stock.
@router.post("/{product_id}/stock", response_model=ProductRead)
def adjust_stock(
    product_id: uuid.UUID,
    payload: StockAdjust,
    database: DatabaseSession,
    _: CurrentUser,
) -> ProductRead:
    return product_service.adjust_stock(database, product_id, payload.delta)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: uuid.UUID, database: DatabaseSession, _: dict = Depends(require_admin)
) -> None:
    product_service.delete_product(database, product_id)
