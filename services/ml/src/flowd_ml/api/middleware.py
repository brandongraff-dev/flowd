"""ASGI middleware: request ids and a hard request-size limit (works for chunked bodies too)."""

from __future__ import annotations

import contextlib
import json
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..version import SERVICE_VERSION


class RequestContextMiddleware:
    """Attach ``X-Request-Id`` (reuse the caller's, else mint one) and ``X-Flowd-ML-Version`` to every HTTP response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        request_id = headers.get("x-request-id") or uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                hdrs = list(message.get("headers", []))
                hdrs.append((b"x-request-id", request_id.encode("latin-1")))
                hdrs.append((b"x-flowd-ml-version", SERVICE_VERSION.encode("latin-1")))
                message["headers"] = hdrs
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodyLimitMiddleware:
    """Reject bodies over ``max_bytes`` with 413: by Content-Length up front, and by counting streamed chunks."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    @staticmethod
    def _too_large(max_bytes: int, request_id: str | None) -> dict[str, Any]:
        return {
            "error": {
                "code": "payload_too_large",
                "message": f"The request body is larger than {max_bytes:,} bytes.",
                "request_id": request_id,
            }
        }

    async def _reject(self, scope: Scope, send: Send) -> None:
        body = json.dumps(self._too_large(self.max_bytes, scope.get("state", {}).get("request_id"))).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = next((v for k, v in scope["headers"] if k == b"content-length"), None)
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(scope, send)
            return

        received = 0
        started = False
        exceeded = False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    exceeded = True
                    raise _TooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if exceeded:
                # The app is answering a body we cut off (FastAPI turns the abort into a generic 400): drop that
                # response; the 413 below is the truthful one.
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        with contextlib.suppress(_TooLargeError):
            await self.app(scope, limited_receive, tracking_send)
        if exceeded and not started:
            await self._reject(scope, send)


class _TooLargeError(Exception):
    """Raised inside the receive channel when a streamed body exceeds the limit."""
