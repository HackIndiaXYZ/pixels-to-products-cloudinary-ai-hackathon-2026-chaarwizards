# apps/ml-service — ML service image (docs/operations/deployment.md).
# Python 3.11 to match .python-version and the mypy/runtime target.
FROM python:3.11-slim

WORKDIR /app

# System deps:
# - OpenCV runtime libs (libGL etc.) for opencv-python-headless.
# - ffmpeg for the video keyframe-extraction pipeline (Phase 6). Pinned to the
#   Debian major series (7.x on bookworm) via an apt version glob so the clip
#   extraction behaviour is reproducible.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 \
    "ffmpeg=7:*" \
    && rm -rf /var/lib/apt/lists/*

# Python deps first for layer caching. requirements.txt is the light runtime;
# requirements-ml.txt adds the heavy learned-weights path (torch, ultralytics)
# the production image needs once real forestry weights land.
COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt

# App code + the learned ONNX weights (sapling/water yolov8n.onnx,
# changeformer*.onnx + .onnx.data, COCO base yolov8n.pt). The weights are
# committed under apps/ml-service/weights/ (force-tracked past the global *.onnx
# / *.pt ignore) so the image is self-contained — the learned pipelines resolve
# them from WEIGHTS_DIR at load. ~32 MB total.
COPY src/ ./src/
COPY weights/ ./weights/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    WEIGHTS_DIR=/app/weights

EXPOSE 8000

# Shell form so Render's injected $PORT is honoured; falls back to 8000 for a
# plain `docker run` locally.
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
