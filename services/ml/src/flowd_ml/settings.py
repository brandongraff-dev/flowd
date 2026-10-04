"""Runtime settings, from ``ML_*`` environment variables (and an optional ``.env`` file in dev)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    api_key: SecretStr | None = Field(
        default=None, description="Bearer token the flowd backend sends. Required when ML_ENV=prod."
    )
    adapters: Literal["fake", "real"] = Field(
        default="fake", description="fake: deterministic, zero GPU. real: Whisper, PySceneDetect, Claude VLM, SigLIP."
    )
    embedding_dim: int = Field(default=256, ge=16, le=4096, description="Dimension of the fake (hashing) embedder.")
    embedder: Literal["siglip", "clip"] = "siglip"
    embedder_model: str | None = None
    whisper_model: str = "large-v3"
    vlm_model: str = "claude-sonnet-5-5"
    fixed_now: str | None = Field(
        default=None, description="Pin 'now' (ISO-8601 UTC), e.g. the demo world's 2026-10-03T14:00:00Z."
    )
    model_dir: Path = Path("models")
    max_body_bytes: int = Field(
        default=16_000_000, ge=1024, description="Requests larger than this are rejected with 413."
    )
    allow_scenario_uris: bool = Field(
        default=True, description="Allow fake:// scenario URIs. Forced off when adapters=real."
    )

    @model_validator(mode="after")
    def _prod_needs_auth(self) -> Settings:
        if self.env == "prod" and self.api_key is None:
            raise ValueError("ML_API_KEY is required when ML_ENV=prod (the service fails closed)")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
