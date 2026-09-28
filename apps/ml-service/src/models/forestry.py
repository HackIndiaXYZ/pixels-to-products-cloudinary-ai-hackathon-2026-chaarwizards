"""Learned forestry pipeline: YOLOv8n sapling detector + ChangeFormer change
mask + a COCO YOLOv8n base detector for person / machinery.

This is the path used once fine-tuned weights exist at ``weights_uri`` (see
``docs/planning/FINE_TUNING_STRATEGY.md``). ``torch`` / ``ultralytics`` are
heavy and are imported lazily inside the constructor so the service, its tests,
and ``mypy`` run without them installed; the deterministic baseline in
``synthetic`` covers the ``weights_uri IS NULL`` placeholder state.

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
    ChangeMask,
    ObjectDetection,
    ObjectDetector,
    SaplingDetection,
    SaplingDetector,
)

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


class _ChangeFormer:
    def __init__(self, weights_path: Path) -> None:
        import torch  # lazy: heavy dependency

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._net = torch.load(str(weights_path), map_location=self._device)
        self._net.eval()

    def change_mask(
        self, before: NDArray[np.uint8], after: NDArray[np.uint8]
    ) -> ChangeMask:
        import torch

        with torch.no_grad():
            before_t = torch.from_numpy(before).permute(2, 0, 1).float().unsqueeze(0)
            after_t = torch.from_numpy(after).permute(2, 0, 1).float().unsqueeze(0)
            logits = self._net(before_t.to(self._device), after_t.to(self._device))
            mask = (logits.argmax(dim=1).squeeze(0).cpu().numpy() > 0).astype(bool)
        return ChangeMask(mask=mask)


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
        self.saplings: SaplingDetector = _YoloSaplings(weights_dir / "sapling_yolov8n.pt")
        self.changes: ChangeDetector = _ChangeFormer(weights_dir / "changeformer.pt")
        self.objects: ObjectDetector = _CocoObjects(weights_dir / "yolov8n.pt")
