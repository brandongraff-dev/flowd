import { describe, expect, it } from "vitest";
import type { LucideIcon } from "lucide-react";
import { formatDelta } from "./delta-format";
import { flattenNav, matchesEntry, resolveActiveHref, type NavEntry, type NavGroup } from "./nav";
import { pageWindow } from "./pagination-window";

const icon = (() => null) as unknown as LucideIcon;
const entry = (href: string, extra: Partial<NavEntry> = {}): NavEntry => ({ href, label: href, icon, ...extra });

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses the far side to a gap and keeps a constant width", () => {
    expect(pageWindow(1, 16)).toEqual([1, 2, 3, 4, 5, null, 16]);
    expect(pageWindow(3, 16)).toEqual([1, 2, 3, 4, 5, null, 16]);
    expect(pageWindow(8, 16)).toEqual([1, null, 7, 8, 9, null, 16]);
    expect(pageWindow(16, 16)).toEqual([1, null, 12, 13, 14, 15, 16]);
  });

  it("clamps out-of-range pages and tolerates zero pages", () => {
    expect(pageWindow(99, 16)).toEqual([1, null, 12, 13, 14, 15, 16]);
    expect(pageWindow(-4, 16)).toEqual([1, 2, 3, 4, 5, null, 16]);
    expect(pageWindow(1, 0)).toEqual([1]);
  });

  it("honours a wider sibling count", () => {
    expect(pageWindow(10, 30, 2)).toEqual([1, null, 8, 9, 10, 11, 12, null, 30]);
  });
});

describe("nav matching", () => {
  it("matches a path and its children but not a sibling prefix", () => {
    expect(matchesEntry("/brand/review/sub_1", entry("/brand/review"))).toBe(true);
    expect(matchesEntry("/brand/reviews", entry("/brand/review"))).toBe(false);
    expect(matchesEntry("/brand/review/", entry("/brand/review"))).toBe(true);
  });

  it("matches exact entries (index routes) only on themselves", () => {
    expect(matchesEntry("/brand", entry("/brand", { exact: true }))).toBe(true);
    expect(matchesEntry("/brand/wallet", entry("/brand", { exact: true }))).toBe(false);
    expect(matchesEntry("/", entry("/"))).toBe(true);
    expect(matchesEntry("/pricing", entry("/"))).toBe(false);
  });

  it("activates exactly one entry: the longest matching href wins", () => {
    const entries = [entry("/brand"), entry("/brand/bounties"), entry("/brand/bounties/new"), entry("https://example.test/docs", { external: true })];
    expect(resolveActiveHref("/brand/bounties/new", entries)).toBe("/brand/bounties/new");
    expect(resolveActiveHref("/brand/bounties/bnty_1", entries)).toBe("/brand/bounties");
    expect(resolveActiveHref("/brand", entries)).toBe("/brand");
    expect(resolveActiveHref("/elsewhere", entries)).toBeUndefined();
  });

  it("flattens groups in order", () => {
    const groups: NavGroup[] = [{ items: [entry("/a"), entry("/b")] }, { label: "More", items: [entry("/c")] }];
    expect(flattenNav(groups).map((item) => item.href)).toEqual(["/a", "/b", "/c"]);
  });
});

describe("formatDelta", () => {
  it("signs with a typographic minus and drops a trailing .0", () => {
    expect(formatDelta(0.124)).toBe("+12.4%");
    expect(formatDelta(-0.214)).toBe("−21.4%");
    expect(formatDelta(0.09)).toBe("+9%");
    expect(formatDelta(0.38, 0)).toBe("+38%");
  });

  it("calls a change under 0.05 percent flat", () => {
    expect(formatDelta(0)).toBe("0%");
    expect(formatDelta(0.0003)).toBe("0%");
  });
});
