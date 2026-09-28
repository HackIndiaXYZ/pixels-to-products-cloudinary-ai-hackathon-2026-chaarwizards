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

# App code. Model weights are gitignored and provided at deploy time (mounted
# volume or a build arg that downloads them into WEIGHTS_DIR). When absent the
# forestry placeholder runs the deterministic baseline (weights_uri NULL), so
# the image stays buildable without a weights blob.
COPY src/ ./src/
RUN mkdir -p /app/weights

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    WEIGHTS_DIR=/app/weights

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
