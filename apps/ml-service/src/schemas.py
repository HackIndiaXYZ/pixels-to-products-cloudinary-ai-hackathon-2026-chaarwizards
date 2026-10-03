"""Pydantic request/response models for the ML service (api-contracts.md §3).

Every inbound payload is validated here at the trust boundary .
Responses either carry the computed result or the ``{"status": "unsupported"}``
envelope returned when a sector has no trained model (§3.3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GpsPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: float
    lon: float


class DetectChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    before_url: str
    after_url: str
    sector: str
    project_id: str
    gps_before: GpsPoint | None = None
    gps_after: GpsPoint | None = None
    accuracy_before: float | None = None
    accuracy_after: float | None = None


class DetectChangeVideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    video_url: str
    sector: str
    project_id: str
    gps: GpsPoint | None = None


class AssetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_url: str
    sector: str


class UnsupportedResponse(BaseModel):
    status: Literal["unsupported"] = "unsupported"


class DetectChangeResponse(BaseModel):
    change_type: str
    change_metrics: dict[str, float | int]
    model_version: str
    confidence: float
    diff_url: str | None = None


class KeyframeMetricResponse(BaseModel):
    index: int
    alignment_quality: float
    change_metrics: dict[str, float | int]


class DetectChangeVideoResponse(BaseModel):
    change_type: str
    change_metrics: dict[str, float | int]
    keyframes: list[KeyframeMetricResponse]
    model_version: str
    confidence: float


class ClassifyActivityResponse(BaseModel):
    activity_type: str
    phase: str
    confidence: float
    indicators: dict[str, int]
    model_version: str


class ExtractSignalsResponse(BaseModel):
    vegetation_index: float
    water_present: bool
    smoke: bool
    machinery: list[str]
    bare_ground_pct: float
    canopy_cover_pct: float
    model_version: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str


class ModelInfoResponse(BaseModel):
    key: str
    version: str
    sector: str
    status: str = Field(description="model_registry.status")
