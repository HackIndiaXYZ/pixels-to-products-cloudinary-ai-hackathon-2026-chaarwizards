"""Production ``RegistryRowSource``: reads ``model_registry`` from Supabase.

``model_registry`` is reference data with a read-only ``USING (true)`` SELECT
policy (DATABASE_SCHEMA.md). The service reads it through PostgREST using the
service-role key (server-only). This is a *read of Postgres* — the system of
record — never a Cloudinary query (§3.9).
"""

from __future__ import annotations

import httpx

from src.config import Settings
from src.registry import ModelRow

_SELECT = "key,version,sector,status,weights_uri"


class SupabaseRowSource:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        self._base = settings.supabase_url.rstrip("/")
        self._key = settings.supabase_service_key
        self._client = client or httpx.Client(timeout=10.0)

    def get(self, key: str) -> ModelRow | None:
        response = self._client.get(
            f"{self._base}/rest/v1/model_registry",
            params={"key": f"eq.{key}", "select": _SELECT, "limit": "1"},
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        rows = response.json()
        if not rows:
            return None
        row = rows[0]
        return ModelRow(
            key=str(row["key"]),
            version=str(row["version"]),
            sector=str(row["sector"]),
            status=str(row["status"]),
            weights_uri=row.get("weights_uri"),
        )
