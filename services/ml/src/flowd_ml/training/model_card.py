"""Model card writer: one Markdown + JSON card per trained scorer, honest about data, limits and the promotion decision."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..constants import CHECKLIST_LABEL, LEARNED_READY_AT_POSTS
from .schema import FEATURE_LABELS, FEATURE_NAMES, MONOTONE
from .trainer import TrainingResult

_DECISION_TEXT = {
    "keep_heuristic": "Keep the checklist score live. The learned model is not shipped.",
    "shadow": "Run the learned model in shadow beside the checklist (computed, logged, never shown to users) and re-test as more posts settle.",
    "promote": "Promote the learned model: show its band, keep the checklist reasons as the explanation layer.",
}


def card_data(result: TrainingResult, *, name: str = "creative-scorer", now: datetime | None = None) -> dict[str, Any]:
    ts = (now or datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "model_card_version": 1,
        "name": name,
        "version": result.scorer.version,
        "created_at": ts,
        "synthetic_data": result.synthetic,
        "stage_after_decision": {"keep_heuristic": "heuristic", "shadow": "shadow", "promote": "learned"}[
            result.decision.decision
        ],
        "intended_use": (
            "Rank app-UGC videos by predicted views lift versus the creator's own median before they post, and explain why. "
            "Output is a band (A to E) with reasons, never a bare number and never a promise."
        ),
        "out_of_scope": [
            "Judging people: the model sees a video's observable structure, not who made it.",
            "Setting pay: pay is per verified view; the band only informs the estimate shown to creators.",
            "Approving or rejecting videos: that stays a human decision with a reason code.",
        ],
        "outcome": result.config.outcome,
        "training_data": result.summary.as_dict(),
        "split": {
            "train_posts": result.n_train,
            "validation_posts": result.n_valid,
            "test_posts": result.n_test,
            "test_apps": result.test_apps,
            "method": "group split by app; test apps never seen in training",
        },
        "features": [{"name": f, "label": FEATURE_LABELS[f], "monotone": MONOTONE[f]} for f in FEATURE_NAMES],
        "hyperparameters": asdict(result.config),
        "best_iteration": result.best_iteration,
        "evaluation": {
            "learned": result.learned.as_dict(),
            "checklist": result.heuristic.as_dict(),
            "decision": result.decision.as_dict(),
        },
        "feature_importance": result.importance,
        "label_shown_to_users": CHECKLIST_LABEL,
        "limitations": [
            "Trained on settled posts only: videos that never got posted, or got rejected, are invisible to it.",
            "Views depend on the platform's recommender, which flowd does not control; the band moves the odds, not the outcome.",
            f"Below {LEARNED_READY_AT_POSTS:,} settled posts the checklist is the product; this model is compared, not trusted.",
            "Observation extraction (transcript, frames) can be wrong; the scorer inherits those errors.",
        ],
        "fairness": [
            "No creator attributes (age, gender, location, follower tier) are inputs, only the video's structure and the creator's own median views as a baseline.",
            "Multi-brand creators are never penalised; the target is lift against the creator's own norm.",
            "Posts under fraud review or clawed back are excluded from training.",
        ],
    }


def render_markdown(data: dict[str, Any]) -> str:
    ev = data["evaluation"]
    learned, check, dec = ev["learned"], ev["checklist"], ev["decision"]
    lines: list[str] = []
    a = lines.append
    a(f"# Model card: {data['name']} {data['version']}")
    a("")
    if data["synthetic_data"]:
        a(
            "> **Synthetic data.** This model was trained on generated posts for a dry run. Do not use or cite its numbers."
        )
        a("")
    a(
        f'Created {data["created_at"]}. Outcome predicted: `{data["outcome"]}`. Label shown to users: "{data["label_shown_to_users"]}"'
    )
    a("")
    a("## Decision")
    a("")
    a(f"**{dec['decision'].replace('_', ' ')}.** {_DECISION_TEXT[dec['decision']]}")
    a("")
    for r in dec["reasons"]:
        a(f"- {r}")
    a("")
    a("## Intended use")
    a("")
    a(data["intended_use"])
    a("")
    a("Out of scope:")
    for x in data["out_of_scope"]:
        a(f"- {x}")
    a("")
    a("## Training data")
    a("")
    td = data["training_data"]
    a(
        f"- {td['n_used']:,} usable posts from {td['n_apps']} apps (of {td['n_rows']:,} exported). Window: {td['first_posted_at'] or 'n/a'} to {td['last_posted_at'] or 'n/a'}."
    )
    if td["dropped"]:
        a("- Dropped: " + ", ".join(f"{k.replace('_', ' ')} {v:,}" for k, v in td["dropped"].items()) + ".")
    a(
        "- Per-app centred target; split by app: "
        + f"{data['split']['train_posts']:,} train, {data['split']['validation_posts']:,} validation, {data['split']['test_posts']:,} test posts. Test apps: {', '.join(data['split']['test_apps'])}."
    )
    a("")
    a("## Held-out evaluation")
    a("")
    a("| Scorer | Mean within-app Spearman | Top-fifth lift (ln) | Bands monotone | Apps | Posts |")
    a("|---|---|---|---|---|---|")
    for s in (learned, check):
        a(
            f"| {s['name']} | {s['mean_spearman']:.2f} | {s['top_band_lift_ln']:+.2f} | {'yes' if s['monotone_bands'] else 'no'} | {s['n_apps']} | {s['n_posts']:,} |"
        )
    a("")
    a(
        f"Difference (learned minus checklist): {dec['spearman_diff']:+.2f}, 95% app-bootstrap interval {dec['ci95'][0]:+.2f} to {dec['ci95'][1]:+.2f}."
    )
    a("")
    a("### Calibration of the learned bands")
    a("")
    a("| Band | Posts | Median views | Median lift vs creator's norm | Trial rate |")
    a("|---|---|---|---|---|")
    for b in learned["bins"]:
        a(
            f"| {b['band']} | {b['count']:,} | {b['median_views']:,} | {b['median_lift_multiple']:.2f}x | {b['trial_rate']:.1%} |"
        )
    a("")
    a("## Features")
    a("")
    a("| Feature | Meaning | Constraint | Importance (gain share) |")
    a("|---|---|---|---|")
    imp = data["feature_importance"]
    for f in data["features"]:
        c = {1: "more is better", -1: "less is better", 0: "none"}[f["monotone"]]
        a(f"| `{f['name']}` | {f['label']} | {c} | {imp.get(f['name'], 0):.2f} |")
    a("")
    a("## Limitations")
    a("")
    for x in data["limitations"]:
        a(f"- {x}")
    a("")
    a("## Fairness and responsible use")
    a("")
    for x in data["fairness"]:
        a(f"- {x}")
    a("")
    return "\n".join(lines)


def write_model_card(
    result: TrainingResult, out_dir: str | Path, *, name: str = "creative-scorer", now: datetime | None = None
) -> tuple[Path, Path]:
    """Write ``MODEL_CARD.md`` and ``model_card.json`` next to the model artifacts."""
    d = Path(out_dir)
    d.mkdir(parents=True, exist_ok=True)
    data = card_data(result, name=name, now=now)
    md, js = d / "MODEL_CARD.md", d / "model_card.json"
    md.write_text(render_markdown(data), encoding="utf-8")
    js.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    return md, js
