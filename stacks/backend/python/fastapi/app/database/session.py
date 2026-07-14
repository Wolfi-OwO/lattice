from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base — every model inherits from this."""


def get_database() -> Generator[Session, None, None]:
    """FastAPI dependency. The session is closed even if the handler raises."""
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
