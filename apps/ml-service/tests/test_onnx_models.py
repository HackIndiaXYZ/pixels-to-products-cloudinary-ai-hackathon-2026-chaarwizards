"""Learned ONNX pipelines actually load and infer, and route by sector (§3.3).

Skipped unless onnxruntime + ultralytics are installed AND the exported weights
are present — i.e. this runs locally / in the production image, and is skipped in
the lightweight CI gate (which omits requirements-ml.txt). That mirrors how the
heavy learned path is excluded from coverage in pyproject.toml.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

pytest.importorskip("onnxruntime")
pytest.importorskip("ultralytics")

from src.models.base import ChangeMask, SaplingDetection  # noqa: E402
from src.models.water import YoloWaterModel  # noqa: E402
from src.registry import ModelRow, default_factory  # noqa: E402

_WEIGHTS = Path(__file__).resolve().parents[1] / "weights"

pytestmark = pytest.mark.skipif(
    not (_WEIGHTS / "sapling_yolov8n.onnx").exists()
    or not (_WEIGHTS / "water_yolov8n.onnx").exists(),
    reason="exported learned weights not present",
)


def _noise(size: int = 256) -> NDArray[np.uint8]:
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, (size, size, 3), dtype=np.uint8)


def test_forestry_learned_loads_and_infers() -> None:
    model = default_factory(_WEIGHTS)(
        ModelRow("forestry", "v1.0", "forestry", "trained", "weights/sapling_yolov8n.onnx")
    )
    assert model.version == "v1.0"
    detection = model.saplings.detect(_noise())
    assert isinstance(detection, SaplingDetection)
    assert detection.count >= 0
    mask = model.changes.change_mask(_noise(), _noise())
    assert isinstance(mask, ChangeMask)
    assert mask.mask.shape == (256, 256)
    assert 0.0 <= mask.changed_fraction <= 1.0


def test_water_learned_routes_to_water_model_not_forestry() -> None:
    model = default_factory(_WEIGHTS)(
        ModelRow("water", "v1.0", "water", "trained", "weights/water_yolov8n.onnx")
    )
    # The sector guard: a trained water row yields the water pipeline, never forestry.
    assert isinstance(model, YoloWaterModel)
    detection = model.saplings.detect(_noise())
    assert isinstance(detection, SaplingDetection)
    mask = model.changes.change_mask(_noise(), _noise())
    assert isinstance(mask, ChangeMask)
