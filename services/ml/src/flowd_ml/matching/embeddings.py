"""The embedding interface used by matching (and by video analysis for semantic tags).

Day one runs the dependency-free ``HashingEmbedder``: a signed feature-hashing bag of unigrams and bigrams, L2
normalised. It is deterministic, needs no GPU or download, and gives similar texts a higher cosine than unrelated ones,
which is all the matcher asks of it. In production the same ``EmbeddingProvider`` protocol is satisfied by the SigLIP /
CLIP adapters in ``flowd_ml.video.adapters.real``; vectors from different providers are never mixed (the provider name and
dimension travel with every vector).
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Sequence
from itertools import pairwise
from typing import Protocol, runtime_checkable

from ..text.normalize import tokens


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Anything that turns text into fixed-size unit vectors."""

    name: str
    dim: int

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]: ...


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity in -1..1 (0 for a zero vector or mismatched sizes)."""
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def l2_normalise(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v] if n else v


class HashingEmbedder:
    """Signed feature hashing of unigrams (weight 1) and bigrams (weight 0.5) into ``dim`` buckets."""

    name = "hashing-bow"

    def __init__(self, dim: int = 256) -> None:
        if dim < 16:
            raise ValueError("dim must be at least 16")
        self.dim = dim

    def _bucket(self, token: str) -> tuple[int, float]:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        n = int.from_bytes(digest, "big")
        return n % self.dim, 1.0 if (n >> 63) & 1 else -1.0

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            toks = tokens(text, drop_stop=True)
            for t in toks:
                i, sign = self._bucket(t)
                vec[i] += sign
            for a, b in pairwise(toks):
                i, sign = self._bucket(f"{a} {b}")
                vec[i] += 0.5 * sign
            out.append(l2_normalise(vec))
        return out
