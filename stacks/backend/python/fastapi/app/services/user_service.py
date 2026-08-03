import math
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import hash_password
from app.models.user import User
from app.repository import user_repository
from app.schemas.user import Page, UserCreate, UserRead, UserUpdate


def list_users(database: Session, *, page: int, limit: int, q: str | None) -> Page[UserRead]:
    rows, total = user_repository.list_users(database, page=page, limit=limit, q=q)

    return Page[UserRead](
        items=[UserRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if limit else 0,
    )


def get_user(database: Session, user_id: uuid.UUID) -> User:
    user = user_repository.get_by_id(database, user_id)
    if user is None:
        raise ApiError.not_found(f"User {user_id} not found")
    return user


def find_user_by_email(database: Session, email: str) -> User | None:
    return user_repository.find_by_email(database, email)


def create_user(database: Session, payload: UserCreate) -> User:
    if find_user_by_email(database, payload.email) is not None:
        raise ApiError.conflict(f"A user with email {payload.email} already exists")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    return user_repository.add(database, user)


def update_user(database: Session, user_id: uuid.UUID, payload: UserUpdate) -> User:
    user = get_user(database, user_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    # Stamped here rather than with `onupdate=` on the column, because the
    # service is the only layer allowed to write and this keeps the rule visible.
    user.updated_at = datetime.now(UTC)

    return user_repository.save(database, user)


def delete_user(database: Session, user_id: uuid.UUID) -> None:
    user_repository.delete(database, get_user(database, user_id))
