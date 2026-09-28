"""Gate item: a 30s video fixture produces per-keyframe metrics and an
aggregate through the real FFmpeg keyframe extractor.

Generates the fixture with ffmpeg's ``testsrc`` so no binary blob is committed.
Skipped (reported BLOCKED by the gate) if ffmpeg is unavailable."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from src.models.synthetic import SyntheticForestryModel
from src.quantify import estimate_gsd_m_per_px
from src.video import FfmpegKeyframeExtractor, analyze_video

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def _make_30s_video(path: Path) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=30:size=320x240:rate=10",
        "-pix_fmt",
        "yuv420p",
        str(path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def test_30s_video_yields_per_keyframe_and_aggregate(tmp_path: Path) -> None:
    video = tmp_path / "clip.mp4"
    _make_30s_video(video)

    # 0.2 fps over 30s -> ~6 keyframes.
    extractor = FfmpegKeyframeExtractor(fps=0.2)
    frames = extractor.extract(video)
    assert len(frames) >= 2, f"expected >=2 keyframes, got {len(frames)}"

    model = SyntheticForestryModel("v1-placeholder")
    result = analyze_video(frames, model, gsd_m_per_px=estimate_gsd_m_per_px(frames[0].shape[1]))

    assert len(result.keyframes) == len(frames) - 1
    for kf in result.keyframes:
        assert kf.metrics.model_version == "v1-placeholder"
        assert "pct_area_changed" in kf.metrics.metrics_dict()
    assert result.aggregate.model_version == "v1-placeholder"
