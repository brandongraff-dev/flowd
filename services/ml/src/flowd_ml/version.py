"""Versions. ``MODEL_VERSION`` changes whenever a heuristic's behaviour changes, so stored scores stay explainable."""

SERVICE_VERSION = "1.0.0"
CONTRACT_VERSION = "1.0.0"

# One version per model so a change to one heuristic never silently re-labels the others.
MODEL_VERSIONS: dict[str, str] = {
    "hook_score": "heuristic-1.0.0",
    "flow_score": "heuristic-1.0.0",
    "qa": "rules-1.0.0",
    "fraud": "rules-1.0.0",
    "match": "rules+embeddings-1.0.0",
    "suggest_cpm": "heuristic-1.0.0",
    "video": "pipeline-1.0.0",
    "fatigue": "rule-1.0.0",
    "phash": "dct64-1.0.0",
    "calibration": "report-1.0.0",
}
