"""The FastAPI application factory."""

from __future__ import annotations

import hmac
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.openapi.utils import get_openapi

from ..schemas.misc import HealthResponse, ReadyResponse
from ..settings import Settings, get_settings
from ..version import CONTRACT_VERSION, SERVICE_VERSION
from ..video.adapters.base import AdapterSet
from .errors import install_error_handlers
from .middleware import BodyLimitMiddleware, RequestContextMiddleware
from .routes import router
from .state import MlState, build_state, ml_state

DESCRIPTION = """\
**flowd ML service.** Day-one pretrained + rules models for the creator market, behind one FastAPI app.

Every response is explainable: a `model` block (name, version, stage), ordered `reasons` (plain English, with timecodes and
points), and ordered `fixes`. Scores are **checklist scores** until a learned model beats them on held-out apps
("Checklist score. It gets smarter as bounties settle.").

Auth: `Authorization: Bearer <ML_API_KEY>` on every `/v1` route when a key is configured (always in production).
Money is integer cents; times are milliseconds from the first frame unless a field says otherwise.
"""

TAGS = [
    {
        "name": "scores",
        "description": "Hook Score and Flow Score: checklist scores with timecoded reasons and one-tap fixes.",
    },
    {"name": "trust", "description": "Auto-QA, view-fraud scoring and perceptual-hash duplicate detection."},
    {"name": "marketplace", "description": "Matching, suggested CPM with a fill-time curve, fatigue alerts."},
    {
        "name": "video",
        "description": "Video understanding pipeline (Whisper, PySceneDetect, vision-language model, SigLIP/CLIP behind adapters) and embeddings.",
    },
    {
        "name": "monitoring",
        "description": "Calibration reports, the eight ML systems and their stage, service metadata.",
    },
    {"name": "ops", "description": "Liveness and readiness."},
]


def create_app(
    settings: Settings | None = None, adapters: AdapterSet | None = None, clock: Callable[[], str] | None = None
) -> FastAPI:
    cfg = settings or get_settings()
    state = build_state(cfg, adapters, clock)

    def require_api_key(request: Request) -> None:
        """Bearer-token auth for /v1. Open only when no key is configured (never in prod: Settings refuses to start)."""
        key = cfg.api_key
        if key is None:
            return
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode(), key.get_secret_value().encode()):
            raise HTTPException(
                status_code=401, detail="Missing or invalid bearer token.", headers={"WWW-Authenticate": "Bearer"}
            )

    app = FastAPI(
        title="flowd ML service",
        version=SERVICE_VERSION,
        description=DESCRIPTION,
        openapi_tags=TAGS,
        contact={"name": "flowd, Inc.", "url": "https://joinflowd.io"},
        license_info={"name": "Proprietary"},
        docs_url="/docs" if cfg.env != "prod" else None,
        redoc_url=None,
        openapi_url="/openapi.json"
        if cfg.env != "prod"
        else None,  # production publishes no schema; openapi.json is committed
    )
    app.state.ml = state
    app.add_middleware(BodyLimitMiddleware, max_bytes=cfg.max_body_bytes)
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)
    app.include_router(router, dependencies=[Depends(require_api_key)])

    @app.get("/healthz", response_model=HealthResponse, tags=["ops"], summary="Liveness")
    def healthz() -> HealthResponse:
        return HealthResponse(version=SERVICE_VERSION)

    @app.get("/readyz", response_model=ReadyResponse, tags=["ops"], summary="Readiness: adapters constructed")
    def readyz(ml: Annotated[MlState, Depends(ml_state)]) -> ReadyResponse:
        return ReadyResponse(
            adapters=ml.adapters.names(), stage=ml.pipeline.stage, auth="required" if cfg.api_key else "open"
        )

    def custom_openapi() -> dict[str, object]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
            tags=TAGS,
            contact=app.contact,
            license_info=app.license_info,
        )
        schema["info"]["x-contract-version"] = CONTRACT_VERSION
        schema["components"].setdefault("securitySchemes", {})["bearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "description": "ML_API_KEY, sent by the flowd backend.",
        }
        for path, ops in schema["paths"].items():
            if path.startswith("/v1"):
                for op in ops.values():
                    op.setdefault("security", [{"bearerAuth": []}])
        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
    return app
