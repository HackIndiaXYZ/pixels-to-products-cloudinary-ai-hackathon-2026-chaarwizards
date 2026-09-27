"""Service metadata helpers for the ML service skeleton."""

from src import ML_SERVICE_VERSION


def service_banner() -> str:
    """Return a human-readable banner for the ML service."""
    return f"impact-ml-service {ML_SERVICE_VERSION}"
