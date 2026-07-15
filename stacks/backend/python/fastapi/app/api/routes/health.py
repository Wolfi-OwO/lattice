from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import DatabaseSession
from app.core.lifecycle import is_draining

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/liveness")
def liveness() -> dict:
    """Is this process alive — and nothing more.

    Two rules, both load-bearing:

    1. It must not touch the database. A liveness probe that checks a dependency
       turns a slow database into a restart loop: the database blips, every replica
       reports dead, the orchestrator kills them all, and the outage is now yours
       too. Dependency health is a *readiness* question.

    2. It must keep answering 200 while the process is draining. A failing liveness
       probe makes the kubelet SIGKILL the pod — mid-drain, which is precisely what
       graceful shutdown exists to prevent.
    """
    return {"status": "ok"}


@router.get("/readiness")
def readiness(database: DatabaseSession, response: Response) -> dict:
    """Should traffic be sent here.

    Two ways the answer is no, and they are different failures:

    - We are shutting down. Checked *first*, and without touching the database: the
      database is fine, we are the ones leaving, and the load balancer needs to know
      before the socket closes rather than after.
    - The database is unreachable. The process is alive but cannot serve, so it says
      so and stays up — a restart would not help, and the probe recovers by itself
      when the database comes back.
    """
    if is_draining():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "shutting_down", "dependencies": {"database": "draining"}}

    try:
        database.execute(text("SELECT 1"))
        return {"status": "ok", "dependencies": {"database": "up"}}
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "dependencies": {"database": "down"}}
