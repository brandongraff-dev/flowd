/** The page numbers to render: first, last, the current page and its siblings, with `null` standing for a gap ("..."). The window keeps a constant width, so the control does not jump as you page. */
export function pageWindow(page: number, pageCount: number, siblings = 1): (number | null)[] {
  const total = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(Math.floor(page), 1), total);
  const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
  const slots = siblings * 2 + 5;
  if (total <= slots) return range(1, total);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const gapLeft = left > 3;
  const gapRight = right < total - 2;
  const edge = 3 + 2 * siblings;
  if (!gapLeft && gapRight) return [...range(1, edge), null, total];
  if (gapLeft && !gapRight) return [1, null, ...range(total - edge + 1, total)];
  return [1, null, ...range(left, right), null, total];
}
