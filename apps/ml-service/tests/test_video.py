"""Video pipeline unit test with injected synthetic keyframes: per-keyframe
metrics plus an aggregate, no ffmpeg required."""

from __future__ import annotations

import numpy as np
from src.models.synthetic import SyntheticForestryModel
from src.quantify import estimate_gsd_m_per_px
from src.video import analyze_video
from tests.conftest import green_image


def _progression() -> list[np.ndarray]:
    # 0 -> 2 -> 4 -> 6 green blobs: an increasing planting sequence.
    return [green_image(blobs=n) for n in (0, 2, 4, 6)]


def test_analyze_video_per_keyframe_and_aggregate() -> None:
    model = SyntheticForestryModel("v1-placeholder")
    frames = _progression()
    result = analyze_video(frames, model, gsd_m_per_px=estimate_gsd_m_per_px(frames[0].shape[1]))

    # One metric per keyframe after the baseline.
    assert len(result.keyframes) == len(frames) - 1
    assert [kf.index for kf in result.keyframes] == [1, 2, 3]
    for kf in result.keyframes:
        assert kf.metrics.model_version == "v1-placeholder"

    # Aggregate compares first vs last: 0 -> 6 saplings.
    assert result.aggregate.after_count == 6
    assert result.aggregate.saplings_planted == 6
    assert result.model_version == "v1-placeholder"


def test_analyze_video_requires_two_frames() -> None:
    model = SyntheticForestryModel("v1-placeholder")
    import pytest

    with pytest.raises(ValueError, match="at least two keyframes"):
        analyze_video([green_image()], model, gsd_m_per_px=0.1)


def test_video_determinism() -> None:
    model = SyntheticForestryModel("v1-placeholder")
    frames = _progression()
    a = analyze_video(frames, model, gsd_m_per_px=0.1)
    b = analyze_video(frames, model, gsd_m_per_px=0.1)
    assert a.aggregate == b.aggregate
    assert [k.metrics for k in a.keyframes] == [k.metrics for k in b.keyframes]
