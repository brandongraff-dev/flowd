"""Build the adapter set the settings ask for."""

from __future__ import annotations

from ..settings import Settings
from .adapters.base import AdapterSet
from .adapters.fake import fake_adapters
from .adapters.real import real_adapters


def build_adapters(settings: Settings) -> AdapterSet:
    """``fake`` is the default and needs nothing. ``real`` constructs the adapters without loading any model."""
    if settings.adapters == "real":
        return real_adapters(settings.vlm_model, settings.whisper_model, settings.embedder, settings.embedder_model)
    return fake_adapters(settings.embedding_dim)
