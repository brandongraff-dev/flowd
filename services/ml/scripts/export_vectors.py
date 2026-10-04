"""Write the golden test vectors to ``packages/contract/testvectors/ml/*.json`` (same as ``flowd-ml vectors``).

python scripts/export_vectors.py            # write
python scripts/export_vectors.py --check    # exit 1 if the committed files are stale (CI)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flowd_ml import vectors  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    out = Path(args.out) if args.out else vectors.DEFAULT_OUT
    if args.check:
        suites = vectors.build_all()
        stale = [
            n
            for n, s in suites.items()
            if not (out / f"{n}.json").exists() or (out / f"{n}.json").read_text(encoding="utf-8") != vectors.render(s)
        ]
        readme = out / "README.md"
        if not readme.exists() or readme.read_text(encoding="utf-8") != vectors.readme_text(suites):
            stale.append("README")
        if stale:
            print(
                "stale or missing vectors: " + ", ".join(stale) + " (run python scripts/export_vectors.py)",
                file=sys.stderr,
            )
            return 1
        print(f"{len(suites)} vector files are up to date")
        return 0
    paths = vectors.write_all(out)
    print(f"wrote {len(paths)} files to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
