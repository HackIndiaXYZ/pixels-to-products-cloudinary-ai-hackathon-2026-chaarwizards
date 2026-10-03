"""Structured JSON logging for the ML service (Phase —
"Monitoring: Pino + structlog").

This mirrors the API's Pino setup: one JSON object per line, safe to ship to a
log aggregator. It is deliberately stdlib-only (no runtime dependency, fully
typed for ``mypy --strict``); a production swap to ``structlog`` + OpenTelemetry
is the documented upgrade path and needs a collector endpoint that only exists
in staging.

Two invariants match system invariants:
  * the internal JWT (``Authorization`` header) is never logged — the request
    middleware logs only method, path, status, and duration;
  * GPS coordinates are PII and are never part of a log record here (the ML
    service receives signed URLs and model outputs, not raw device coordinates).
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import Response


class JsonLogFormatter(logging.Formatter):
    """Render a log record as a single JSON line (Pino-compatible shape)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname.lower(),
            "time": int(record.created * 1000),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Structured extras attached via `logger.info(msg, extra={"extra": {...}})`.
        extra = getattr(record, "extra", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info is not None:
            payload["err"] = self.formatException(record.exc_info)
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def configure_logging(level: str = "INFO") -> logging.Logger:
    """Install the JSON formatter on the root handler and return the app logger."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    return logging.getLogger("ml-service")


async def request_logging_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Log one structured line per request: method, path, status, duration.

    The Authorization header (the internal JWT) is intentionally NOT read into
    the record, so no bearer token can leak into the log stream (§3.5).
    """
    logger = logging.getLogger("ml-service")
    started = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - started) * 1000, 2)
    logger.info(
        "request",
        extra={
            "extra": {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            }
        },
    )
    return response
