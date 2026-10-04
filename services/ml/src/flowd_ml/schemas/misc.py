"""Perceptual-hash, embedding, health and registry models."""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from .common import ApiModel, KnownHash, ModelKind, ModelStage, ResponseModel

HEX16 = r"^[0-9a-fA-F]{16}$"


class PhashCompareRequest(ApiModel):
    a: str = Field(pattern=HEX16)
    b: str = Field(pattern=HEX16)
    max_distance: int = Field(
        default=6, ge=0, le=64, description="Duplicate threshold (contract: fraud.duplicate_phash_max_distance = 6)."
    )

    model_config = ConfigDict(json_schema_extra={"examples": [{"a": "bf2183365fb6e014", "b": "bf2183365fb6e016"}]})


class PhashCompareResponse(ResponseModel):
    distance: int = Field(description="Hamming distance in bits, 0..64.")
    similarity: float = Field(description="1 - distance / 64.")
    duplicate: bool
    max_distance: int
    explanation: str


class PhashDuplicatesRequest(ApiModel):
    phash: str = Field(pattern=HEX16)
    known: list[KnownHash] = Field(max_length=100_000)
    max_distance: int = Field(default=6, ge=0, le=64)
    exclude_id: str | None = Field(default=None, description="Skip this id (the submission being checked).")
    limit: int = Field(default=20, ge=1, le=200)


class PhashMatch(ResponseModel):
    id: str
    distance: int
    kind: Literal["other_creator", "own_earlier"]
    creator_id: str | None = None


class PhashDuplicatesResponse(ResponseModel):
    duplicate: bool
    closest: PhashMatch | None = None
    matches: list[PhashMatch]
    checked: int
    explanation: str


class GrayFrame(ApiModel):
    width: int = Field(ge=8, le=512)
    height: int = Field(ge=8, le=512)
    gray_b64: str = Field(description="Raw 8-bit grayscale, row-major, base64.", max_length=400_000)


class PhashFramesRequest(ApiModel):
    frames: list[GrayFrame] = Field(min_length=1, max_length=64)


class PhashFramesResponse(ResponseModel):
    phash: str = Field(description="Majority vote of the frame hashes: the video fingerprint.")
    frame_hashes: list[str]
    algorithm: str = "dct64: grayscale -> 32x32 area average -> 2D DCT-II -> 8x8 low band -> bit = coefficient > median -> majority across frames"


class EmbedRequest(ApiModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class EmbedResponse(ResponseModel):
    provider: str
    dim: int
    vectors: list[list[float]]


class HealthResponse(ResponseModel):
    status: Literal["ok"] = "ok"
    service: str = "flowd-ml"
    version: str


class ReadyResponse(ResponseModel):
    status: Literal["ready"] = "ready"
    adapters: dict[str, str]
    stage: Literal["fake", "real"]
    auth: Literal["required", "open"]


class ModelStatus(ResponseModel):
    """One of the eight ML systems and how it runs right now (the admin ML page reads the same shape from the backend)."""

    id: str
    kind: ModelKind
    name: str
    version: str
    stage: ModelStage
    description: str
    endpoints: list[str]
    approach: str = Field(description="What runs today.")
    next_stage: str = Field(description="What replaces it once settled posts exist.")
    explainable: bool = True
    trained_on_n: int = 0
    learned_ready_at_posts: int = 1000
    label: str | None = Field(
        default=None, description="The honest user-facing label for this stage, when one is required."
    )


class MetaResponse(ResponseModel):
    service: str
    version: str
    contract_version: str
    env: str
    adapters: dict[str, str]
    stage: Literal["fake", "real"]
    models: list[ModelStatus]
    now: str
