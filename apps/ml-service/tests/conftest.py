"""Shared pytest fixtures: env, synthetic imagery, tokens and a wired app."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from jose import jwt
from numpy.typing import NDArray
from src.app import Services, create_app
from src.cloudinary_io import AssetDownloader, DiffUploader
from src.config import get_settings
from src.models.synthetic import SyntheticForestryModel
from src.registry import ModelFactory, ModelRegistry, ModelRow, RegistryRowSource
from src.video import KeyframeExtractor

TEST_SECRET = "test-internal-secret"


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "testcloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def mint_token(
    *,
    sub: str = "user-1",
    org_id: str = "org-1",
    job_id: str = "job-1",
    ttl_seconds: int = 120,
    secret: str = TEST_SECRET,
) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": sub, "org_id": org_id, "job_id": job_id, "iat": now, "exp": now + ttl_seconds},
        secret,
        algorithm="HS256",
    )


def auth_header(**kwargs: object) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_token(**kwargs)}"}  # type: ignore[arg-type]


# ---- Registry test doubles -------------------------------------------------

_SEED = {
    "forestry": ModelRow("forestry", "v1-placeholder", "forestry", "trained", None),
    "water": ModelRow("water", "v0", "water", "unsupported", None),
    "infrastructure": ModelRow("infrastructure", "v0", "infrastructure", "unsupported", None),
    "agriculture": ModelRow("agriculture", "v0", "agriculture", "unsupported", None),
}


class FakeRowSource:
    """Mirrors the ``model_registry`` seed migration."""

    def get(self, key: str) -> ModelRow | None:
        return _SEED.get(key)


class CountingFactory:
    """Builds a model, sleeping briefly so a race would be observable."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, row: ModelRow) -> SyntheticForestryModel:
        self.calls += 1
        time.sleep(0.05)  # widen the window for the load-once race
        return SyntheticForestryModel(row.version)


def make_registry(factory: ModelFactory | None = None) -> ModelRegistry:
    source: RegistryRowSource = FakeRowSource()
    return ModelRegistry(source, factory or (lambda row: SyntheticForestryModel(row.version)))


# ---- Image / IO test doubles ----------------------------------------------


def green_image(size: int = 200, blobs: int = 3) -> NDArray[np.uint8]:
    """A deterministic RGB image with ``blobs`` green squares (saplings).

    Blobs are spaced so every requested blob fits inside ``size`` (default 200):
    the last blob for ``blobs=6`` ends at x=180 < 200.
    """
    img = np.full((size, size, 3), 120, dtype=np.uint8)  # neutral gray ground
    for i in range(blobs):
        x = 10 + i * 30
        img[20:40, x : x + 20] = (40, 180, 40)
    return img


def png_bytes(img: NDArray[np.uint8]) -> bytes:
    import cv2

    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".png", bgr)
    assert ok
    return bytes(buf.tobytes())


class DictDownloader:
    """Serves pre-registered bytes by URL; asserts the URL was expected."""

    def __init__(self, mapping: dict[str, bytes]) -> None:
        self._mapping = mapping

    def fetch(self, url: str) -> bytes:
        if url not in self._mapping:
            raise AssertionError(f"unexpected fetch url: {url}")
        return self._mapping[url]


class RecordingUploader:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, int]] = []

    def upload(self, png: bytes, public_id: str) -> str:
        self.uploads.append((public_id, len(png)))
        return public_id


class ListExtractor:
    """Returns pre-built frames instead of shelling out to ffmpeg."""

    def __init__(self, frames: list[NDArray[np.uint8]]) -> None:
        self._frames = frames

    def extract(self, video_path: Path) -> list[NDArray[np.uint8]]:
        return self._frames


def make_services(
    *,
    downloader: AssetDownloader | None = None,
    uploader: DiffUploader | None = None,
    keyframes: KeyframeExtractor | None = None,
    factory: ModelFactory | None = None,
) -> Services:
    return Services(
        registry=make_registry(factory),
        downloader=downloader or DictDownloader({}),
        keyframes=keyframes or ListExtractor([]),
        uploader=uploader,
        cloud_name="testcloud",
    )


@pytest.fixture
def client_factory():  # type: ignore[no-untyped-def]
    def _make(services: Services) -> TestClient:
        return TestClient(create_app(services))

    return _make
