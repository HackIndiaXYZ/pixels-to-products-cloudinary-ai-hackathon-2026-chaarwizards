"""Learned forestry pipeline: YOLOv8n sapling detector + ChangeFormer change
mask + a COCO YOLOv8n base detector for person / machinery.

The detectors are shipped as ONNX (``sapling_yolov8n.onnx``,
``changeformer.onnx``); the COCO base is the stock ``yolov8n.pt``. ``ultralytics``
loads a ``.onnx`` detector directly (running it through ``onnxruntime``), and the
ChangeFormer runs via :class:`OnnxChangeFormer`. ``ultralytics`` is heavy and is
imported lazily inside the constructor so the service, its tests, and ``mypy``
run without it installed; the deterministic baseline in ``synthetic`` covers the
``weights_uri IS NULL`` placeholder state.

Weights are loaded **once** in ``__init__`` and cached on the model object; the
detectors never re-load per request (AGENTS.md §4).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from src.models.base import (
    BoundingBox,
    ChangeDetector,
    ObjectDetection,
    ObjectDetector,
    SaplingDetection,
    SaplingDetector,
)
from src.models.onnx_change import OnnxChangeFormer

# COCO class names we treat as machinery indicators for the forestry sector.
_MACHINERY_LABELS = frozenset({"truck", "car", "bus", "train", "boat"})
_PERSON_LABEL = "person"
_SAPLING_CONF = 0.25


class _YoloSaplings:
    def __init__(self, weights_path: Path) -> None:
        from ultralytics import YOLO  # lazy: heavy dependency

        self._model = YOLO(str(weights_path))

    def detect(self, image: NDArray[np.uint8]) -> SaplingDetection:
        results = self._model.predict(image, conf=_SAPLING_CONF, verbose=False)
        boxes: list[BoundingBox] = []
        for result in results:
            for box in result.boxes:
                xyxy = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                boxes.append(BoundingBox(xyxy[0], xyxy[1], xyxy[2], xyxy[3], round(conf, 4)))
        boxes.sort(key=lambda b: (b.y1, b.x1))
        mean_conf = round(sum(b.confidence for b in boxes) / len(boxes), 4) if boxes else 0.0
        return SaplingDetection(count=len(boxes), boxes=tuple(boxes), mean_confidence=mean_conf)


class _CocoObjects:
    def __init__(self, weights_path: Path) -> None:
        from ultralytics import YOLO  # lazy: heavy dependency

        self._model = YOLO(str(weights_path))

    def detect(self, image: NDArray[np.uint8]) -> tuple[ObjectDetection, ...]:
        results = self._model.predict(image, verbose=False)
        out: list[ObjectDetection] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                label = names[int(box.cls[0])]
                if label == _PERSON_LABEL or label in _MACHINERY_LABELS:
                    conf = round(float(box.conf[0]), 4)
                    out.append(ObjectDetection(label=label, confidence=conf))
        return tuple(out)


class YoloForestryModel:
    """Learned forestry model. Instantiated once per ``(key, version)``."""

    def __init__(self, version: str, weights_dir: Path) -> None:
        self.version = version
        # Each detector loads its weights once, here — never per request (§4).
        self.saplings: SaplingDetector = _YoloSaplings(weights_dir / "sapling_yolov8n.onnx")
        self.changes: ChangeDetector = OnnxChangeFormer(weights_dir / "changeformer.onnx")
        self.objects: ObjectDetector = _CocoObjects(weights_dir / "yolov8n.pt")
