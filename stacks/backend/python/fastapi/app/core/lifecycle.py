"""Graceful shutdown.

This is the Python answer to what `@godaddy/terminus` does for the JavaScript
backends, and it exists for the same reason: readiness has to start failing
*before* the server stops accepting connections, not at the same moment.

Uvicorn already drains in-flight requests on SIGTERM — it stops accepting, waits
for open requests to finish, then runs the lifespan shutdown. What it does not do
is tell anyone *in advance*. A load balancer's endpoint list is eventually
consistent, so for a beat after the process decides to die it is still being sent
new requests; those arrive at a socket that is already closing. The window is small
and it is exactly where dropped requests come from.

So: the signal is intercepted, readiness flips to 503 immediately, and only after a
grace period is uvicorn's own handler allowed to run.

WHY THIS IS NOT A `time.sleep()`
The obvious implementation — set the flag, sleep, delegate — is wrong, and
plausibly so. A signal handler runs on the main thread, which is the thread running
the event loop; sleeping in it blocks the loop. Nothing is served during the grace
period, including the requests already in flight that the drain exists to protect,
and including the readiness probe that is the whole point of announcing the drain.
The pause has to yield to the loop, not stop it — hence `call_later`.

WHY IT IS NOT A LIFESPAN SHUTDOWN HOOK
`@asynccontextmanager` shutdown (and the old `@app.on_event("shutdown")`) runs
*after* uvicorn has already stopped accepting connections. By then the announcement
is pointless: there is no longer anything listening to be told.
"""

import asyncio
from typing import Any

import uvicorn

from app.core.config import settings

# How long readiness reports 503 before the server actually stops accepting. Only
# in production: locally it makes every Ctrl-C take five seconds for no benefit.
GRACE_SECONDS = 5.0 if settings.is_production else 0.0

_draining = False
_event_loop: asyncio.AbstractEventLoop | None = None


def is_draining() -> bool:
    """True once a shutdown signal has landed. Read by the readiness probe."""
    return _draining


def remember_event_loop() -> None:
    """Called from the lifespan startup, which is the one place a running loop exists.

    A signal handler cannot ask for the running loop itself — it is not called from
    a coroutine — so the loop has to be captured while one is definitely running.
    """
    global _event_loop
    _event_loop = asyncio.get_running_loop()


_uvicorn_handle_exit = uvicorn.Server.handle_exit


def _handle_exit(server: uvicorn.Server, sig: int, frame: Any) -> None:
    global _draining

    # A second Ctrl-C means "stop waiting, I meant it". Anyone who has held a
    # terminal hostage to a graceful shutdown expects the second one to be obeyed.
    if _draining:
        _uvicorn_handle_exit(server, sig, frame)
        return

    _draining = True

    if GRACE_SECONDS <= 0 or _event_loop is None:
        _uvicorn_handle_exit(server, sig, frame)
        return

    # Hand uvicorn its signal back later, without blocking the loop in between. The
    # server keeps serving throughout: in-flight requests finish, and readiness
    # answers 503 to everything that asks.
    _event_loop.call_later(GRACE_SECONDS, _uvicorn_handle_exit, server, sig, frame)


def install_graceful_shutdown() -> None:
    """Patch uvicorn's signal handling. Importing this module is not enough — the
    call is explicit so that it is greppable and so tests can leave it alone."""
    uvicorn.Server.handle_exit = _handle_exit  # type: ignore[method-assign]


__all__ = ["GRACE_SECONDS", "install_graceful_shutdown", "is_draining", "remember_event_loop"]
