"""Runtime configuration for the ML service.

Server-only. Secrets (`INTERNAL_JWT_SECRET`, `CLOUDINARY_API_SECRET`,
`SUPABASE_SERVICE_KEY`) are read from the environment and never logged or echoed
into a response. See ``apps/ml-service/.env.example`` for the contract.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    """Immutable, validated view of the service environment."""

    internal_jwt_secret: str
    cloudinary_cloud_name: str
    cloudinary_api_key: str
    cloudinary_api_secret: str
    supabase_url: str
    supabase_service_key: str
    weights_dir: str

    @property
    def cloudinary_host(self) -> str:
        """The only delivery host the SSRF guard will accept."""
        return "res.cloudinary.com"


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load and cache settings from the environment.

    Raises ``RuntimeError`` naming the first missing variable rather than
    starting the service in a half-configured state (§3.6: fail loudly).
    """
    return Settings(
        internal_jwt_secret=_require("INTERNAL_JWT_SECRET"),
        cloudinary_cloud_name=_require("CLOUDINARY_CLOUD_NAME"),
        cloudinary_api_key=_require("CLOUDINARY_API_KEY"),
        cloudinary_api_secret=_require("CLOUDINARY_API_SECRET"),
        supabase_url=_require("SUPABASE_URL"),
        supabase_service_key=_require("SUPABASE_SERVICE_KEY"),
        weights_dir=os.environ.get("WEIGHTS_DIR", "/weights"),
    )
