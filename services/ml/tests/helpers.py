"""Test helpers: vector loading, subset matching, the node reference runner."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
CONTRACT_SCHEMA = REPO / "packages" / "contract" / "schema"
VECTOR_DIR = REPO / "packages" / "contract" / "testvectors" / "ml"
NOW = "2026-10-03T14:00:00Z"


def subset_diff(expected: Any, actual: Any, path: str = "$") -> str | None:
    """None when ``expected`` is a subset of ``actual`` by the testvectors rules, else a description of the first mismatch."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return f"{path}: expected an object, got {type(actual).__name__}"
        for k, v in expected.items():
            if k not in actual:
                return f"{path}.{k}: missing"
            d = subset_diff(v, actual[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            return f"{path}: expected a list of {len(expected)}, got {actual if not isinstance(actual, list) else len(actual)}"
        for i, (e, a) in enumerate(zip(expected, actual, strict=True)):
            d = subset_diff(e, a, f"{path}[{i}]")
            if d:
                return d
        return None
    if expected is None:
        return None if actual is None else f"{path}: expected null, got {actual!r}"
    if isinstance(expected, bool) or isinstance(actual, bool):
        return None if expected is actual else f"{path}: expected {expected!r}, got {actual!r}"
    if isinstance(expected, int | float) and isinstance(actual, int | float):
        return None if expected == actual else f"{path}: expected {expected!r}, got {actual!r}"
    return None if expected == actual else f"{path}: expected {expected!r}, got {actual!r}"


def assert_subset(expected: Any, actual: Any) -> None:
    diff = subset_diff(expected, actual)
    assert diff is None, diff


def load_vectors(name: str) -> dict[str, Any]:
    return json.loads((VECTOR_DIR / f"{name}.json").read_text(encoding="utf-8"))


def contract_vectors() -> dict[str, Any] | None:
    p = REPO / "packages" / "contract" / "formula-vectors.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def run_node(payload: dict[str, Any]) -> Any:
    """Run the contract's JavaScript reference. Skips the test when node or the contract is unavailable."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")
    if not (CONTRACT_SCHEMA / "formulas.mjs").exists():
        pytest.skip("packages/contract/schema/formulas.mjs is not present")
    proc = subprocess.run(
        [node, str(ROOT / "tests" / "contract_reference.mjs"), str(CONTRACT_SCHEMA)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"node reference failed: {proc.stderr[-800:]}")
    return json.loads(proc.stdout)
