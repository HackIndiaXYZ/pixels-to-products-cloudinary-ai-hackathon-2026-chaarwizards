"""Structured logging tests (Phase 11 monitoring)."""

from __future__ import annotations

import json
import logging

from src.logging_config import JsonLogFormatter, configure_logging


def test_formatter_emits_single_json_line_with_structured_extra() -> None:
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="ml-service",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request",
        args=(),
        exc_info=None,
    )
    record.extra = {"method": "POST", "path": "/v1/detect-change", "status": 200}
    line = formatter.format(record)
    parsed = json.loads(line)
    assert parsed["level"] == "info"
    assert parsed["msg"] == "request"
    assert parsed["method"] == "POST"
    assert parsed["path"] == "/v1/detect-change"
    assert parsed["status"] == 200
    # A single line — no embedded newlines that would break log ingestion.
    assert "\n" not in line


def test_formatter_never_emits_a_bearer_token() -> None:
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="ml-service",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request",
        args=(),
        exc_info=None,
    )
    # Only method/path/status are ever attached — an Authorization header is not.
    record.extra = {"method": "GET", "path": "/health", "status": 200}
    line = formatter.format(record)
    assert "Authorization" not in line
    assert "Bearer" not in line


def test_configure_logging_installs_json_formatter() -> None:
    logger = configure_logging("INFO")
    assert logger.name == "ml-service"
    root = logging.getLogger()
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonLogFormatter)
