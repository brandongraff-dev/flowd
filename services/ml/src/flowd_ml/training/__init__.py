"""Learned-scorer training: settled-post export, LightGBM trainer, held-out-app evaluation, model card."""

from .dataset import read_rows, write_rows
from .model_card import write_model_card
from .synthetic import generate_settled_posts
from .trainer import LearnedScorer, TrainConfig, TrainingError, TrainingResult, train_scorer

__all__ = [
    "LearnedScorer",
    "TrainConfig",
    "TrainingError",
    "TrainingResult",
    "generate_settled_posts",
    "read_rows",
    "train_scorer",
    "write_model_card",
    "write_rows",
]
