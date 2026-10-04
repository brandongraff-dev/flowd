"""The HTTP API: every endpoint, auth, error envelope, limits, OpenAPI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from flowd_ml.api.app import create_app
from flowd_ml.schemas.calibration import CalibrationRequest
from flowd_ml.schemas.fatigue import FatigueRequest
from flowd_ml.schemas.fraud import FraudRequest
from flowd_ml.schemas.matching import MatchRequest
from flowd_ml.schemas.pricing import SuggestCpmRequest
from flowd_ml.schemas.qa import QaRequest
from flowd_ml.schemas.scores import FlowScoreRequest, HookScoreRequest
from flowd_ml.schemas.video import AnalyzeVideoRequest
from flowd_ml.settings import Settings
from helpers import ROOT, assert_subset, load_vectors

ENDPOINTS = [
    ("/v1/hook-score", HookScoreRequest),
    ("/v1/flow-score", FlowScoreRequest),
    ("/v1/qa", QaRequest),
    ("/v1/fraud", FraudRequest),
    ("/v1/match", MatchRequest),
    ("/v1/suggest-cpm", SuggestCpmRequest),
    ("/v1/analyze-video", AnalyzeVideoRequest),
    ("/v1/fatigue", FatigueRequest),
    ("/v1/calibration/report", CalibrationRequest),
]


def example(model) -> dict:
    return model.model_json_schema()["examples"][0]


@pytest.mark.parametrize(("path", "model"), ENDPOINTS, ids=[p for p, _ in ENDPOINTS])
def test_every_endpoint_answers_its_documented_example_with_explanations(client: TestClient, path: str, model) -> None:
    r = client.post(path, json=example(model))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["model"]["stage"] in ("heuristic", "shadow", "learned")
    assert body["model"]["version"]
    assert isinstance(body["reasons"], list), "every response carries a reasons list"
    assert body["reasons"], "every response carries at least one reason"
    assert "fixes" in body
    assert isinstance(body["fixes"], list)
    assert body.get("summary") or body.get("message"), "every response states its conclusion in one plain sentence"
    assert r.headers["x-request-id"]
    assert r.headers["x-flowd-ml-version"] == "1.0.0"


def test_hook_and_flow_endpoints_return_the_contract_shape(client: TestClient) -> None:
    for case in load_vectors("hook_score")["cases"][:4]:
        assert_subset(case["out"], client.post("/v1/hook-score", json=case["in"]).json())
    for case in load_vectors("flow_score")["cases"][:4]:
        assert_subset(case["out"], client.post("/v1/flow-score", json=case["in"]).json())
    r = client.post("/v1/hook-score", json={"lands_ms": 3600}).json()
    assert r["label"] == "Checklist score. It gets smarter as bounties settle."
    assert r["items"][0]["target_ms"] == 2000


@pytest.mark.parametrize("suite", ["fraud_compose", "qa", "suggest_cpm", "fatigue", "calibration", "video_analysis"])
def test_vectors_replay_over_http(client: TestClient, suite: str) -> None:
    v = load_vectors(suite)
    for case in v["cases"][:6]:
        r = client.post(v["endpoint"], json=case["in"])
        assert r.status_code == 200, (case["id"], r.text)
        body = r.json()
        if suite == "qa":
            body = {
                **body,
                "checks": [
                    {k: c.get(k) for k in ("check", "result", "blocks_settlement", "reason_code")}
                    for c in body["checks"]
                ],
            }
        if suite in ("calibration", "video_analysis", "suggest_cpm", "fatigue"):
            continue  # shapes are re-derived in the dedicated tests; here we only prove the route accepts the vector input
        assert_subset(case["out"], body)


def test_analyze_video_over_http_is_deterministic(client: TestClient) -> None:
    body = {
        "submission_id": "sub_0412",
        "video": {"uri": "fake://strong_screen_reaction?seed=412"},
        "brief": {"beats": [{"beat": "hook"}], "app_name": "Lumi", "brand_name": "Lumi"},
    }
    a, b = client.post("/v1/analyze-video", json=body).json(), client.post("/v1/analyze-video", json=body).json()
    for r in (a, b):
        r.pop("timings_ms")
    assert a == b
    assert a["id"] == "va_0412_v1"
    assert a["stage"] == "fake"
    assert a["flow_score"]["label"].startswith("Checklist score")


def test_embed_and_match_use_the_configured_provider(client: TestClient) -> None:
    r = client.post("/v1/embed", json={"texts": ["AI photo editor", "budget planner"]}).json()
    assert r["provider"] == "fake-hashing-embedder"
    assert r["dim"] == 256
    assert len(r["vectors"]) == 2
    assert len(r["vectors"][0]) == 256
    body = example(MatchRequest)
    body["creator"]["bio"] = "I test AI photo apps"
    body["bounties"][0]["summary"] = "AI photo glow-up reveal"
    m = client.post("/v1/match", json=body).json()
    assert m["ranked"][0]["embedding_similarity"] is not None
    assert client.post("/v1/embed", json={"texts": []}).status_code == 422


def test_models_and_meta_describe_the_eight_systems(client: TestClient) -> None:
    models = client.get("/v1/models").json()
    assert [m["kind"] for m in models] == [
        "video_understanding",
        "hook_coach",
        "auto_qa",
        "fraud",
        "creative_scorer",
        "matching",
        "pricing",
        "fatigue",
    ]
    assert all(
        m["stage"] == "heuristic"
        and m["id"] == f"mdl_{m['kind']}"
        and m["endpoints"]
        and m["approach"]
        and m["next_stage"]
        and m["learned_ready_at_posts"] == 1000
        for m in models
    )
    assert {m["kind"] for m in models if m["label"]} == {
        "hook_coach",
        "creative_scorer",
    }  # the honest label travels with the scorers
    meta = client.get("/v1/meta").json()
    assert meta["service"] == "flowd-ml"
    assert meta["contract_version"] == "1.0.0"
    assert meta["stage"] == "fake"
    assert meta["now"] == "2026-10-03T14:00:00Z"
    assert meta["adapters"]["transcriber"] == "fake-whisper"
    assert len(meta["models"]) == 8


def test_health_and_readiness_are_open(secured_client: TestClient) -> None:
    assert secured_client.get("/healthz").json() == {"status": "ok", "service": "flowd-ml", "version": "1.0.0"}
    ready = secured_client.get("/readyz").json()
    assert ready["status"] == "ready"
    assert ready["auth"] == "required"
    assert ready["stage"] == "fake"


# ── auth ────────────────────────────────────────────────────────────────────────────────────────
def test_v1_requires_the_bearer_token_when_configured(secured_client: TestClient) -> None:
    body = {"lands_ms": 1000}
    r = secured_client.post("/v1/hook-score", json=body)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    assert r.json()["error"]["code"] == "unauthorized"
    assert r.json()["error"]["request_id"]
    assert (
        secured_client.post("/v1/hook-score", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
    )
    assert (
        secured_client.post("/v1/hook-score", json=body, headers={"Authorization": "Basic s3cret-test-key"}).status_code
        == 401
    )
    ok = secured_client.post("/v1/hook-score", json=body, headers={"Authorization": "Bearer s3cret-test-key"})
    assert ok.status_code == 200
    assert secured_client.get("/v1/models").status_code == 401
    assert secured_client.get("/v1/meta").status_code == 401


def test_prod_fails_closed_without_a_key_and_hides_docs() -> None:
    with pytest.raises(ValidationError, match="ML_API_KEY is required"):
        Settings(env="prod")
    prod = TestClient(create_app(Settings(env="prod", api_key="k", model_dir=ROOT / "none")))
    assert prod.get("/docs").status_code == 404
    assert prod.get("/openapi.json").status_code == 404, (
        "production serves no schema; the committed openapi.json is the contract"
    )
    assert prod.get("/healthz").status_code == 200
    assert TestClient(create_app(Settings(env="dev", model_dir=ROOT / "none"))).get("/docs").status_code == 200


def test_prod_with_fake_adapters_refuses_analyze_video() -> None:
    prod = TestClient(create_app(Settings(env="prod", api_key="k", model_dir=ROOT / "none")))
    r = prod.post(
        "/v1/analyze-video", json={"video": {"uri": "s3://bucket/x.mp4"}}, headers={"Authorization": "Bearer k"}
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "adapter_unavailable"
    assert "GPU deployment" in r.json()["error"]["message"]
    assert (
        prod.post("/v1/hook-score", json={}, headers={"Authorization": "Bearer k"}).status_code == 200
    )  # the rules API still works


def test_scenario_uris_can_be_disabled() -> None:
    c = TestClient(create_app(Settings(env="test", allow_scenario_uris=False, model_dir=ROOT / "none")))
    r = c.post("/v1/analyze-video", json={"video": {"uri": "fake://strong_screen_reaction"}})
    assert r.status_code == 422
    assert "scenario URIs" in r.json()["error"]["message"]


# ── errors and limits ───────────────────────────────────────────────────────────────────────────
def test_validation_errors_use_one_envelope_with_the_field_path(client: TestClient) -> None:
    r = client.post("/v1/hook-score", json={"lands_ms": "soon", "face_ms": -5})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    assert err["request_id"]
    assert "lands_ms" in err["message"]
    assert {tuple(d["loc"]) for d in err["details"]} == {("body", "lands_ms"), ("body", "face_ms")}
    unknown = client.post("/v1/hook-score", json={"lands": 1}).json()["error"]
    assert "Extra inputs are not permitted" in unknown["message"]
    assert "lands" in unknown["message"]
    cross = client.post("/v1/flow-score", json={"duration_s": 10}).json()["error"]
    assert "hook_points or hook" in cross["message"]
    assert (
        client.post("/v1/hook-score", content=b"{not json", headers={"content-type": "application/json"}).status_code
        == 422
    )


def test_unknown_routes_and_methods_use_the_envelope(client: TestClient) -> None:
    r = client.get("/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    r = client.get("/v1/hook-score")
    assert (r.status_code == 405 and r.json()["error"]["code"] == "method_allowed") or r.json()["error"][
        "code"
    ] == "method_not_allowed"


def test_request_ids_are_echoed_or_minted(client: TestClient) -> None:
    assert client.get("/healthz", headers={"X-Request-Id": "req-123"}).headers["x-request-id"] == "req-123"
    a, b = client.get("/healthz").headers["x-request-id"], client.get("/healthz").headers["x-request-id"]
    assert a != b
    assert len(a) == 32
    err = client.post("/v1/hook-score", json={"lands_ms": "x"}, headers={"X-Request-Id": "req-9"}).json()["error"]
    assert err["request_id"] == "req-9"


def test_oversized_bodies_are_rejected_before_parsing() -> None:
    c = TestClient(create_app(Settings(env="test", max_body_bytes=2_000, model_dir=ROOT / "none")))
    big = {"transcript": [{"t_start_ms": 0, "t_end_ms": 1, "text": "x" * 500}] * 20, "media": {"duration_ms": 1000}}
    r = c.post("/v1/qa", json=big)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"
    assert "2,000" in r.json()["error"]["message"]
    assert c.post("/v1/hook-score", json={"lands_ms": 5}).status_code == 200


def test_unhandled_errors_do_not_leak_internals(client: TestClient, app, monkeypatch: pytest.MonkeyPatch) -> None:
    import flowd_ml.api.routes as routes

    def boom(body):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(routes, "score_hook", boom)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/v1/hook-score", json={})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert "secret internal detail" not in r.text
    assert r.json()["error"]["request_id"]


def test_adapter_failures_map_to_502(app, monkeypatch: pytest.MonkeyPatch) -> None:
    from flowd_ml.video.pipeline import PipelineError

    state = app.state.ml

    def fail(req):
        raise PipelineError("transcribe", "gpu out of memory")

    monkeypatch.setattr(state.pipeline, "analyze", fail)
    r = TestClient(app).post("/v1/analyze-video", json={"video": {"uri": "fake://strong_screen_reaction"}})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "adapter_failed"
    assert r.json()["error"]["details"] == [{"stage": "transcribe"}]


# ── OpenAPI ─────────────────────────────────────────────────────────────────────────────────────
def test_openapi_documents_every_route_security_and_examples(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    assert spec["openapi"].startswith("3.")
    assert spec["info"]["version"] == "1.0.0"
    assert spec["info"]["x-contract-version"] == "1.0.0"
    expected = {
        "/v1/hook-score",
        "/v1/flow-score",
        "/v1/qa",
        "/v1/fraud",
        "/v1/match",
        "/v1/suggest-cpm",
        "/v1/analyze-video",
        "/v1/phash/compare",
        "/v1/phash/duplicates",
        "/v1/phash/from-frames",
        "/v1/fatigue",
        "/v1/calibration/report",
        "/v1/embed",
        "/v1/models",
        "/v1/meta",
        "/healthz",
        "/readyz",
    }
    assert expected <= set(spec["paths"])
    assert spec["components"]["securitySchemes"]["bearerAuth"]["scheme"] == "bearer"
    assert all(
        op.get("security") == [{"bearerAuth": []}]
        for path, ops in spec["paths"].items()
        if path.startswith("/v1")
        for op in ops.values()
    )
    assert "security" not in spec["paths"]["/healthz"]["get"]
    for model in (
        "HookScoreRequest",
        "FlowScoreRequest",
        "QaRequest",
        "FraudRequest",
        "MatchRequest",
        "SuggestCpmRequest",
        "AnalyzeVideoRequest",
    ):
        assert spec["components"]["schemas"][model]["examples"], model
    post = spec["paths"]["/v1/hook-score"]["post"]
    assert {"401", "413", "422", "200"} <= set(post["responses"])
    assert post["summary"]
    assert "scores" in post["tags"]


def test_committed_openapi_file_is_up_to_date() -> None:
    committed = (ROOT / "openapi.json").read_text(encoding="utf-8")
    fresh = (
        json.dumps(
            create_app(Settings(env="test", fixed_now="2026-10-03T14:00:00Z")).openapi(), indent=2, ensure_ascii=False
        )
        + "\n"
    )
    assert committed == fresh, "run: python scripts/export_openapi.py"


def test_every_response_model_field_is_documented_with_a_schema(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    for name in (
        "HookScoreResponse",
        "QaResponse",
        "FraudResponse",
        "MatchResponse",
        "PriceSuggestion",
        "AnalyzeVideoResponse",
        "CalibrationReport",
        "FatigueResponse",
    ):
        props = schemas[name]["properties"]
        assert {"model", "reasons"} <= set(props) or name in ("MatchResponse",), name
    assert "reasons" in schemas["MatchResult"]["properties"]


def test_docs_page_lists_the_service(client: TestClient) -> None:
    html = client.get("/docs").text
    assert "swagger" in html.lower()
    assert "flowd ML service" in html


def test_package_layout_sanity() -> None:
    root = Path(__file__).resolve().parents[1]
    for rel in ("pyproject.toml", "Dockerfile", "modal_app.py", "README.md", "openapi.json", "src/flowd_ml/py.typed"):
        assert (root / rel).exists(), rel
