"""SupabaseRowSource parses model_registry rows and maps a miss to None."""

from __future__ import annotations

import httpx
from src.config import Settings
from src.supabase_registry import SupabaseRowSource

_SETTINGS = Settings(
    internal_jwt_secret="s",
    cloudinary_cloud_name="c",
    cloudinary_api_key="k",
    cloudinary_api_secret="x",
    supabase_url="https://example.supabase.co",
    supabase_service_key="service-key",
    weights_dir="/weights",
)


def _client(rows: list[dict[str, object]]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["apikey"] == "service-key"
        assert "model_registry" in str(request.url)
        return httpx.Response(200, json=rows)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_parses_forestry_row() -> None:
    source = SupabaseRowSource(
        _SETTINGS,
        client=_client(
            [
                {
                    "key": "forestry",
                    "version": "v1-placeholder",
                    "sector": "forestry",
                    "status": "trained",
                    "weights_uri": None,
                }
            ]
        ),
    )
    row = source.get("forestry")
    assert row is not None
    assert row.status == "trained"
    assert row.version == "v1-placeholder"
    assert row.weights_uri is None


def test_missing_key_returns_none() -> None:
    source = SupabaseRowSource(_SETTINGS, client=_client([]))
    assert source.get("nope") is None
