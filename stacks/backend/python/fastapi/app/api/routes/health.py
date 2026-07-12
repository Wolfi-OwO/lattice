from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import DbSession

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def liveness() -> dict:
    """Is the process up at all."""
    return {"status": "ok"}


@router.get("/ready")
def readiness(db: DbSession, response: Response) -> dict:
    """Can we actually serve traffic — i.e. is the database reachable."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "dependencies": {"database": "up"}}
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "dependencies": {"database": "down"}}
