"""A BK-tree over 64-bit perceptual hashes: "everything within Hamming distance d" without scanning every hash."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from ..schemas.common import KnownHash
from .core import from_hex, hamming


@dataclass(slots=True)
class _Node:
    hash: int
    ids: list[str]
    children: dict[int, _Node] = field(default_factory=dict)


class PerceptualHashIndex:
    """Metric index (BK-tree). Insert-only; ids that share a hash share a node."""

    def __init__(self) -> None:
        self._root: _Node | None = None
        self._size = 0

    def __len__(self) -> int:
        return self._size

    def add(self, item_id: str, hash_value: int | str) -> None:
        h = from_hex(hash_value) if isinstance(hash_value, str) else hash_value
        self._size += 1
        if self._root is None:
            self._root = _Node(h, [item_id])
            return
        node = self._root
        while True:
            d = hamming(h, node.hash)
            if d == 0:
                node.ids.append(item_id)
                return
            child = node.children.get(d)
            if child is None:
                node.children[d] = _Node(h, [item_id])
                return
            node = child

    def extend(self, items: Iterable[tuple[str, int | str]]) -> None:
        for item_id, h in items:
            self.add(item_id, h)

    def search(self, hash_value: int | str, max_distance: int = 6) -> list[tuple[int, str]]:
        """All ``(distance, id)`` within ``max_distance``, closest first (ties by id)."""
        if self._root is None:
            return []
        h = from_hex(hash_value) if isinstance(hash_value, str) else hash_value
        found: list[tuple[int, str]] = []
        stack = [self._root]
        while stack:
            node = stack.pop()
            d = hamming(h, node.hash)
            if d <= max_distance:
                found.extend((d, i) for i in node.ids)
            lo, hi = d - max_distance, d + max_distance
            stack.extend(child for dist, child in node.children.items() if lo <= dist <= hi)
        return sorted(found)


def closest_match(
    phash: str, known: Iterable[KnownHash], exclude_id: str | None = None
) -> tuple[int, KnownHash] | None:
    """Closest known hash by Hamming distance (a linear scan: fine up to ~100k hashes; use the index beyond that)."""
    h = from_hex(phash)
    best: tuple[int, KnownHash] | None = None
    for k in known:
        if exclude_id is not None and k.id == exclude_id:
            continue
        d = hamming(h, from_hex(k.phash))
        if best is None or d < best[0]:
            best = (d, k)
    return best
