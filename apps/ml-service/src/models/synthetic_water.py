"""Deterministic classical-CV baseline for water while weights are NULL.

This mirrors the forestry synthetic baseline but with water-appropriate
thresholds (NDWI-based water detection + grayscale-diff change mask).
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

# NDWI thresholds for water detection (Green - NIR) / (Green + NIR)
# Using RGB approximation: Green channel as proxy, Blue as NIR-ish
_WATER_LOWER_HSV = np.array([85, 50, 30], dtype=np.uint8)   # blue-ish hues
_WATER_UPPER_HSV = np.array([130, 255, 255], dtype=np.uint8)
_MIN_WATER_AREA_PX = 50
_CHANGE_DELTA_WATER = 35


class _SyntheticWater:
    def detect(self, image: NDArray[np.uint8]) -> SaplingDetection:
        # Approximate NDWI using HSV: water tends to be blue/cyan
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        mask = cv2.inRange(hsv, _WATER_LOWER_HSV, _WATER_UPPER_HSV)
        num_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(
            mask, connectivity=8
        )
        boxes: list[BoundingBox] = []
        for label in range(1, num_labels):
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area < _MIN_WATER_AREA_PX:
                continue
            x = float(stats[label, cv2.CC_STAT_LEFT])
            y = float(stats[label, cv2.CC_STAT_TOP])
            w = float(stats[label, cv2.CC_STAT_WIDTH])
            h = float(stats[label, cv2.CC_STAT_HEIGHT])
            conf = round(min(1.0, area / 800.0), 4)
            boxes.append(BoundingBox(x, y, x + w, y + h, conf))
        boxes.sort(key=lambda b: (b.y1, b.x1))
        mean_conf = round(sum(b.confidence for b in boxes) / len(boxes), 4) if boxes else 0.0
        return SaplingDetection(count=len(boxes), boxes=tuple(boxes), mean_confidence=mean_conf)


class _SyntheticWaterChange:
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
        mask = delta >= _CHANGE_DELTA_WATER
        return ChangeMask(mask=mask)


class _NoWaterContext:
    def detect(self, image: NDArray[np.uint8]) -> tuple[ObjectDetection, ...]:
        _ = image
        return ()


class SyntheticWaterModel:
    """Deterministic water baseline (no downloaded weights)."""

    def __init__(self, version: str) -> None:
        self.version = version
        self.saplings: SaplingDetector = _SyntheticWater()
        self.changes: ChangeDetector = _SyntheticWaterChange()
        self.objects: ObjectDetector = _NoWaterContext()