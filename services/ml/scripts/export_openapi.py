"""Write ``services/ml/openapi.json`` from the live app (same as ``flowd-ml openapi``). Run after changing any route or schema.

python scripts/export_openapi.py            # writes ../openapi.json next to pyproject.toml
python scripts/export_openapi.py --check    # exit 1 if the committed file is stale (CI)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flowd_ml.api.app import create_app  # noqa: E402
from flowd_ml.settings import Settings  # noqa: E402


def render() -> str:
    schema = create_app(Settings(env="test", fixed_now="2026-10-03T14:00:00Z")).openapi()
    return json.dumps(schema, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "openapi.json"))
    args = ap.parse_args()
    text = render()
    out = Path(args.out)
    if args.check:
        if not out.exists() or out.read_text(encoding="utf-8") != text:
            print(f"{out} is stale: run python scripts/export_openapi.py", file=sys.stderr)
            return 1
        print("openapi.json is up to date")
        return 0
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {out} ({len(text):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
