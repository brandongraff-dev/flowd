"""Edges that the happy-path tests do not reach: the container entrypoint, streamed-body limits, request ids, text helpers."""

from __future__ import annotations

import importlib
import json
import re
import sys

import pytest
from fastapi.testclient import TestClient

from flowd_ml.api.app import create_app
from flowd_ml.settings import Settings
from flowd_ml.text.normalize import contains_phrase, first_match, phrase_pattern


def test_the_container_entrypoint_builds_the_app_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """The Dockerfile and Modal start ``flowd_ml.main:app``; importing it must read ``ML_*`` and expose the /v1 routes."""
    monkeypatch.setenv("ML_ENV", "test")
    monkeypatch.setenv("ML_FIXED_NOW", "2026-10-03T14:00:00Z")
    from flowd_ml.settings import get_settings

    get_settings.cache_clear()
    sys.modules.pop("flowd_ml.main", None)
    try:
        main = importlib.import_module("flowd_ml.main")
        paths = set(main.app.openapi()["paths"])
        assert {"/v1/hook-score", "/v1/qa", "/v1/fraud", "/healthz"} <= paths
        assert TestClient(main.app).get("/healthz").json()["status"] == "ok"
    finally:
        sys.modules.pop("flowd_ml.main", None)
        get_settings.cache_clear()


def _small_limit_client() -> TestClient:
    return TestClient(create_app(Settings(env="test", max_body_bytes=1024)))


def test_a_declared_oversized_body_is_refused_before_it_is_read() -> None:
    r = _small_limit_client().post("/v1/hook-score", content=b"x" * 5000, headers={"content-type": "application/json"})
    assert r.status_code == 413
    body = r.json()["error"]
    assert body["code"] == "payload_too_large"
    assert "1,024" in body["message"]
    assert body["request_id"], "the refusal still carries the request id"


def test_a_streamed_body_without_content_length_is_cut_off_at_the_limit() -> None:
    """Chunked uploads declare no length, so the limit has to be enforced while the body streams in."""

    def chunks():
        for _ in range(20):
            yield b'{"pad":"' + b"x" * 400 + b'"}'

    r = _small_limit_client().post("/v1/hook-score", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"
    assert r.headers["x-request-id"], "the cut-off response is still traceable"


def test_a_body_under_the_limit_still_works() -> None:
    r = _small_limit_client().post("/v1/hook-score", json={"lands_ms": 1200})
    assert r.status_code == 200
    assert r.json()["points"] >= 0


def test_the_callers_request_id_is_echoed_and_a_missing_one_is_minted() -> None:
    client = TestClient(create_app(Settings(env="test")))
    echoed = client.get("/healthz", headers={"x-request-id": "req_from_the_backend_42"})
    assert echoed.headers["x-request-id"] == "req_from_the_backend_42"
    minted = client.get("/healthz")
    assert re.fullmatch(r"[0-9a-f]{32}", minted.headers["x-request-id"])
    assert minted.headers["x-request-id"] != client.get("/healthz").headers["x-request-id"]
    error = client.post("/v1/hook-score", json={"lands_ms": "soon"}, headers={"x-request-id": "req_bad_input"})
    assert error.status_code == 422
    assert json.loads(error.text)["error"]["request_id"] == "req_bad_input"


def test_empty_phrases_never_match_and_first_match_returns_the_first_hit() -> None:
    assert phrase_pattern("   ").search("anything at all") is None
    assert contains_phrase("anything at all", "   ") is False
    patterns = [re.compile("zzz"), re.compile("budget")]
    hit = first_match("A Budget app", patterns)
    assert hit is not None
    assert hit.group(0) == "budget"
    assert first_match("nothing relevant here", patterns) is None
