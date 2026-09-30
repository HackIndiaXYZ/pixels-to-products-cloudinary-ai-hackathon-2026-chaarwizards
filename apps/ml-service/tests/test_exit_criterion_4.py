"""MVP exit criterion 4 (MVP_EXIT_CRITERIA.md #4):

"5 photo pairs + 3 video pairs → real metrics + diff images and video." The
hard sub-clause (§3.2): every emitted metric must carry a ``model_version`` that
resolves to a real ``model_registry`` row. A number with no ``model_version``
fails this test outright, regardless of how plausible it looks.

This is a seeded end-to-end run over fixture pairs through the actual endpoints
(`/v1/detect-change`, `/v1/detect-change-video`), reusing the synthetic-image
and injected-keyframe fixtures from ``conftest`` (AGENTS.md Python conventions —
no new pipeline is invented). The photo path also asserts a diff IMAGE artifact
is produced and uploaded; the video path asserts per-keyframe change metrics
(the video "diff") plus an aggregate.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from src.registry import ModelRow
from tests.conftest import (
    DictDownloader,
    ListExtractor,
    RecordingUploader,
    auth_header,
    green_image,
    make_registry,
    make_services,
    png_bytes,
)

FIXED_SECTOR = "forestry"


def _resolves_to_trained_row(model_version: str) -> bool:
    """A model_version is legitimate only if it matches a trained registry row."""
    registry = make_registry()
    row: ModelRow | None = registry.resolve(FIXED_SECTOR)
    return row is not None and row.status == "trained" and row.version == model_version


def _assert_real_metrics(body: dict[str, object]) -> None:
    """Every metric must trace to a model_registry version (§3.2)."""
    version = body.get("model_version")
    assert isinstance(version, str) and version, "metric carries no model_version (§3.2 fail)"
    assert _resolves_to_trained_row(version), f"model_version {version!r} has no trained row"
    metrics = body.get("change_metrics")
    assert isinstance(metrics, dict) and metrics, "no metrics emitted"
    for key, value in metrics.items():
        assert isinstance(value, (int, float)), f"metric {key} is not a number: {value!r}"


# ---- 5 photo pairs ---------------------------------------------------------


def _photo_pair(idx: int, before_blobs: int, after_blobs: int) -> tuple[str, str, DictDownloader]:
    before_url = f"https://res.cloudinary.com/testcloud/image/authenticated/before-{idx}.jpg?__cld_token__=exp=9"
    after_url = f"https://res.cloudinary.com/testcloud/image/authenticated/after-{idx}.jpg?__cld_token__=exp=9"
    downloader = DictDownloader(
        {
            before_url: png_bytes(green_image(blobs=before_blobs)),
            after_url: png_bytes(green_image(blobs=after_blobs)),
        }
    )
    return before_url, after_url, downloader


def test_five_photo_pairs_emit_real_metrics_and_a_diff_image(client_factory) -> None:  # type: ignore[no-untyped-def]
    # Five distinct before/after planting sequences (0->2, 1->3, 2->4, 2->5, 3->6).
    pairs = [(0, 2), (1, 3), (2, 4), (2, 5), (3, 6)]
    diffs_produced = 0

    for i, (before_blobs, after_blobs) in enumerate(pairs):
        before_url, after_url, downloader = _photo_pair(i, before_blobs, after_blobs)
        uploader = RecordingUploader()
        client = client_factory(make_services(downloader=downloader, uploader=uploader))
        res = client.post(
            "/v1/detect-change",
            json={
                "before_url": before_url,
                "after_url": after_url,
                "sector": FIXED_SECTOR,
                "project_id": "proj-1",
            },
            headers=auth_header(job_id=f"job-photo-{i}"),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        _assert_real_metrics(body)
        # Diff IMAGE artifact: a red-overlay PNG was rendered and uploaded.
        assert body["diff_url"] is not None
        assert uploader.uploads, "no diff image was uploaded"
        assert uploader.uploads[0][1] > 0  # non-empty PNG bytes
        diffs_produced += 1

    assert diffs_produced == 5


# ---- 3 video pairs ---------------------------------------------------------


def _progression(counts: tuple[int, ...]) -> list[NDArray[np.uint8]]:
    return [green_image(blobs=n) for n in counts]


def test_three_video_pairs_emit_real_metrics_and_keyframe_diffs(client_factory) -> None:  # type: ignore[no-untyped-def]
    # Three distinct planting videos, each an increasing sequence of keyframes.
    videos = [(0, 2, 4), (1, 3, 5, 7), (0, 3, 6)]

    for i, counts in enumerate(videos):
        video_url = f"https://res.cloudinary.com/testcloud/video/authenticated/clip-{i}.mp4?__cld_token__=exp=9"
        downloader = DictDownloader({video_url: b"fake-mp4-bytes"})
        extractor = ListExtractor(_progression(counts))
        client = client_factory(make_services(downloader=downloader, keyframes=extractor))
        res = client.post(
            "/v1/detect-change-video",
            json={"video_url": video_url, "sector": FIXED_SECTOR, "project_id": "proj-1"},
            headers=auth_header(job_id=f"job-video-{i}"),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        _assert_real_metrics(body)
        # Video "diff": one change metric per keyframe after the baseline, each
        # carrying the model_version (§3.2).
        keyframes = body["keyframes"]
        assert len(keyframes) == len(counts) - 1
        for kf in keyframes:
            assert kf["change_metrics"]
