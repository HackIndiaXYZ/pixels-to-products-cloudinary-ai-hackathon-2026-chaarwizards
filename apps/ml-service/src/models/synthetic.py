"""Deterministic classical-CV baseline used while the forestry weights are NULL.

``model_registry`` seeds forestry as ``status='trained'`` with ``weights_uri``
NULL — a trained *placeholder* (see the Phase 1 seed migration). Per system specifications
§3.3 a ``trained`` sector must still return forestry output rather than
``unsupported``, so this module provides an honest, fully deterministic
computer-vision baseline (HSV green-blob sapling counting + grayscale-diff
change mask) that runs with no downloaded weights. It is a real algorithm, not
an LLM and not a guess (§3.2). The learned YOLOv8n + ChangeFormer path in
``forestry`` replaces it once fine-tuned weights land, keyed by a new
``model_registry.version``.

Determinism: every operation here is a pure function of the input pixels, so
identical inputs yield byte-identical metrics — the property the gate asserts.
"""

from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

from src.models.base import (
    BoundingBox,
    ChangeDetector,
    ChangeMask,
    ObjectDetection,
    ObjectDetector,
    SaplingDetection,
    SaplingDetector,
)

# Deterministic thresholds. Tuned for the synthetic fixtures; documented so a
# reviewer can see there is no hidden randomness.
_GREEN_LOWER = np.array([35, 60, 40], dtype=np.uint8)
_GREEN_UPPER = np.array([85, 255, 255], dtype=np.uint8)
_MIN_SAPLING_AREA_PX = 12
_CHANGE_DELTA = 40  # grayscale difference that counts as "changed"


class _SyntheticSaplings:
    def detect(self, image: NDArray[np.uint8]) -> SaplingDetection:
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        mask = cv2.inRange(hsv, _GREEN_LOWER, _GREEN_UPPER)
        num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(
            mask, connectivity=8
        )
        boxes: list[BoundingBox] = []
        for label in range(1, num_labels):  # 0 is the background component
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area < _MIN_SAPLING_AREA_PX:
                continue
            x = float(stats[label, cv2.CC_STAT_LEFT])
            y = float(stats[label, cv2.CC_STAT_TOP])
            w = float(stats[label, cv2.CC_STAT_WIDTH])
            h = float(stats[label, cv2.CC_STAT_HEIGHT])
            # Confidence proxy: area saturation, clamped, rounded for determinism.
            conf = round(min(1.0, area / 400.0), 4)
            boxes.append(BoundingBox(x, y, x + w, y + h, conf))
        boxes.sort(key=lambda b: (b.y1, b.x1))
        mean_conf = round(sum(b.confidence for b in boxes) / len(boxes), 4) if boxes else 0.0
        return SaplingDetection(count=len(boxes), boxes=tuple(boxes), mean_confidence=mean_conf)


class _SyntheticChange:
    def change_mask(
        self, before: NDArray[np.uint8], after: NDArray[np.uint8]
    ) -> ChangeMask:
        before_gray = cv2.cvtColor(before, cv2.COLOR_RGB2GRAY)
        after_gray = cv2.cvtColor(after, cv2.COLOR_RGB2GRAY)
        if before_gray.shape != after_gray.shape:
            after_gray = cv2.resize(
                after_gray,
                (before_gray.shape[1], before_gray.shape[0]),
                interpolation=cv2.INTER_AREA,
            )
        delta = cv2.absdiff(before_gray, after_gray)
        mask = delta >= _CHANGE_DELTA
        return ChangeMask(mask=mask)


class _NoObjects:
    """The placeholder ships no COCO detector; indicators come from the learned
    path only. Returns an empty tuple deterministically."""

    def detect(self, image: NDArray[np.uint8]) -> tuple[ObjectDetection, ...]:
        _ = image
        return ()


class SyntheticForestryModel:
    """Deterministic forestry baseline (no downloaded weights)."""

    def __init__(self, version: str) -> None:
        # Loaded once, cached on the object — never per request (§4).
        self.version = version
        self.saplings: SaplingDetector = _SyntheticSaplings()
        self.changes: ChangeDetector = _SyntheticChange()
        self.objects: ObjectDetector = _NoObjects()
