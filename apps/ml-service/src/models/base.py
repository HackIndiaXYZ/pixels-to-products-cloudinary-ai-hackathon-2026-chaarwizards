"""Detector interfaces and result types shared across the CV pipeline.

Weights are loaded **once** per model and cached on the model object; a detector
is never instantiated inside a request handler . The
concrete implementations live in ``synthetic`` (the deterministic baseline used
while ``model_registry.weights_uri`` is NULL) and ``forestry`` (the YOLOv8n +
ChangeFormer path used once fine-tuned weights exist).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True)
class BoundingBox:
    """An axis-aligned detection box in pixel coordinates."""

    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


@dataclass(frozen=True)
class SaplingDetection:
    """Result of the single-class sapling detector on one image."""

    count: int
    boxes: tuple[BoundingBox, ...] = field(default_factory=tuple)
    mean_confidence: float = 0.0


@dataclass(frozen=True)
class ObjectDetection:
    """A COCO-class detection (person / machinery indicators)."""

    label: str
    confidence: float


@dataclass(frozen=True)
class ChangeMask:
    """A binary change mask aligned to the ``after`` image."""

    mask: NDArray[np.bool_]

    @property
    def changed_pixels(self) -> int:
        return int(np.count_nonzero(self.mask))

    @property
    def total_pixels(self) -> int:
        return int(self.mask.size)

    @property
    def changed_fraction(self) -> float:
        if self.total_pixels == 0:
            return 0.0
        return self.changed_pixels / self.total_pixels


@runtime_checkable
class SaplingDetector(Protocol):
    """Single-class sapling detector (YOLOv8n once trained)."""

    def detect(self, image: NDArray[np.uint8]) -> SaplingDetection: ...


@runtime_checkable
class ChangeDetector(Protocol):
    """Before/after change-mask producer (ChangeFormer once trained)."""

    def change_mask(
        self, before: NDArray[np.uint8], after: NDArray[np.uint8]
    ) -> ChangeMask: ...


@runtime_checkable
class ObjectDetector(Protocol):
    """COCO base detector for person / machinery indicators."""

    def detect(self, image: NDArray[np.uint8]) -> tuple[ObjectDetection, ...]: ...


@runtime_checkable
class SectorModel(Protocol):
    """A fully-loaded sector model: version + the three detectors it bundles.

    ``version`` is the ``model_registry.version`` string that produced every
    metric; it is what a ``change_events`` row records for provenance (§3.2).
    """

    version: str
    saplings: SaplingDetector
    changes: ChangeDetector
    objects: ObjectDetector
