"""Creator <-> bounty matching: gates, five explainable factors and an embedding interface (BLUEPRINT ML system 6)."""

from .embeddings import EmbeddingProvider, HashingEmbedder, cosine
from .rank import match_score, rank_bounties

__all__ = ["EmbeddingProvider", "HashingEmbedder", "cosine", "match_score", "rank_bounties"]
