"""Render a ChangeFormer mask as a red-overlay PNG (CLOUDINARY_TRANSFORMATIONS.md
§3).

Cloudinary has **no** ``e_diff`` effect and no difference blend mode, so the
diff is rendered here and uploaded as its own derivative. This module only
produces the PNG bytes; the upload lives in :mod:`src.cloudinary_io`.
"""

from __future__ import annotations

import cv2
import numpy as np
from numpy.typing import NDArray

from src.models.base import ChangeMask

# Solid red, 50% over the changed pixels. Fixed for determinism.
_OVERLAY_COLOR_RGB = (255, 0, 0)
_OVERLAY_ALPHA = 0.5


def render_red_overlay(
    after_image: NDArray[np.uint8],
    change: ChangeMask,
    *,
    alpha: float = _OVERLAY_ALPHA,
) -> bytes:
    """Blend a red overlay onto ``after_image`` where ``change.mask`` is true and
    return PNG bytes. Deterministic for identical inputs."""
    if after_image.ndim != 3 or after_image.shape[2] != 3:
        raise ValueError("after_image must be an HxWx3 RGB array")

    mask = change.mask
    if mask.shape != after_image.shape[:2]:
        mask = cv2.resize(
            mask.astype(np.uint8),
            (after_image.shape[1], after_image.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        ).astype(bool)

    overlay = after_image.copy()
    color = np.array(_OVERLAY_COLOR_RGB, dtype=np.float32)
    blended = (1.0 - alpha) * after_image[mask].astype(np.float32) + alpha * color
    overlay[mask] = blended.round().astype(np.uint8)

    # cv2 expects BGR on encode; convert so the PNG's red channel is correct.
    bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
    ok, buffer = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("failed to encode diff PNG")
    return bytes(buffer.tobytes())
