import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_database
from app.database.session import Base
from app.main import app

# In-memory SQLite, one shared connection — fast, and no external service.
engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    def override_get_database():
        database = TestSession()
        try:
            yield database
        finally:
            database.close()

    app.dependency_overrides[get_database] = override_get_database
    yield TestClient(app)
    app.dependency_overrides.clear()
