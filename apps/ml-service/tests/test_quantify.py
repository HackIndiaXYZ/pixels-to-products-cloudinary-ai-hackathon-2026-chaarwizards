"""Quantifier: metric math and determinism (identical input → identical output)."""

from __future__ import annotations

import numpy as np
from src.models.base import ChangeMask, SaplingDetection
from src.quantify import estimate_gsd_m_per_px, quantify_change


def _mask(changed: int, total_side: int = 100) -> ChangeMask:
    arr = np.zeros((total_side, total_side), dtype=bool)
    flat = arr.reshape(-1)
    flat[:changed] = True
    return ChangeMask(mask=arr)


def test_planting_metrics() -> None:
    before = SaplingDetection(count=2, mean_confidence=0.8)
    after = SaplingDetection(count=51, mean_confidence=0.9)
    mask = _mask(changed=1000)
    q = quantify_change(
        before, after, mask, gsd_m_per_px=0.1, alignment_quality=0.95, model_version="v1"
    )

    assert q.change_type == "sapling_planting"
    assert q.before_count == 2
    assert q.after_count == 51
    assert q.saplings_planted == 49
    # 1000 px * (0.1 m)^2 = 10 m^2
    assert q.area_covered_sqm == 10.0
    assert q.area_covered_hectares == 0.001
    assert q.planting_density_per_sqm == 4.9
    assert q.model_version == "v1"


def test_loss_and_no_change_classification() -> None:
    loss = quantify_change(
        SaplingDetection(count=5),
        SaplingDetection(count=1),
        _mask(0),
        gsd_m_per_px=0.1,
        alignment_quality=1.0,
        model_version="v1",
    )
    assert loss.change_type == "sapling_loss"
    assert loss.saplings_planted == 0  # never negative


def test_determinism() -> None:
    before = SaplingDetection(count=3, mean_confidence=0.7)
    after = SaplingDetection(count=10, mean_confidence=0.85)
    mask = _mask(changed=1234)
    args = dict(gsd_m_per_px=0.07, alignment_quality=0.9, model_version="v1")
    a = quantify_change(before, after, mask, **args)  # type: ignore[arg-type]
    b = quantify_change(before, after, mask, **args)  # type: ignore[arg-type]
    assert a == b
    assert a.metrics_dict() == b.metrics_dict()


def test_gsd_estimate_is_positive_and_deterministic() -> None:
    g1 = estimate_gsd_m_per_px(1920)
    g2 = estimate_gsd_m_per_px(1920)
    assert g1 == g2
    assert g1 > 0
