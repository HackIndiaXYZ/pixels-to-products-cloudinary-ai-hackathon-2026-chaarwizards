"""Production entrypoint: wires the real collaborators and exposes ``app``.

Deployed as ``uvicorn src.main:app`` (docs/operations/deployment.md). Importing
this module constructs the settings from the environment and fails loudly if a
required secret is missing (§3.6). Tests never import this module; they build
``Services`` with fakes and call ``create_app`` directly.
"""

from __future__ import annotations

from pathlib import Path

from src.app import Services, create_app
from src.cloudinary_io import CloudinaryDiffUploader, HttpAssetDownloader
from src.config import get_settings
from src.logging_config import configure_logging
from src.registry import ModelRegistry, default_factory
from src.supabase_registry import SupabaseRowSource
from src.video import FfmpegKeyframeExtractor


def build_services() -> Services:
    settings = get_settings()
    configure_logging()
    registry = ModelRegistry(
        SupabaseRowSource(settings),
        default_factory(Path(settings.weights_dir)),
    )
    return Services(
        registry=registry,
        downloader=HttpAssetDownloader(settings),
        keyframes=FfmpegKeyframeExtractor(),
        uploader=CloudinaryDiffUploader(settings),
        cloud_name=settings.cloudinary_cloud_name,
    )


app = create_app(build_services())
