"""``flowd-ml``: serve the API, export the OpenAPI document and golden vectors, and run the training / calibration jobs.

flowd-ml serve --port 8080
flowd-ml openapi --out openapi.json
flowd-ml vectors                     # writes packages/contract/testvectors/ml/*.json
flowd-ml synth  --out data/synthetic_settled_posts.jsonl --n 1500
flowd-ml train  --export data/settled_posts.jsonl --out models/creative_scorer
flowd-ml calibrate --export data/settled_posts.jsonl --out reports/
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .version import SERVICE_VERSION


def _cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("flowd_ml.main:app", host=args.host, port=args.port, reload=args.reload, log_level=args.log_level)
    return 0


def _cmd_openapi(args: argparse.Namespace) -> int:
    from .api.app import create_app
    from .settings import Settings

    schema = create_app(Settings(env="test", fixed_now="2026-10-03T14:00:00Z")).openapi()
    text = json.dumps(schema, indent=2, ensure_ascii=False) + "\n"
    if args.out == "-":
        sys.stdout.write(text)
    else:
        Path(args.out).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.out}")
    return 0


def _cmd_vectors(args: argparse.Namespace) -> int:
    from .vectors import write_all

    paths = write_all(args.out)
    print(f"wrote {len(paths)} files to {paths[0].parent}")
    return 0


def _cmd_synth(args: argparse.Namespace) -> int:
    from .training.dataset import write_rows
    from .training.synthetic import generate_settled_posts

    n = write_rows(generate_settled_posts(args.n, args.apps, args.seed), args.out)
    print(f"wrote {n} SYNTHETIC settled posts to {args.out} (never train a shipped model on this)")
    return 0


def _cmd_train(args: argparse.Namespace) -> int:
    from .training.dataset import read_rows
    from .training.model_card import write_model_card
    from .training.trainer import TrainConfig, TrainingError, train_scorer

    try:
        rows = read_rows(args.export)
        result = train_scorer(rows, TrainConfig(outcome=args.outcome, seed=args.seed), synthetic=args.synthetic)
    except (TrainingError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    out = Path(args.out)
    result.scorer.save(out)
    md, _ = write_model_card(result, out)
    (out / "evaluation.json").write_text(json.dumps(result.as_dict(), indent=2, sort_keys=True), encoding="utf-8")
    d = result.decision
    print(f"decision: {d.decision}")
    for r in d.reasons:
        print(f"  - {r}")
    print(f"model + card written to {out} ({md.name})")
    return 0


def _cmd_calibrate(args: argparse.Namespace) -> int:
    from .calibration.report import build_report, render_markdown
    from .schemas.calibration import CalibrationPost, CalibrationRequest
    from .training.dataset import read_rows

    rows = read_rows(args.export)
    posts = [
        CalibrationPost(
            post_id=r.post_id,
            app_id=r.app_id,
            predicted_band=r.flow_band,
            predicted_points=r.flow_points,
            window_views=r.window_views,
            installs=r.installs,
            trials=r.trials,
            creator_median_views_28d=r.creator_median_views_28d,
        )
        for r in rows
        if not r.clawed_back
    ]
    report = build_report(CalibrationRequest(model_name="creative-scorer", model_stage="heuristic", posts=posts))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "calibration.json").write_text(report.model_dump_json(indent=2), encoding="utf-8")
    (out / "calibration.md").write_text(render_markdown(report), encoding="utf-8")
    print(report.summary)
    print(f"report written to {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="flowd-ml", description="flowd ML service tools")
    p.add_argument("--version", action="version", version=f"flowd-ml {SERVICE_VERSION}")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("serve", help="run the API with uvicorn")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8080)
    s.add_argument("--reload", action="store_true")
    s.add_argument("--log-level", default="info")
    s.set_defaults(func=_cmd_serve)

    s = sub.add_parser("openapi", help="export the OpenAPI document")
    s.add_argument("--out", default="openapi.json", help="path, or - for stdout")
    s.set_defaults(func=_cmd_openapi)

    s = sub.add_parser("vectors", help="write the golden test vectors")
    s.add_argument("--out", default=None, help="default: packages/contract/testvectors/ml")
    s.set_defaults(func=_cmd_vectors)

    s = sub.add_parser("synth", help="write a synthetic settled-post export (dry runs only)")
    s.add_argument("--out", required=True)
    s.add_argument("--n", type=int, default=1500)
    s.add_argument("--apps", type=int, default=14)
    s.add_argument("--seed", type=int, default=7)
    s.set_defaults(func=_cmd_synth)

    s = sub.add_parser(
        "train", help="train the LightGBM creative scorer, evaluate on held-out apps, write the model card"
    )
    s.add_argument("--export", required=True, help="settled-post export (.jsonl or .csv)")
    s.add_argument("--out", required=True, help="output directory for the model, evaluation and MODEL_CARD.md")
    s.add_argument("--outcome", choices=["views_lift", "installs_per_1k"], default="views_lift")
    s.add_argument("--seed", type=int, default=7)
    s.add_argument("--synthetic", action="store_true", help="mark the artifact as trained on synthetic data")
    s.set_defaults(func=_cmd_train)

    s = sub.add_parser("calibrate", help="calibration report of the checklist bands recorded in an export")
    s.add_argument("--export", required=True)
    s.add_argument("--out", required=True)
    s.set_defaults(func=_cmd_calibrate)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
