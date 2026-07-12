import uuid

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, DbSession, require_admin
from app.schemas.user import Page, UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=Page[UserRead])
def list_users(
    db: DbSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    q: str | None = None,
) -> Page[UserRead]:
    return user_service.list_users(db, page=page, limit=limit, q=q)


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: uuid.UUID, db: DbSession) -> UserRead:
    return user_service.get_user(db, user_id)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: DbSession, response: Response) -> UserRead:
    user = user_service.create_user(db, payload)
    response.headers["Location"] = f"/api/users/{user.id}"
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: uuid.UUID, payload: UserUpdate, db: DbSession, _: CurrentUser) -> UserRead:
    return user_service.update_user(db, user_id, payload)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, db: DbSession, _: dict = Depends(require_admin)) -> None:
    user_service.delete_user(db, user_id)
