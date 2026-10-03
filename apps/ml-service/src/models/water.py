"""Learned water pipeline: YOLOv8n water body detector + ChangeFormer change
mask + a COCO YOLOv8n base detector for context (boats, infrastructure).

Detectors ship as ONNX (``water_yolov8n.onnx``, ``changeformer_water.onnx``);
the COCO base is the stock ``yolov8n.pt``. Weights are loaded **once** in
``__init__`` and cached on the model object; the detectors never re-load per
request .
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

# Water-specific detection thresholds
_WATER_CONF = 0.30


class _YoloWater:
    """Single-class water body detector (YOLOv8n fine-tuned)."""

    def __init__(self, weights_path: Path) -> None:
        from ultralytics import YOLO  # lazy: heavy dependency

        self._model = YOLO(str(weights_path))

    def detect(self, image: NDArray[np.uint8]) -> SaplingDetection:
        # Reuse SaplingDetection type: count + boxes + mean_confidence
        results = self._model.predict(image, conf=_WATER_CONF, verbose=False)
        boxes: list[BoundingBox] = []
        for result in results:
            for box in result.boxes:
                xyxy = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                boxes.append(BoundingBox(xyxy[0], xyxy[1], xyxy[2], xyxy[3], round(conf, 4)))
        boxes.sort(key=lambda b: (b.y1, b.x1))
        mean_conf = round(sum(b.confidence for b in boxes) / len(boxes), 4) if boxes else 0.0
        return SaplingDetection(count=len(boxes), boxes=tuple(boxes), mean_confidence=mean_conf)


class _CocoContext:
    """COCO base detector for water-context objects (boats, bridges, dams)."""

    _WATER_CONTEXT_LABELS = frozenset({"boat", "ship", "bridge", "truck", "car", "person"})

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
                if label in self._WATER_CONTEXT_LABELS:
                    conf = round(float(box.conf[0]), 4)
                    out.append(ObjectDetection(label=label, confidence=conf))
        return tuple(out)


class YoloWaterModel:
    """Learned water model. Instantiated once per ``(key, version)``."""

    def __init__(self, version: str, weights_dir: Path) -> None:
        self.version = version
        self.saplings: SaplingDetector = _YoloWater(weights_dir / "water_yolov8n.onnx")
        self.changes: ChangeDetector = OnnxChangeFormer(weights_dir / "changeformer_water.onnx")
        self.objects: ObjectDetector = _CocoContext(weights_dir / "yolov8n.pt")