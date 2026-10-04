"""The /v1 routes. Each is a thin wrapper: validate, call the model, return its explained response."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, HTTPException, Request

from ..calibration.report import build_report
from ..constants import DUPLICATE_PHASH_MAX_DISTANCE
from ..fatigue.detect import detect_fatigue
from ..fraud.engine import score_fraud
from ..matching.rank import rank_bounties
from ..phash.core import hamming_hex, phash_gray, to_hex, video_phash
from ..phash.index import PerceptualHashIndex
from ..pricing.suggest import suggest_cpm
from ..qa.engine import run_qa
from ..registry import model_statuses
from ..schemas.calibration import CalibrationReport, CalibrationRequest
from ..schemas.fatigue import FatigueRequest, FatigueResponse
from ..schemas.fraud import FraudRequest, FraudResponse
from ..schemas.matching import MatchRequest, MatchResponse
from ..schemas.misc import (
    EmbedRequest,
    EmbedResponse,
    MetaResponse,
    ModelStatus,
    PhashCompareRequest,
    PhashCompareResponse,
    PhashDuplicatesRequest,
    PhashDuplicatesResponse,
    PhashFramesRequest,
    PhashFramesResponse,
    PhashMatch,
)
from ..schemas.pricing import PriceSuggestion, SuggestCpmRequest
from ..schemas.qa import QaRequest, QaResponse
from ..schemas.scores import FlowScoreRequest, FlowScoreResponse, HookScoreRequest, HookScoreResponse
from ..schemas.video import AnalyzeVideoRequest, AnalyzeVideoResponse
from ..scoring.flow import score_flow
from ..scoring.hook import score_hook
from ..training.shadow import shadow_prediction
from ..version import CONTRACT_VERSION, SERVICE_VERSION
from ..video.adapters.base import AdapterUnavailableError
from .errors import ErrorResponse
from .state import ml_state

ERRORS: dict[int | str, dict[str, object]] = {
    401: {"model": ErrorResponse, "description": "Missing or wrong bearer token."},
    413: {"model": ErrorResponse, "description": "Request body too large."},
    422: {"model": ErrorResponse, "description": "The request does not match the schema. The message names the field."},
}


router = APIRouter(prefix="/v1", responses=ERRORS)


# ── scores ────────────────────────────────────────────────────────────────────────────────────────
@router.post(
    "/hook-score",
    response_model=HookScoreResponse,
    tags=["scores"],
    summary="Hook Score: the first 3 seconds, as a checklist with reasons and fixes",
)
def hook_score(body: HookScoreRequest) -> HookScoreResponse:
    return score_hook(body)


@router.post(
    "/flow-score",
    response_model=FlowScoreResponse,
    tags=["scores"],
    summary="Flow Score: the whole video, as a band with reasons and fixes",
)
def flow_score(body: FlowScoreRequest, request: Request) -> FlowScoreResponse:
    response = score_flow(body)
    scorer = ml_state(request).learned_scorer
    if scorer is not None:
        response.shadow = shadow_prediction(scorer, body)
    return response


# ── QA, fraud, duplicates ────────────────────────────────────────────────────────────────────────
@router.post(
    "/qa",
    response_model=QaResponse,
    tags=["trust"],
    summary="Auto-QA: transcript + brief + hashes to pass, warnings and flags",
)
def qa(body: QaRequest) -> QaResponse:
    return run_qa(body)


@router.post(
    "/fraud",
    response_model=FraudResponse,
    tags=["trust"],
    summary="View-fraud score from the view curve and account history, with the evidence behind every signal",
)
def fraud(body: FraudRequest) -> FraudResponse:
    return score_fraud(body)


@router.post(
    "/phash/compare",
    response_model=PhashCompareResponse,
    tags=["trust"],
    summary="Hamming distance between two perceptual hashes",
)
def phash_compare(body: PhashCompareRequest) -> PhashCompareResponse:
    d = hamming_hex(body.a, body.b)
    dup = d <= body.max_distance
    return PhashCompareResponse(
        distance=d,
        similarity=round(1 - d / 64, 4),
        duplicate=dup,
        max_distance=body.max_distance,
        explanation=f"{d} of 64 bits differ; videos within {body.max_distance} bits count as duplicates."
        + (" These are duplicates." if dup else " These are different videos."),
    )


@router.post(
    "/phash/duplicates",
    response_model=PhashDuplicatesResponse,
    tags=["trust"],
    summary="Find earlier videos within a perceptual-hash distance",
)
def phash_duplicates(body: PhashDuplicatesRequest) -> PhashDuplicatesResponse:
    index = PerceptualHashIndex()
    meta = {}
    for k in body.known:
        if body.exclude_id and k.id == body.exclude_id:
            continue
        index.add(k.id, k.phash)
        meta[k.id] = k
    found = index.search(body.phash, body.max_distance)[: body.limit]
    matches = [PhashMatch(id=i, distance=d, kind=meta[i].kind, creator_id=meta[i].creator_id) for d, i in found]
    dup = bool(matches) and matches[0].distance <= DUPLICATE_PHASH_MAX_DISTANCE
    if matches:
        c = matches[0]
        explanation = f"Closest is {c.id} at {c.distance} of 64 bits" + (
            ": a duplicate." if dup else ", near but outside the duplicate line."
        )
    else:
        explanation = f"No video within {body.max_distance} bits across {len(meta):,} earlier videos."
    return PhashDuplicatesResponse(
        duplicate=dup,
        closest=matches[0] if matches else None,
        matches=matches,
        checked=len(meta),
        explanation=explanation,
    )


@router.post(
    "/phash/from-frames",
    response_model=PhashFramesResponse,
    tags=["trust"],
    summary="Perceptual hash of a video from grayscale keyframes",
)
def phash_from_frames(body: PhashFramesRequest) -> PhashFramesResponse:
    decoded: list[tuple[bytes, int, int]] = []
    for i, f in enumerate(body.frames):
        try:
            data = base64.b64decode(f.gray_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"frames[{i}].gray_b64 is not valid base64") from exc
        if len(data) != f.width * f.height:
            raise HTTPException(
                status_code=422,
                detail=f"frames[{i}]: expected {f.width * f.height} bytes for {f.width}x{f.height}, got {len(data)}",
            )
        decoded.append((data, f.width, f.height))
    return PhashFramesResponse(
        phash=video_phash(decoded), frame_hashes=[to_hex(phash_gray(d, w, h)) for d, w, h in decoded]
    )


# ── marketplace ──────────────────────────────────────────────────────────────────────────────────
@router.post(
    "/match",
    response_model=MatchResponse,
    tags=["marketplace"],
    summary="Rank open bounties for a creator: gates, five factors, embedding lift",
)
def match(body: MatchRequest, request: Request) -> MatchResponse:
    return rank_bounties(body, ml_state(request).adapters.embedder)


@router.post(
    "/suggest-cpm",
    response_model=PriceSuggestion,
    tags=["marketplace"],
    summary="Suggested CPM and the price-vs-fill-time curve with confidence",
)
def suggest(body: SuggestCpmRequest) -> PriceSuggestion:
    return suggest_cpm(body)


@router.post(
    "/fatigue",
    response_model=FatigueResponse,
    tags=["marketplace"],
    summary="Refresh alert: has a winner's rate fallen 30% from its peak?",
)
def fatigue(body: FatigueRequest) -> FatigueResponse:
    return detect_fatigue(body)


# ── video understanding ──────────────────────────────────────────────────────────────────────────
@router.post(
    "/analyze-video",
    response_model=AnalyzeVideoResponse,
    tags=["video"],
    summary="Analyse one submission version end to end (transcript, scenes, hook, QA, scores, tags, hash)",
)
def analyze_video(body: AnalyzeVideoRequest, request: Request) -> AnalyzeVideoResponse:
    ml = ml_state(request)
    if body.video.uri.startswith("fake://") and (not ml.settings.allow_scenario_uris or ml.settings.adapters == "real"):
        raise HTTPException(status_code=422, detail="fake:// scenario URIs are not accepted by this deployment")
    if ml.settings.env == "prod" and ml.pipeline.stage == "fake":
        raise AdapterUnavailableError(
            "analyze-video runs on the GPU deployment; this deployment has no real video adapters, and fake output must never answer for a real video."
        )
    return ml.pipeline.analyze(body)


@router.post(
    "/embed",
    response_model=EmbedResponse,
    tags=["video"],
    summary="Text embeddings from the configured provider (hashing-bow in dev, SigLIP/CLIP in production)",
)
def embed(body: EmbedRequest, request: Request) -> EmbedResponse:
    embedder = ml_state(request).adapters.embedder
    vectors = embedder.embed_texts(body.texts)
    return EmbedResponse(provider=embedder.name, dim=len(vectors[0]) if vectors else embedder.dim, vectors=vectors)


# ── monitoring ───────────────────────────────────────────────────────────────────────────────────
@router.post(
    "/calibration/report",
    response_model=CalibrationReport,
    tags=["monitoring"],
    summary="Calibration report: predicted band against realised results",
)
def calibration(body: CalibrationRequest) -> CalibrationReport:
    return build_report(body)


@router.get(
    "/models",
    response_model=list[ModelStatus],
    tags=["monitoring"],
    summary="The eight ML systems and the stage each runs at",
)
def models(request: Request) -> list[ModelStatus]:
    ml = ml_state(request)
    return model_statuses(
        "shadow" if ml.learned_scorer is not None else "heuristic", ml.learned_posts, ml.pipeline.stage
    )


@router.get("/meta", response_model=MetaResponse, tags=["monitoring"], summary="Service, contract and adapter versions")
def meta(request: Request) -> MetaResponse:
    ml = ml_state(request)
    return MetaResponse(
        service="flowd-ml",
        version=SERVICE_VERSION,
        contract_version=CONTRACT_VERSION,
        env=ml.settings.env,
        adapters=ml.adapters.names(),
        stage=ml.pipeline.stage,
        models=model_statuses(
            "shadow" if ml.learned_scorer is not None else "heuristic", ml.learned_posts, ml.pipeline.stage
        ),
        now=ml.clock(),
    )
