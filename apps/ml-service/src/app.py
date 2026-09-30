"""FastAPI application for the ML service.

Endpoints (api-contracts.md §3):
    GET  /health
    GET  /model-info
    POST /v1/detect-change
    POST /v1/detect-change-video
    POST /v1/classify-activity
    POST /v1/extract-signals

Every mutating endpoint requires a verified internal JWT (§3.4), resolves the
sector through ``model_registry`` and returns ``{"status":"unsupported"}`` for
any sector without a trained model (§3.3). Metrics come only from the versioned
CV model — no LLM is imported anywhere in this service (§3.2).
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.concurrency import run_in_threadpool

from src import ML_SERVICE_VERSION
from src.auth import InternalClaims, require_internal_auth
from src.cloudinary_io import (
    AssetDownloader,
    DiffUploader,
    decode_image,
    diff_public_id,
)
from src.diff import render_red_overlay
from src.logging_config import request_logging_middleware
from src.models.base import SectorModel
from src.quantify import estimate_gsd_m_per_px, quantify_change
from src.registry import ModelRegistry, UnsupportedModel
from src.schemas import (
    AssetRequest,
    ClassifyActivityResponse,
    DetectChangeRequest,
    DetectChangeResponse,
    DetectChangeVideoRequest,
    DetectChangeVideoResponse,
    ExtractSignalsResponse,
    HealthResponse,
    KeyframeMetricResponse,
    ModelInfoResponse,
    UnsupportedResponse,
)
from src.signals import classify_activity, extract_signals
from src.video import KeyframeExtractor, analyze_video


@dataclass
class Services:
    """Injectable collaborators. Overridden in tests with fakes."""

    registry: ModelRegistry
    downloader: AssetDownloader
    keyframes: KeyframeExtractor
    uploader: DiffUploader | None = None
    cloud_name: str = ""


def _require_model(services: Services, sector: str) -> SectorModel | UnsupportedModel:
    return services.registry.get_model(sector)


def create_app(services: Services) -> FastAPI:
    app = FastAPI(title="impact-ml-service", version=ML_SERVICE_VERSION)

    # Structured JSON request logging (Phase 11 monitoring). Never logs the
    # internal JWT or any GPS coordinate (§3.5).
    app.middleware("http")(request_logging_middleware)

    def get_services() -> Services:
        return services

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(version=ML_SERVICE_VERSION)

    @app.get("/model-info")
    async def model_info(
        key: str = Query(..., description="model_registry key, e.g. 'forestry'"),
        _claims: InternalClaims = Depends(require_internal_auth),
        svc: Services = Depends(get_services),
    ) -> ModelInfoResponse | UnsupportedResponse:
        row = svc.registry.resolve(key)
        if row is None or row.status != "trained":
            return UnsupportedResponse()
        return ModelInfoResponse(
            key=row.key, version=row.version, sector=row.sector, status=row.status
        )

    @app.post("/v1/detect-change")
    async def detect_change(
        req: DetectChangeRequest,
        response: Response,
        _claims: InternalClaims = Depends(require_internal_auth),
        svc: Services = Depends(get_services),
    ) -> DetectChangeResponse | UnsupportedResponse:
        model = _require_model(svc, req.sector)
        if isinstance(model, UnsupportedModel):
            return UnsupportedResponse()

        def compute() -> DetectChangeResponse:
            before_img = decode_image(svc.downloader.fetch(req.before_url))
            after_img = decode_image(svc.downloader.fetch(req.after_url))
            before_det = model.saplings.detect(before_img)
            after_det = model.saplings.detect(after_img)
            mask = model.changes.change_mask(before_img, after_img)
            gsd = estimate_gsd_m_per_px(after_img.shape[1])
            metrics = quantify_change(
                before_det,
                after_det,
                mask,
                gsd_m_per_px=gsd,
                alignment_quality=1.0,
                model_version=model.version,
            )
            diff_url: str | None = None
            if svc.uploader is not None:
                png = render_red_overlay(after_img, mask)
                public_id = diff_public_id(_claims.org_id, req.project_id, _claims.job_id)
                diff_asset_id = svc.uploader.upload(png, public_id)
                # The diff is an ``upload`` derivative; the Node API re-signs it
                # for delivery. Return the canonical delivery URL for its id.
                diff_url = (
                    f"https://res.cloudinary.com/{svc.cloud_name}/image/upload/{diff_asset_id}.png"
                    if svc.cloud_name
                    else diff_asset_id
                )
            return DetectChangeResponse(
                change_type=metrics.change_type,
                change_metrics=metrics.metrics_dict(),
                model_version=metrics.model_version,
                confidence=metrics.confidence,
                diff_url=diff_url,
            )

        try:
            return await run_in_threadpool(compute)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    @app.post("/v1/detect-change-video")
    async def detect_change_video(
        req: DetectChangeVideoRequest,
        _claims: InternalClaims = Depends(require_internal_auth),
        svc: Services = Depends(get_services),
    ) -> DetectChangeVideoResponse | UnsupportedResponse:
        model = _require_model(svc, req.sector)
        if isinstance(model, UnsupportedModel):
            return UnsupportedResponse()

        def compute() -> DetectChangeVideoResponse:
            video_bytes = svc.downloader.fetch(req.video_url)
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
                tmp.write(video_bytes)
                tmp.flush()
                frames = svc.keyframes.extract(Path(tmp.name))
            if len(frames) < 2:
                raise ValueError("video produced fewer than two keyframes")
            gsd = estimate_gsd_m_per_px(frames[0].shape[1])
            result = analyze_video(frames, model, gsd_m_per_px=gsd)
            return DetectChangeVideoResponse(
                change_type=result.aggregate.change_type,
                change_metrics=result.aggregate.metrics_dict(),
                keyframes=[
                    KeyframeMetricResponse(
                        index=kf.index,
                        alignment_quality=kf.alignment_quality,
                        change_metrics=kf.metrics.metrics_dict(),
                    )
                    for kf in result.keyframes
                ],
                model_version=result.model_version,
                confidence=result.aggregate.confidence,
            )

        try:
            return await run_in_threadpool(compute)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    @app.post("/v1/classify-activity")
    async def classify_activity_endpoint(
        req: AssetRequest,
        _claims: InternalClaims = Depends(require_internal_auth),
        svc: Services = Depends(get_services),
    ) -> ClassifyActivityResponse | UnsupportedResponse:
        model = _require_model(svc, req.sector)
        if isinstance(model, UnsupportedModel):
            return UnsupportedResponse()

        def compute() -> ClassifyActivityResponse:
            img = decode_image(svc.downloader.fetch(req.asset_url))
            saplings = model.saplings.detect(img)
            objects = model.objects.detect(img)
            result = classify_activity(img, saplings, objects, model_version=model.version)
            return ClassifyActivityResponse(
                activity_type=result.activity_type,
                phase=result.phase,
                confidence=result.confidence,
                indicators=result.indicators,
                model_version=result.model_version,
            )

        return await run_in_threadpool(compute)

    @app.post("/v1/extract-signals")
    async def extract_signals_endpoint(
        req: AssetRequest,
        _claims: InternalClaims = Depends(require_internal_auth),
        svc: Services = Depends(get_services),
    ) -> ExtractSignalsResponse | UnsupportedResponse:
        model = _require_model(svc, req.sector)
        if isinstance(model, UnsupportedModel):
            return UnsupportedResponse()

        def compute() -> ExtractSignalsResponse:
            img = decode_image(svc.downloader.fetch(req.asset_url))
            objects = model.objects.detect(img)
            result = extract_signals(img, objects, model_version=model.version)
            return ExtractSignalsResponse(
                vegetation_index=result.vegetation_index,
                water_present=result.water_present,
                smoke=result.smoke,
                machinery=list(result.machinery),
                bare_ground_pct=result.bare_ground_pct,
                canopy_cover_pct=result.canopy_cover_pct,
                model_version=result.model_version,
            )

        return await run_in_threadpool(compute)

    return app
