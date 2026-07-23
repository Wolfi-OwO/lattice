from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """The only exception services raise for expected failures."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message

    @classmethod
    def bad_request(cls, message: str) -> "ApiError":
        return cls(status.HTTP_400_BAD_REQUEST, message)

    @classmethod
    def not_found(cls, message: str) -> "ApiError":
        return cls(status.HTTP_404_NOT_FOUND, message)

    @classmethod
    def conflict(cls, message: str) -> "ApiError":
        return cls(status.HTTP_409_CONFLICT, message)

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized") -> "ApiError":
        return cls(status.HTTP_401_UNAUTHORIZED, message)


def register_error_handlers(app: FastAPI) -> None:
    """One error shape for the whole API, so clients need one branch."""

    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"status": exc.status_code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": {"status": 422, "message": "Validation failed", "details": details}},
        )
