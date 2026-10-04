"""The committed golden vectors: format, freshness, and replay."""

from __future__ import annotations

import json

import pytest

from flowd_ml import vectors
from helpers import VECTOR_DIR, assert_subset, load_vectors, subset_diff

SUITES = sorted(p.stem for p in VECTOR_DIR.glob("*.json"))


def test_every_builder_has_a_committed_file_and_vice_versa() -> None:
    assert set(SUITES) == set(vectors.BUILDERS)
    assert (VECTOR_DIR / "README.md").exists()


@pytest.mark.parametrize("suite", sorted(vectors.BUILDERS))
def test_committed_vectors_match_the_code(suite: str) -> None:
    fresh = vectors.render(json.loads(json.dumps(vectors.BUILDERS[suite]())))
    assert (VECTOR_DIR / f"{suite}.json").read_text(encoding="utf-8") == fresh, (
        f"stale {suite}.json: run python scripts/export_vectors.py"
    )


def test_readme_is_current() -> None:
    suites = vectors.build_all()
    assert (VECTOR_DIR / "README.md").read_text(encoding="utf-8") == vectors.readme_text(suites)


@pytest.mark.parametrize("suite", SUITES)
def test_vector_file_format(suite: str) -> None:
    v = load_vectors(suite)
    assert v["schema"] == "flowd.testvectors/1"
    assert v["suite"] == suite
    assert v["contract_version"] == "1.0.0"
    assert v["parity"] in ("required", "reference")
    assert v["description"]
    assert v["compare"]["numbers"] == "exact"
    assert v["generated_by"].startswith("services/ml/scripts/export_vectors.py")
    ids = [c["id"] for c in v["cases"]]
    assert ids, "there is at least one case"
    assert len(ids) == len(set(ids)), "case ids are unique"
    for c in v["cases"]:
        assert set(c) == {"id", "description", "in", "out"}, c["id"]
        assert c["description"], c["id"]
    assert "endpoint" in v or "function" in v or suite in ("beats", "hook_type")


def test_there_are_enough_cases_and_the_required_suites_are_the_formulas() -> None:
    total = sum(len(load_vectors(s)["cases"]) for s in SUITES)
    assert total >= 300
    required = {s for s in SUITES if load_vectors(s)["parity"] == "required"}
    assert required == {
        "rounding",
        "bands",
        "hook_score",
        "flow_score",
        "fraud_compose",
        "match_score",
        "price_curve",
        "fill_time",
        "funding",
        "first_bounty_funding",
        "all_in_cpm",
        "expected_earnings",
        "phash",
    }


def test_no_vector_contains_floats_that_json_would_lose() -> None:
    def walk(x):
        if isinstance(x, float):
            assert x == float(repr(x))
            assert x == x
            assert abs(x) != float("inf")
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for s in SUITES:
        walk(load_vectors(s))


def test_subset_matcher_semantics() -> None:
    assert subset_diff({"a": 1}, {"a": 1, "b": 2}) is None
    assert "missing" in subset_diff({"a": 1}, {"b": 1})
    assert subset_diff([{"a": 1}], [{"a": 1, "z": 0}]) is None
    assert "list of 2" in subset_diff([1, 2], [1])
    assert subset_diff(None, None) is None
    assert "expected null" in subset_diff(None, 0)
    assert subset_diff(True, True) is None
    assert subset_diff(True, 1) is not None  # booleans are not numbers
    assert subset_diff(1, 1.0) is None
    assert subset_diff(0.1, 0.1) is None
    assert subset_diff(1, 2) is not None
    assert_subset({"x": [1, {"y": None}]}, {"x": [1, {"y": None, "w": 5}], "extra": True})
    with pytest.raises(AssertionError):
        assert_subset({"x": 1}, {"x": 2})


def test_hook_vectors_cover_every_boundary_of_every_item() -> None:
    cases = {c["id"] for c in load_vectors("hook_score")["cases"]}
    for needle in (
        "lands_2000_full",
        "lands_2001_half",
        "lands_3000_half",
        "lands_3001_zero",
        "face_1000_full",
        "face_1001_half",
        "app_3000_full",
        "app_5001_zero",
        "interrupt_1500_full",
        "interrupt_1501_zero",
        "speech_1000_full",
        "speech_2001_zero",
        "faceless_no_face_full",
        "hook_type_unknown_but_flag",
    ):
        assert needle in cases


def test_flow_vectors_pin_the_javascript_rounding_edge_cases() -> None:
    by = {c["id"]: c for c in load_vectors("flow_score")["cases"]}
    beats = next(i for i in by["beats_1_of_2_half_up"]["out"]["items"] if i["id"] == "required_beats")
    assert beats["points"] == 13  # 12.5 rounds UP, banker's rounding would give 12
    hook = next(i for i in by["hook_35_rounds_up"]["out"]["items"] if i["id"] == "hook_score")
    assert hook["points"] == 11  # 10.5 -> 11
    length = next(i for i in by["length_reason_rounds_half_up"]["out"]["items"] if i["id"] == "length_ok")
    assert length["reason"] == "Length 25s."  # toFixed(0) of 24.5
