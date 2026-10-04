"""Perceptual hashing: algorithm properties, the BK-tree index, golden vectors, HTTP endpoints."""

from __future__ import annotations

import base64
import random

import pytest

from flowd_ml.phash.core import (
    dct_low,
    from_hex,
    gray_matrix,
    hamming,
    hamming_hex,
    majority_hash,
    phash_bits,
    phash_gray,
    resize_area,
    to_hex,
    video_phash,
)
from flowd_ml.phash.index import PerceptualHashIndex, closest_match
from flowd_ml.schemas.common import KnownHash
from helpers import assert_subset, load_vectors


def img(w: int, h: int, f) -> bytes:
    return bytes(max(0, min(255, f(x, y))) for y in range(h) for x in range(w))


def scene(
    w: int, h: int, extra: int = 0, noise=None, ramp: str = "h", rect=(10, 12, 30, 40), circle=(44, 44, 10)
) -> bytes:
    def px(x: int, y: int) -> int:
        u, v = x * 64 // w, y * 64 // h
        value = 20 + (u if ramp == "h" else v) + extra
        if rect[0] <= u < rect[2] and rect[1] <= v < rect[3]:
            value += 60
        if (u - circle[0]) ** 2 + (v - circle[1]) ** 2 < circle[2] ** 2:
            value += 50
        return value + (noise() if noise else 0)

    return img(w, h, px)


GRAD = img(64, 64, lambda x, y: round(255 * x / 63))
CIRCLE = img(64, 64, lambda x, y: 255 if (x - 32) ** 2 + (y - 32) ** 2 < 18**2 else 30)
CHECKER = img(64, 64, lambda x, y: 255 if ((x // 8) + (y // 8)) % 2 == 0 else 0)


@pytest.mark.parametrize(
    "case", [c for c in load_vectors("phash")["cases"] if c["in"]["fn"] == "phash_gray"], ids=lambda c: c["id"]
)
def test_hash_vectors(case: dict) -> None:
    i = case["in"]
    assert to_hex(phash_gray(base64.b64decode(i["gray_b64"]), i["width"], i["height"])) == case["out"]["phash"]


@pytest.mark.parametrize(
    "case", [c for c in load_vectors("phash")["cases"] if c["in"]["fn"] == "hamming_hex"], ids=lambda c: c["id"]
)
def test_distance_vectors(case: dict) -> None:
    d = hamming_hex(case["in"]["a"], case["in"]["b"])
    assert_subset(case["out"], {"distance": d, "duplicate": d <= 6})


@pytest.mark.parametrize(
    "case", [c for c in load_vectors("phash")["cases"] if c["in"]["fn"] == "majority_hash"], ids=lambda c: c["id"]
)
def test_majority_vectors(case: dict) -> None:
    assert to_hex(majority_hash(int(h, 16) for h in case["in"]["hashes"])) == case["out"]["phash"]


def test_hash_is_64_bits_of_lowercase_hex() -> None:
    h = to_hex(phash_gray(GRAD, 64, 64))
    assert len(h) == 16
    assert h == h.lower()
    assert from_hex(h) < 2**64


def test_duplicates_survive_brightness_noise_and_rescaling() -> None:
    base = phash_gray(scene(64, 64), 64, 64)
    rng = random.Random(1)
    assert hamming(base, phash_gray(scene(64, 64, extra=25), 64, 64)) <= 6
    assert hamming(base, phash_gray(scene(64, 64, noise=lambda: rng.randint(-4, 4)), 64, 64)) <= 6
    assert hamming(base, phash_gray(scene(32, 32), 32, 32)) <= 6
    assert hamming(base, phash_gray(scene(96, 80), 96, 80)) <= 6  # a non-integer scale factor


def test_a_bare_gradient_hashes_deterministically_because_noise_level_coefficients_are_ties() -> None:
    """A pure ramp has ~1e-11 coefficients where theory says 0. They must not decide bits (TIE_EPSILON), or two implementations disagree."""
    h = phash_gray(GRAD, 64, 64)
    assert (
        h
        == phash_gray(img(64, 64, lambda x, y: round(255 * x / 63) + 25), 64, 64)
        == phash_gray(img(32, 32, lambda x, y: round(255 * x / 31)), 32, 32)
    )
    assert h == 1 << 63  # only the DC bit is set


def test_different_images_are_far_apart() -> None:
    a, b, c, d = (phash_gray(x, 64, 64) for x in (GRAD, CIRCLE, CHECKER, scene(64, 64)))
    pairs = [(a, b), (a, c), (b, c), (a, d), (b, d), (c, d)]
    assert min(hamming(x, y) for x, y in pairs) > 6


def test_hash_of_a_constant_image_is_stable_and_never_crashes() -> None:
    flat = phash_gray(bytes([128]) * 1024, 32, 32)
    assert flat == phash_gray(bytes([128]) * 4096, 64, 64)  # same content at any size
    assert phash_bits([[0.0]]) == phash_bits([[0.0]])  # a 1x1 image resizes up


def test_area_resize_is_exact_for_integer_ratios_and_preserves_the_mean() -> None:
    src = [[float((x + y) % 7) for x in range(64)] for y in range(64)]
    small = resize_area(src, 32)
    assert small[0][0] == (src[0][0] + src[0][1] + src[1][0] + src[1][1]) / 4
    odd = [[float(x * y % 13) for x in range(48)] for y in range(40)]
    out = resize_area(odd, 32)
    assert abs(sum(map(sum, out)) / 1024 - sum(map(sum, odd)) / (48 * 40)) < 1e-9
    with pytest.raises(ValueError, match="empty image"):
        resize_area([])


def test_dct_low_of_a_constant_block_has_only_the_dc_term() -> None:
    low = dct_low([[10.0] * 32 for _ in range(32)])
    assert low[0][0] == pytest.approx(10 * 32 * 32)
    assert all(abs(v) < 1e-9 for r, row in enumerate(low) for c, v in enumerate(row) if (r, c) != (0, 0))


def test_gray_matrix_and_hex_validation() -> None:
    assert gray_matrix(bytes(range(6)), 3, 2) == [[0.0, 1.0, 2.0], [3.0, 4.0, 5.0]]
    with pytest.raises(ValueError, match="expected 6 grayscale bytes"):
        gray_matrix(b"abc", 3, 2)
    with pytest.raises(ValueError, match="16 hex"):
        from_hex("abc")
    with pytest.raises(ValueError, match="no frame hashes"):
        majority_hash([])
    assert hamming_hex("0000000000000000", "ffffffffffffffff") == 64


def test_video_hash_is_robust_to_one_bad_frame() -> None:
    good = [(GRAD, 64, 64)] * 4
    bad = [(CHECKER, 64, 64)]
    assert video_phash(good) == video_phash([*good, *bad])


def test_bk_tree_matches_a_brute_force_scan() -> None:
    rng = random.Random(7)
    hashes = [rng.getrandbits(64) for _ in range(600)]
    index = PerceptualHashIndex()
    index.extend((f"sub_{i}", h) for i, h in enumerate(hashes))
    assert len(index) == 600
    for _ in range(25):
        q = hashes[rng.randrange(600)] ^ (1 << rng.randrange(64)) ^ (1 << rng.randrange(64))
        for radius in (0, 3, 6, 10):
            expected = sorted((hamming(q, h), f"sub_{i}") for i, h in enumerate(hashes) if hamming(q, h) <= radius)
            assert index.search(q, radius) == expected
    assert PerceptualHashIndex().search(0) == []


def test_bk_tree_groups_identical_hashes_and_accepts_hex() -> None:
    index = PerceptualHashIndex()
    index.add("a", "ffffffffffffffff")
    index.add("b", "ffffffffffffffff")
    index.add("c", "fffffffffffffffe")
    assert index.search("ffffffffffffffff", 0) == [(0, "a"), (0, "b")]
    assert index.search("ffffffffffffffff", 1) == [(0, "a"), (0, "b"), (1, "c")]


def test_closest_match_skips_the_excluded_id() -> None:
    known = [KnownHash(id="sub_1", phash="ffffffffffffffff"), KnownHash(id="sub_2", phash="fffffffffffffff0")]
    assert closest_match("ffffffffffffffff", known)[1].id == "sub_1"  # type: ignore[index]
    d, k = closest_match("ffffffffffffffff", known, exclude_id="sub_1")  # type: ignore[misc]
    assert (d, k.id) == (4, "sub_2")
    assert closest_match("ffffffffffffffff", [], None) is None


# ── HTTP ────────────────────────────────────────────────────────────────────────────────────────
def test_compare_endpoint(client) -> None:
    r = client.post("/v1/phash/compare", json={"a": "ffffffffffffffff", "b": "ffffffffffffff00"})
    assert r.status_code == 200
    body = r.json()
    assert body["distance"] == 8
    assert body["duplicate"] is False
    assert body["similarity"] == 0.875
    assert "8 of 64 bits" in body["explanation"]
    assert (
        client.post("/v1/phash/compare", json={"a": "ffffffffffffffff", "b": "ffffffffffffffff"}).json()["duplicate"]
        is True
    )
    assert (
        client.post(
            "/v1/phash/compare", json={"a": "ffffffffffffffff", "b": "ffffffffffffff00", "max_distance": 8}
        ).json()["duplicate"]
        is True
    )
    assert client.post("/v1/phash/compare", json={"a": "xyz", "b": "ffffffffffffffff"}).status_code == 422


def test_duplicates_endpoint(client) -> None:
    known = [
        {"id": "sub_1", "phash": "ffffffffffffffff", "creator_id": "cr_a"},
        {"id": "sub_2", "phash": "fffffffffffffff0", "kind": "own_earlier"},
        {"id": "sub_3", "phash": "0000000000000000"},
    ]
    r = client.post("/v1/phash/duplicates", json={"phash": "ffffffffffffffff", "known": known}).json()
    assert r["duplicate"] is True
    assert r["closest"]["id"] == "sub_1"
    assert r["closest"]["creator_id"] == "cr_a"
    assert [m["id"] for m in r["matches"]] == ["sub_1", "sub_2"]
    assert r["checked"] == 3
    excl = client.post(
        "/v1/phash/duplicates", json={"phash": "ffffffffffffffff", "known": known, "exclude_id": "sub_1"}
    ).json()
    assert excl["closest"]["id"] == "sub_2"
    assert excl["checked"] == 2
    none = client.post("/v1/phash/duplicates", json={"phash": "ffffffffffffffff", "known": known[2:]}).json()
    assert none["duplicate"] is False
    assert none["matches"] == []
    assert "No video within" in none["explanation"]
    near = client.post(
        "/v1/phash/duplicates",
        json={"phash": "ffffffffffffffff", "known": [{"id": "x", "phash": "ffffffffffffff80"}], "max_distance": 10},
    ).json()
    assert near["duplicate"] is False
    assert near["closest"]["distance"] == 7
    assert "outside the duplicate line" in near["explanation"]


def test_from_frames_endpoint_matches_the_library(client) -> None:
    frames = [
        {"width": 64, "height": 64, "gray_b64": base64.b64encode(GRAD).decode()},
        {"width": 64, "height": 64, "gray_b64": base64.b64encode(GRAD).decode()},
    ]
    r = client.post("/v1/phash/from-frames", json={"frames": frames})
    assert r.status_code == 200
    assert r.json()["phash"] == to_hex(phash_gray(GRAD, 64, 64))
    assert len(r.json()["frame_hashes"]) == 2
    assert "majority" in r.json()["algorithm"]


def test_from_frames_rejects_bad_payloads(client) -> None:
    ok = base64.b64encode(GRAD).decode()
    wrong_size = client.post("/v1/phash/from-frames", json={"frames": [{"width": 32, "height": 32, "gray_b64": ok}]})
    assert wrong_size.status_code == 422
    assert "expected 1024 bytes" in wrong_size.json()["error"]["message"]
    bad_b64 = client.post(
        "/v1/phash/from-frames", json={"frames": [{"width": 8, "height": 8, "gray_b64": "!!not base64!!"}]}
    )
    assert bad_b64.status_code == 422
    assert "base64" in bad_b64.json()["error"]["message"]
    assert client.post("/v1/phash/from-frames", json={"frames": []}).status_code == 422
