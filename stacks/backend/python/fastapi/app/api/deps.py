from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import decode_access_token
from app.database.session import get_database

DatabaseSession = Annotated[Session, Depends(get_database)]


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    """Requires a valid bearer token; returns its claims."""
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError.unauthorized("Missing bearer token")

    claims = decode_access_token(authorization.removeprefix("Bearer "))
    if claims is None:
        raise ApiError.unauthorized("Invalid or expired token")

    return claims


CurrentUser = Annotated[dict, Depends(current_user)]


def require_admin(user: CurrentUser) -> dict:
    if user.get("role") != "admin":
        raise ApiError(403, "Forbidden")
    return user
