"""Quantifier: turns raw detector output into the versioned metrics that land in
``change_events.change_metrics`` (api-contracts.md §3).

Every number here is a pure, deterministic function of model output plus capture
geometry — no randomness, no LLM (AGENTS.md §3.2). Identical inputs therefore
yield byte-identical metrics, which the gate asserts.

Ground area is derived from the **ground sampling distance** (GSD, metres per
pixel). A phone capture does not carry camera intrinsics, so GSD is estimated
from the capture geometry (nominal above-ground height + horizontal field of
view) in :func:`estimate_gsd_m_per_px`; a caller that knows the true GSD passes
it directly. Area is ``changed_pixels x GSD²``.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

from src.models.base import ChangeMask, SaplingDetection

# Documented nominal capture geometry for a hand-held field photo. Used only
# when a caller cannot supply a measured GSD. Kept explicit so a reviewer can
# see the assumption behind every derived area.
_NOMINAL_CAPTURE_HEIGHT_M = 1.6
_NOMINAL_HFOV_DEG = 66.0


def estimate_gsd_m_per_px(
    image_width_px: int,
    *,
    capture_height_m: float = _NOMINAL_CAPTURE_HEIGHT_M,
    hfov_deg: float = _NOMINAL_HFOV_DEG,
) -> float:
    """Estimate metres-per-pixel from nominal capture geometry.

    Ground width covered ``= 2 * height * tan(hfov/2)``; GSD is that divided by
    the pixel width. Deterministic for a given ``image_width_px``.
    """
    if image_width_px <= 0:
        raise ValueError("image_width_px must be positive")
    ground_width_m = 2.0 * capture_height_m * math.tan(math.radians(hfov_deg) / 2.0)
    return ground_width_m / image_width_px


@dataclass(frozen=True)
class ChangeQuantification:
    """Structured metrics; ``model_version`` binds them to their source (§3.2)."""

    change_type: str
    before_count: int
    after_count: int
    saplings_planted: int
    area_covered_sqm: float
    area_covered_hectares: float
    pct_area_changed: float
    planting_density_per_sqm: float
    alignment_quality: float
    confidence: float
    model_version: str

    def metrics_dict(self) -> dict[str, float | int]:
        """The ``change_metrics`` payload (numbers only — no version/type)."""
        data = asdict(self)
        data.pop("change_type")
        data.pop("model_version")
        return data


def _classify(before_count: int, after_count: int, changed_fraction: float) -> str:
    """Name the change from the counts. Descriptive only — not a metric."""
    if after_count > before_count:
        return "sapling_planting"
    if after_count < before_count:
        return "sapling_loss"
    if changed_fraction >= 0.05:
        return "canopy_growth"
    return "no_significant_change"


def quantify_change(
    before: SaplingDetection,
    after: SaplingDetection,
    mask: ChangeMask,
    *,
    gsd_m_per_px: float,
    alignment_quality: float,
    model_version: str,
) -> ChangeQuantification:
    """Compute versioned change metrics from detector output.

    Args:
        before/after: sapling detections for each phase.
        mask: the change mask aligned to the ``after`` image.
        gsd_m_per_px: ground sampling distance (metres per pixel).
        alignment_quality: 0..1 quality of the before/after alignment.
        model_version: the ``model_registry.version`` that produced the numbers.
    """
    if gsd_m_per_px <= 0:
        raise ValueError("gsd_m_per_px must be positive")

    before_count = before.count
    after_count = after.count
    saplings_planted = max(0, after_count - before_count)

    px_area_sqm = gsd_m_per_px * gsd_m_per_px
    area_covered_sqm = round(mask.changed_pixels * px_area_sqm, 4)
    area_covered_hectares = round(area_covered_sqm / 10_000.0, 6)
    pct_area_changed = round(mask.changed_fraction * 100.0, 4)

    if area_covered_sqm > 0:
        planting_density = round(saplings_planted / area_covered_sqm, 6)
    else:
        planting_density = 0.0

    change_type = _classify(before_count, after_count, mask.changed_fraction)

    # Confidence blends detector confidence with alignment quality — deterministic.
    detector_conf = after.mean_confidence if after.count else before.mean_confidence
    confidence = round(
        max(0.0, min(1.0, 0.5 * detector_conf + 0.5 * max(0.0, min(1.0, alignment_quality)))),
        4,
    )

    return ChangeQuantification(
        change_type=change_type,
        before_count=before_count,
        after_count=after_count,
        saplings_planted=saplings_planted,
        area_covered_sqm=area_covered_sqm,
        area_covered_hectares=area_covered_hectares,
        pct_area_changed=pct_area_changed,
        planting_density_per_sqm=planting_density,
        alignment_quality=round(max(0.0, min(1.0, alignment_quality)), 4),
        confidence=confidence,
        model_version=model_version,
    )
