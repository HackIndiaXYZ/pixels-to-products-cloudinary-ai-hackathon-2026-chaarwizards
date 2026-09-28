"""Deterministic visual-signal extraction for ``/classify-activity`` and
``/extract-signals`` (api-contracts.md §3).

These are computer-vision signals — colour statistics over the pixels plus the
object detector's output — tied to the resolved ``model_registry.version``. No
LLM produces or adjusts any number here (AGENTS.md §3.2), and every result is a
pure function of the input, so it is deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from src.models.base import ObjectDetection, SaplingDetection

# HSV ranges, fixed and documented.
_GREEN = ((35, 60, 40), (85, 255, 255))
_BLUE_WATER = ((90, 60, 40), (130, 255, 255))
_BROWN_GROUND = ((5, 40, 30), (30, 255, 200))
_SMOKE_SAT_MAX = 40  # low saturation + mid brightness reads as smoke/haze
_SMOKE_VAL_MIN = 120
_SMOKE_FRACTION = 0.15
_WATER_FRACTION = 0.08


def _fraction_in_range(
    hsv: NDArray[np.uint8],
    low: tuple[int, int, int],
    high: tuple[int, int, int],
) -> float:
    mask = cv2.inRange(hsv, np.array(low, dtype=np.uint8), np.array(high, dtype=np.uint8))
    return float(np.count_nonzero(mask)) / float(mask.size)


@dataclass(frozen=True)
class VisualSignals:
    vegetation_index: float
    water_present: bool
    smoke: bool
    machinery: tuple[str, ...]
    bare_ground_pct: float
    canopy_cover_pct: float
    model_version: str


def extract_signals(
    image: NDArray[np.uint8],
    objects: tuple[ObjectDetection, ...],
    *,
    model_version: str,
) -> VisualSignals:
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
    green = _fraction_in_range(hsv, *_GREEN)
    water = _fraction_in_range(hsv, *_BLUE_WATER)
    ground = _fraction_in_range(hsv, *_BROWN_GROUND)

    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    smoke_mask = (sat <= _SMOKE_SAT_MAX) & (val >= _SMOKE_VAL_MIN)
    smoke_fraction = float(np.count_nonzero(smoke_mask)) / float(smoke_mask.size)

    machinery = tuple(o.label for o in objects if o.label != "person")

    return VisualSignals(
        vegetation_index=round(green, 4),
        water_present=water >= _WATER_FRACTION,
        smoke=smoke_fraction >= _SMOKE_FRACTION,
        machinery=machinery,
        bare_ground_pct=round(ground, 4),
        canopy_cover_pct=round(green, 4),
        model_version=model_version,
    )


@dataclass(frozen=True)
class ActivityClassification:
    activity_type: str
    phase: str
    confidence: float
    indicators: dict[str, int]
    model_version: str


def classify_activity(
    image: NDArray[np.uint8],
    saplings: SaplingDetection,
    objects: tuple[ObjectDetection, ...],
    *,
    model_version: str,
) -> ActivityClassification:
    people = sum(1 for o in objects if o.label == "person")
    tools = sum(1 for o in objects if o.label != "person")
    saplings_visible = saplings.count

    if people > 0 and saplings_visible == 0:
        activity, phase = "site_preparation", "before"
    elif saplings_visible > 0 and people > 0:
        activity, phase = "planting", "during"
    elif saplings_visible > 0:
        activity, phase = "planting", "after"
    else:
        activity, phase = "unknown", "before"

    # Confidence from detector strength — deterministic, model-derived.
    confidence = round(min(1.0, 0.4 + 0.1 * min(6, saplings_visible + people)), 4)

    return ActivityClassification(
        activity_type=activity,
        phase=phase,
        confidence=confidence,
        indicators={
            "saplings_visible": saplings_visible,
            "people_visible": people,
            "tools_visible": tools,
        },
        model_version=model_version,
    )
