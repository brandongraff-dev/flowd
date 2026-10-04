# syntax=docker/dockerfile:1.7
#
# flowd ML service.
#   docker build -t flowd-ml services/ml                       # CPU rules API (tiny, no GPU, no downloads)
#   docker build -t flowd-ml-train --build-arg EXTRAS=train .   # + LightGBM trainer
#   docker build -t flowd-ml-worker --target worker services/ml # GPU video worker: real adapters (Whisper, PySceneDetect, SigLIP)
#
#   docker run --rm -p 8080:8080 -e ML_ENV=dev flowd-ml
#   docker run --rm -p 8080:8080 -e ML_ENV=prod -e ML_API_KEY=... flowd-ml   # prod refuses to start without a key
#
# Pins mirror pyproject.toml. The image runs as an unprivileged user and has a health check on /healthz.
# It defaults to ML_ENV=prod and fails closed: no ML_API_KEY, no start. Pass -e ML_ENV=dev for an open local instance.

ARG PYTHON_VERSION=3.12

# ── build: install the package and its pinned runtime dependencies into /install ───────────────────
FROM python:${PYTHON_VERSION}-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
COPY pyproject.toml README.md ./
COPY src ./src
ARG EXTRAS=""
RUN pip install --prefix=/install ".${EXTRAS:+[${EXTRAS}]}"

# ── runtime: the rules API ─────────────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ML_ENV=prod ML_MODEL_DIR=/models
RUN useradd --system --uid 10001 --create-home --home-dir /home/flowd flowd \
    && mkdir -p /models && chown flowd /models
COPY --from=build /install /usr/local
USER flowd
WORKDIR /home/flowd
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "flowd_ml.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--no-server-header"]

# ── worker: real video adapters (needs a GPU host; ffmpeg for probing, audio and frames) ──────────────
FROM python:${PYTHON_VERSION}-slim AS worker-build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /src
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --prefix=/install ".[real]"

FROM python:${PYTHON_VERSION}-slim AS worker
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ML_ENV=prod ML_ADAPTERS=real ML_MODEL_DIR=/models HF_HOME=/models/hf
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /home/flowd flowd \
    && mkdir -p /models && chown flowd /models
COPY --from=worker-build /install /usr/local
USER flowd
WORKDIR /home/flowd
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "flowd_ml.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--no-server-header"]
