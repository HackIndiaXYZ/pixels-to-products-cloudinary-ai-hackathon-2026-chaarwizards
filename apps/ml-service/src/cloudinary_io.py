"""Cloudinary + asset I/O for the ML service.

Two narrow ports keep the pipeline testable and keep the SSRF / signing rules
enforceable:

* :class:`AssetDownloader` fetches original bytes — always through the SSRF
  guard, only from a signed Cloudinary URL.
* :class:`DiffUploader` uploads the rendered diff PNG. The production
  implementation uses the Cloudinary Python SDK's ``uploader.upload`` with a
  signed request; signing is **never** hand-rolled , and the
  diff is a derivative (``type: upload``), never an authenticated original.

Neither port ever calls the Cloudinary Search / Admin resource API — Cloudinary
is a media pipeline, not a query database (§3.9).
"""

from __future__ import annotations

from typing import Protocol

import cv2
import httpx
import numpy as np
from numpy.typing import NDArray

from src.config import Settings
from src.ssrf import Resolver, _default_resolver, validate_asset_url


class AssetDownloader(Protocol):
    def fetch(self, url: str) -> bytes: ...


class DiffUploader(Protocol):
    def upload(self, png_bytes: bytes, public_id: str) -> str:
        """Upload the diff PNG and return its ``diff_asset_id`` (public_id)."""
        ...


def decode_image(data: bytes) -> NDArray[np.uint8]:
    """Decode image bytes to an HxWx3 RGB uint8 array."""
    array = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("could not decode image bytes")
    rgb: NDArray[np.uint8] = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return rgb


class HttpAssetDownloader:
    """Fetches bytes over HTTPS, gated by the SSRF policy."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.Client | None = None,
        resolver: Resolver = _default_resolver,
    ) -> None:
        self._settings = settings
        self._client = client or httpx.Client(timeout=30.0)
        self._resolver = resolver

    def fetch(self, url: str) -> bytes:
        validate_asset_url(
            url,
            cloudinary_host=self._settings.cloudinary_host,
            resolver=self._resolver,
        )
        response = self._client.get(url)
        response.raise_for_status()
        return response.content


class CloudinaryDiffUploader:
    """Uploads the diff PNG via the Cloudinary SDK (SDK-signed, never hand-rolled)."""

    def __init__(self, settings: Settings) -> None:
        import cloudinary  # lazy import keeps the module importable without config

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        self._settings = settings

    def upload(self, png_bytes: bytes, public_id: str) -> str:
        import io

        import cloudinary.uploader

        # Derivative, not an original: type 'upload' + signed. Overwrite/invalidate
        # off so an existing diff is never mutated (evidence immutability, §3.1).
        result = cloudinary.uploader.upload(
            io.BytesIO(png_bytes),
            public_id=public_id,
            resource_type="image",
            type="upload",
            overwrite=False,
            invalidate=False,
            format="png",
        )
        return str(result["public_id"])


def diff_public_id(org_id: str, project_id: str, change_event_id: str) -> str:
    """The diff derivative's public_id (CLOUDINARY_TRANSFORMATIONS.md §3)."""
    return f"{org_id}/{project_id}/diff/{change_event_id}"
