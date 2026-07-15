from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.lifecycle import install_graceful_shutdown, remember_event_loop

# Patches uvicorn's signal handling so that a SIGTERM starts by making readiness
# answer 503, and only then stops the server. See app/core/lifecycle.py — the
# ordering is the entire point.
install_graceful_shutdown()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The only place a running event loop is guaranteed to exist. The signal handler
    # needs it later and cannot ask for it itself.
    remember_event_loop()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    # Interactive docs are a footgun in production; keep them to non-prod.
    docs_url=None if settings.is_production else "/docs",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(api_router)
