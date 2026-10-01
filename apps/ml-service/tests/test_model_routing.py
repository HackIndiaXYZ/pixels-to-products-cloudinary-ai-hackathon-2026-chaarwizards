"""`default_factory` routes strictly by sector (§3.3).

These run WITHOUT the heavy learned-weights deps: they exercise only the
``weights_uri IS NULL`` baseline branch (synthetic models are pure numpy) and
the unknown-sector guard. The learned branch is covered in test_onnx_models.py,
which skips when onnxruntime/ultralytics/weights are absent (e.g. in CI).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from src.models.synthetic import SyntheticForestryModel
from src.models.synthetic_water import SyntheticWaterModel
from src.registry import ModelRow, default_factory

_WEIGHTS = Path("weights")


def test_forestry_routes_to_forestry_baseline() -> None:
    model = default_factory(_WEIGHTS)(ModelRow("forestry", "v1", "forestry", "trained", None))
    assert isinstance(model, SyntheticForestryModel)


def test_water_routes_to_water_baseline_not_forestry() -> None:
    # The §3.3 regression guard: a water row must never yield a forestry model.
    model = default_factory(_WEIGHTS)(ModelRow("water", "v1", "water", "trained", None))
    assert isinstance(model, SyntheticWaterModel)
    assert not isinstance(model, SyntheticForestryModel)


def test_unknown_trained_sector_is_rejected_never_substituted() -> None:
    build = default_factory(_WEIGHTS)
    with pytest.raises(ValueError, match="no model pipeline"):
        build(ModelRow("infra", "v1", "infrastructure", "trained", "weights/x.onnx"))
