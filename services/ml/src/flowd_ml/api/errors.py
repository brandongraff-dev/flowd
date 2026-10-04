"""One error envelope for every failure: ``{"error": {"code", "message", "details"?, "request_id"?}}``."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..video.adapters.base import AdapterUnavailableError
from ..video.pipeline import PipelineError

log = logging.getLogger("flowd_ml")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


def _respond(
    request: Request,
    status: int,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    rid = getattr(request.state, "request_id", None) or request.scope.get("state", {}).get("request_id")
    body = ErrorResponse(error=ErrorBody(code=code, message=message, details=details, request_id=rid))
    return JSONResponse(status_code=status, content=body.model_dump(exclude_none=True), headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"loc": [str(p) for p in e["loc"]], "message": e["msg"], "type": e["type"]} for e in exc.errors()]
        first = details[0]
        where = ".".join(first["loc"][1:]) or first["loc"][0] if first["loc"] else "request"
        return _respond(request, 422, "validation_error", f"Invalid request: {where}: {first['message']}", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            413: "payload_too_large",
        }.get(exc.status_code, "http_error")
        return _respond(request, exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))

    @app.exception_handler(PipelineError)
    async def _pipeline(request: Request, exc: PipelineError) -> JSONResponse:
        return _respond(request, 502, "adapter_failed", f"The {exc.stage} step failed: {exc}", [{"stage": exc.stage}])

    @app.exception_handler(AdapterUnavailableError)
    async def _unavailable(request: Request, exc: AdapterUnavailableError) -> JSONResponse:
        return _respond(request, 503, "adapter_unavailable", str(exc))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return _respond(
            request, 500, "internal_error", "Something went wrong on our side. Quote the request id when you report it."
        )
