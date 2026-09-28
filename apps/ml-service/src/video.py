"""Video change pipeline (Phase 6, in scope): FFmpeg keyframe extraction → ORB
feature match + homography alignment → per-keyframe change → aggregate metrics.

The ML service pins ``ffmpeg`` in its image (see the Dockerfile / requirements
note); keyframe extraction shells out to it. Extraction is injected through a
port so the pipeline is unit-testable with synthetic frames and no ffmpeg
process. Every metric still originates from the versioned CV model (§3.2).
"""

from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np
from numpy.typing import NDArray

from src.models.base import SectorModel
from src.quantify import ChangeQuantification, quantify_change

_ORB_FEATURES = 1000
_MIN_MATCHES = 10
_LOWE_RATIO = 0.75


class KeyframeExtractor(Protocol):
    def extract(self, video_path: Path) -> list[NDArray[np.uint8]]: ...


class FfmpegKeyframeExtractor:
    """Extracts keyframes at a fixed sampling rate using ffmpeg."""

    def __init__(self, fps: float = 0.5) -> None:
        self._fps = fps

    def extract(self, video_path: Path) -> list[NDArray[np.uint8]]:
        with tempfile.TemporaryDirectory() as tmp:
            out_pattern = str(Path(tmp) / "frame_%04d.png")
            cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(video_path),
                "-vf",
                f"fps={self._fps}",
                out_pattern,
            ]
            result = subprocess.run(cmd, capture_output=True, check=False)
            if result.returncode != 0:
                # Never swallow the failure — surface ffmpeg's stderr (§3.6).
                raise RuntimeError(
                    f"ffmpeg keyframe extraction failed: {result.stderr.decode(errors='replace')}"
                )
            frames: list[NDArray[np.uint8]] = []
            for path in sorted(Path(tmp).glob("frame_*.png")):
                bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
                if bgr is not None:
                    frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            return frames


def align(
    reference: NDArray[np.uint8], frame: NDArray[np.uint8]
) -> tuple[NDArray[np.uint8], float]:
    """Align ``frame`` to ``reference`` with ORB + homography.

    Returns the warped frame and an alignment quality in ``0..1`` (the RANSAC
    inlier ratio). Falls back to the unwarped frame with quality 0 when too few
    matches are found — reported honestly, never hidden (§3.6).
    """
    ref_gray = cv2.cvtColor(reference, cv2.COLOR_RGB2GRAY)
    frm_gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)

    orb = cv2.ORB_create(nfeatures=_ORB_FEATURES)
    kp_ref, des_ref = orb.detectAndCompute(ref_gray, None)
    kp_frm, des_frm = orb.detectAndCompute(frm_gray, None)
    if des_ref is None or des_frm is None or len(kp_ref) < _MIN_MATCHES:
        return frame, 0.0

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw = matcher.knnMatch(des_frm, des_ref, k=2)
    good = [
        pair[0]
        for pair in raw
        if len(pair) == 2 and pair[0].distance < _LOWE_RATIO * pair[1].distance
    ]
    if len(good) < _MIN_MATCHES:
        return frame, 0.0

    src = np.array([kp_frm[m.queryIdx].pt for m in good], dtype=np.float32).reshape(-1, 1, 2)
    dst = np.array([kp_ref[m.trainIdx].pt for m in good], dtype=np.float32).reshape(-1, 1, 2)
    homography, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if homography is None or mask is None:
        return frame, 0.0

    inlier_ratio = float(mask.sum()) / float(len(good))
    height, width = reference.shape[:2]
    warped: NDArray[np.uint8] = cv2.warpPerspective(frame, homography, (width, height))
    return warped, round(inlier_ratio, 4)


@dataclass(frozen=True)
class KeyframeMetric:
    index: int
    alignment_quality: float
    metrics: ChangeQuantification


@dataclass(frozen=True)
class VideoChangeResult:
    keyframes: tuple[KeyframeMetric, ...]
    aggregate: ChangeQuantification
    model_version: str


def analyze_video(
    frames: list[NDArray[np.uint8]],
    model: SectorModel,
    *,
    gsd_m_per_px: float,
) -> VideoChangeResult:
    """Compute per-keyframe change against the first frame, plus an aggregate.

    Raises ``ValueError`` if there are fewer than two keyframes — a video with
    no progression cannot yield a before/after change (surfaced, not swallowed).
    """
    if len(frames) < 2:
        raise ValueError("need at least two keyframes to detect change")

    baseline = frames[0]
    baseline_saplings = model.saplings.detect(baseline)

    per_frame: list[KeyframeMetric] = []
    for index in range(1, len(frames)):
        aligned, quality = align(baseline, frames[index])
        saplings = model.saplings.detect(aligned)
        mask = model.changes.change_mask(baseline, aligned)
        metric = quantify_change(
            baseline_saplings,
            saplings,
            mask,
            gsd_m_per_px=gsd_m_per_px,
            alignment_quality=quality,
            model_version=model.version,
        )
        per_frame.append(KeyframeMetric(index=index, alignment_quality=quality, metrics=metric))

    # Aggregate: first vs last keyframe — the overall before/after change.
    last_aligned, last_quality = align(baseline, frames[-1])
    last_saplings = model.saplings.detect(last_aligned)
    last_mask = model.changes.change_mask(baseline, last_aligned)
    aggregate = quantify_change(
        baseline_saplings,
        last_saplings,
        last_mask,
        gsd_m_per_px=gsd_m_per_px,
        alignment_quality=last_quality,
        model_version=model.version,
    )

    return VideoChangeResult(
        keyframes=tuple(per_frame),
        aggregate=aggregate,
        model_version=model.version,
    )
