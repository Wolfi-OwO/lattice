import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.user import User


def list_users(
    database: Session, *, page: int, limit: int, q: str | None
) -> tuple[list[User], int]:
    stmt = select(User)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))

    total = database.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = database.scalars(
        stmt.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    ).all()

    return list(rows), total


def get_by_id(database: Session, user_id: uuid.UUID) -> User | None:
    return database.get(User, user_id)


def find_by_email(database: Session, email: str) -> User | None:
    """Email is the natural key. Returns None instead of raising, because a
    caller that is deciding between create and update is not in an error case."""
    return database.scalar(select(User).where(User.email == email))


def add(database: Session, user: User) -> User:
    database.add(user)
    database.commit()
    database.refresh(user)
    return user


def save(database: Session, user: User) -> User:
    """Persists mutations already applied to a tracked instance."""
    database.commit()
    database.refresh(user)
    return user


def delete(database: Session, user: User) -> None:
    database.delete(user)
    database.commit()
