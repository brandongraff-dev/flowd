"""Perceptual hashing for duplicate detection (BLUEPRINT ML system 3; fraud signal ``duplicate_hash``).

A 64-bit DCT pHash in pure Python (no numpy, no Pillow): grayscale -> 32x32 area average -> 2D DCT-II -> keep the 8x8
low frequencies -> bit = coefficient above the median (by more than ``TIE_EPSILON``, so coefficients that are exactly zero
in theory but ~1e-13 in floating point cannot flip bits between implementations). A video hash is the bitwise majority vote of its keyframe hashes,
which makes it robust to re-encodes, small crops, brightness shifts and a few dropped frames. Two videos are duplicates
when their Hamming distance is at most 6 (``CONSTANTS.fraud.duplicate_phash_max_distance``).

The algorithm is spelled out so the TypeScript and Swift engines can reproduce it: see
``packages/contract/testvectors/ml/phash.json`` (frames given as base64 grayscale, expected hash and distances).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

from ..numeric import median

HASH_BITS = 64
TIE_EPSILON = (
    1e-6  # DCT coefficients of real images are ~1e2..1e5; anything within 1e-6 of the median is a tie and hashes to 0
)
_N = 32  # DCT input size
_K = 8  # kept low-frequency block
_COS: tuple[tuple[float, ...], ...] = tuple(
    tuple(math.cos(math.pi / _N * (n + 0.5) * k) for n in range(_N)) for k in range(_K)
)


def gray_matrix(data: bytes, width: int, height: int) -> list[list[float]]:
    """Rows of floats from raw 8-bit grayscale bytes (row-major)."""
    if width < 1 or height < 1 or len(data) != width * height:
        raise ValueError(f"expected {width * height} grayscale bytes for {width}x{height}, got {len(data)}")
    return [[float(data[y * width + x]) for x in range(width)] for y in range(height)]


def _axis_weights(src: int, dst: int) -> list[list[tuple[int, float]]]:
    """For each destination cell, the source cells it covers and their fractional coverage (area averaging)."""
    scale = src / dst
    out: list[list[tuple[int, float]]] = []
    for d in range(dst):
        lo, hi = d * scale, (d + 1) * scale
        cells: list[tuple[int, float]] = []
        i = math.floor(lo)
        while i < hi and i < src:
            w = min(hi, i + 1) - max(lo, i)
            if w > 1e-12:
                cells.append((i, w / scale))
            i += 1
        out.append(cells)
    return out


def resize_area(pixels: Sequence[Sequence[float]], size: int = _N) -> list[list[float]]:
    """Area-average resize of a grayscale matrix to ``size`` x ``size`` (a box filter, exact for fractional ratios)."""
    h = len(pixels)
    w = len(pixels[0]) if h else 0
    if h == 0 or w == 0:
        raise ValueError("empty image")
    xw = _axis_weights(w, size)
    yw = _axis_weights(h, size)
    # horizontal pass
    tmp = [[sum(row[i] * wt for i, wt in cells) for cells in xw] for row in pixels]
    # vertical pass
    return [[sum(tmp[j][x] * wt for j, wt in cells) for x in range(size)] for cells in yw]


def dct_low(block32: Sequence[Sequence[float]]) -> list[list[float]]:
    """Top-left 8x8 of the unnormalised 2D DCT-II of a 32x32 block."""
    rows = [[sum(r[n] * _COS[k][n] for n in range(_N)) for k in range(_K)] for r in block32]  # 32 x 8
    return [
        [sum(rows[n][u] * _COS[k][n] for n in range(_N)) for u in range(_K)] for k in range(_K)
    ]  # k (vertical) x u (horizontal)


def phash_bits(pixels: Sequence[Sequence[float]]) -> int:
    """64-bit pHash of a grayscale matrix of any size >= 1x1."""
    coeffs = dct_low(resize_area(pixels))
    flat = [c for row in coeffs for c in row]
    med = median(flat)
    h = 0
    for c in flat:
        h = (h << 1) | (1 if c > med + TIE_EPSILON else 0)
    return h


def phash_gray(data: bytes, width: int, height: int) -> int:
    return phash_bits(gray_matrix(data, width, height))


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def to_hex(h: int) -> str:
    return f"{h:016x}"


def from_hex(s: str) -> int:
    if len(s) != 16:
        raise ValueError("a perceptual hash is 16 hex characters")
    return int(s, 16)


def hamming_hex(a: str, b: str) -> int:
    return hamming(from_hex(a), from_hex(b))


def majority_hash(hashes: Iterable[int]) -> int:
    """Bitwise majority vote across frame hashes (ties vote 0). Robust video-level fingerprint."""
    hs = list(hashes)
    if not hs:
        raise ValueError("no frame hashes")
    out = 0
    for bit in range(HASH_BITS - 1, -1, -1):
        ones = sum((h >> bit) & 1 for h in hs)
        out = (out << 1) | (1 if ones * 2 > len(hs) else 0)
    return out


def video_phash(frames: Iterable[tuple[bytes, int, int]]) -> str:
    """Video fingerprint from keyframes given as ``(gray_bytes, width, height)``; returns 16 hex characters."""
    return to_hex(majority_hash(phash_gray(d, w, h) for d, w, h in frames))
