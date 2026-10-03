"""ONNX ChangeFormer runner shared by the forestry and water pipelines.

The fine-tuned ChangeFormer is shipped as ONNX (``changeformer*.onnx`` +
``.onnx.data``) rather than a pickled ``torch`` module, so it runs through
``onnxruntime`` with no PyTorch architecture class to import. The I/O contract
(verified by introspecting the exported graph) is::

    inputs : before [batch,3,256,256] float, after [batch,3,256,256] float
    output : change_logits [batch,1,256,256] float

Pre-processing mirrors training exactly (``training/*_pipeline.ipynb``):
``cv2.resize(img,(256,256)).astype(float32)/255.0`` then HWC→CHW. The head is a
single logit channel, so the binary mask is ``logit > 0`` (sigmoid > 0.5). The
mask is resized back to the ``after`` image resolution with nearest-neighbour so
``changed_fraction`` and any overlay stay aligned to the original frame.

Loaded once per model and cached on the object .
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from src.models.base import ChangeMask

_SIZE = 256


class OnnxChangeFormer:
    """Before/after change-mask producer backed by an ONNX ChangeFormer."""

    def __init__(self, weights_path: Path) -> None:
        import onnxruntime as ort  # lazy: heavy dependency (requirements-ml.txt)

        if not weights_path.exists():
            raise FileNotFoundError(f"ChangeFormer weights not found: {weights_path}")
        self._session = ort.InferenceSession(
            str(weights_path), providers=["CPUExecutionProvider"]
        )

    @staticmethod
    def _preprocess(image: NDArray[np.uint8]) -> NDArray[np.float32]:
        resized = cv2.resize(image, (_SIZE, _SIZE)).astype(np.float32) / 255.0
        # HWC → CHW, add the batch axis the graph expects.
        chw: NDArray[np.float32] = np.transpose(resized, (2, 0, 1))[np.newaxis, ...]
        return np.ascontiguousarray(chw, dtype=np.float32)

    def change_mask(
        self, before: NDArray[np.uint8], after: NDArray[np.uint8]
    ) -> ChangeMask:
        outputs = self._session.run(
            ["change_logits"],
            {"before": self._preprocess(before), "after": self._preprocess(after)},
        )
        logits: NDArray[np.float32] = outputs[0][0, 0]  # (256, 256)
        mask_small = logits > 0.0
        height, width = after.shape[:2]
        mask = cv2.resize(
            mask_small.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST
        ).astype(bool)
        return ChangeMask(mask=mask)
