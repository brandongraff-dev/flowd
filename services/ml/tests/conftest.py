"""Shared fixtures."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from flowd_ml.api.app import create_app
from flowd_ml.settings import Settings
from helpers import NOW, ROOT


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(env="test", fixed_now=NOW, model_dir=ROOT / "no-such-models")


@pytest.fixture(scope="session")
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture(scope="session")
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def secured_client() -> TestClient:
    return TestClient(
        create_app(Settings(env="test", api_key="s3cret-test-key", fixed_now=NOW, model_dir=ROOT / "no-such-models"))
    )
