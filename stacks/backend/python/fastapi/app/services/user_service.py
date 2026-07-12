import math
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import Page, UserCreate, UserRead, UserUpdate


def list_users(db: Session, *, page: int, limit: int, q: str | None) -> Page[UserRead]:
    stmt = select(User)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    ).all()

    return Page[UserRead](
        items=[UserRead.model_validate(row) for row in rows],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if limit else 0,
    )


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise ApiError.not_found(f"User {user_id} not found")
    return user


def create_user(db: Session, payload: UserCreate) -> User:
    exists = db.scalar(select(User).where(User.email == payload.email))
    if exists:
        raise ApiError.conflict(f"A user with email {payload.email} already exists")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: uuid.UUID, payload: UserUpdate) -> User:
    user = get_user(db, user_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: uuid.UUID) -> None:
    db.delete(get_user(db, user_id))
    db.commit()
