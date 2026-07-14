import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import Page, UserCreate, UserRead, UserUpdate


def list_users(database: Session, *, page: int, limit: int, q: str | None) -> Page[UserRead]:
    stmt = select(User)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))

    total = database.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = database.scalars(
        stmt.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    ).all()

    return Page[UserRead](
        items=[UserRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if limit else 0,
    )


def get_user(database: Session, user_id: uuid.UUID) -> User:
    user = database.get(User, user_id)
    if user is None:
        raise ApiError.not_found(f"User {user_id} not found")
    return user


def find_user_by_email(database: Session, email: str) -> User | None:
    """Email is the natural key. Returns None instead of raising, because a
    caller that is deciding between create and update is not in an error case."""
    return database.scalar(select(User).where(User.email == email))


def create_user(database: Session, payload: UserCreate) -> User:
    if find_user_by_email(database, payload.email) is not None:
        raise ApiError.conflict(f"A user with email {payload.email} already exists")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    database.add(user)
    database.commit()
    database.refresh(user)
    return user


def update_user(database: Session, user_id: uuid.UUID, payload: UserUpdate) -> User:
    user = get_user(database, user_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    # Stamped here rather than with `onupdate=` on the column, because the
    # service is the only layer allowed to write and this keeps the rule visible.
    user.updated_at = datetime.now(UTC)

    database.commit()
    database.refresh(user)
    return user


def delete_user(database: Session, user_id: uuid.UUID) -> None:
    database.delete(get_user(database, user_id))
    database.commit()
