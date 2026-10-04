import { describe, expect, it } from "vitest";
import { formatCents, formatCompact, formatRatio, formatX, formatXLong, quantile, xKey } from "./format";
import { MAX_SERIES, OTHER_COLOR, SEQUENTIAL_COLORS, markerShape, sequentialBin, sequentialColor, sequentialLabelClass, sequentialStep, seriesColor } from "./palette";
import { paybackDay } from "./retention-math";
import { scoreBand } from "./score-band";

describe("chart formatting", () => {
  it("formats money from integer cents, compact only when asked", () => {
    expect(formatCents(128460)).toBe("$1,284.60");
    expect(formatCents(1_250_000, true)).toBe("$12.5K");
    expect(formatCents(-1200)).toBe("−$12.00");
  });

  it("formats compact numbers and ratios", () => {
    expect(formatCompact(4_212_880)).toBe("4.2M");
    expect(formatCompact(412)).toBe("412");
    expect(formatRatio(0.184)).toBe("18.4%");
    expect(formatRatio(0.5, 0)).toBe("50%");
    expect(formatRatio(0.1, 1)).toBe("10%");
  });

  it("formats dates in UTC and numbers compactly for axis and tooltip", () => {
    const date = new Date(Date.UTC(2026, 9, 3));
    expect(formatX(date)).toBe("Oct 3");
    expect(formatXLong(date)).toBe("Sat, Oct 3, 2026");
    expect(formatX(12900)).toBe("12.9K");
    expect(formatX("Mon")).toBe("Mon");
  });

  it("keys dates by epoch milliseconds so equal x values match across series", () => {
    expect(xKey(new Date(Date.UTC(2026, 9, 3)))).toBe(Date.UTC(2026, 9, 3));
    expect(xKey(7)).toBe(7);
    expect(xKey("Tue")).toBe("Tue");
  });

  it("interpolates quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([10, 20], 0.25)).toBe(12.5);
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("chart palette", () => {
  it("assigns categorical hues by position, never cycling: the ninth folds into grey", () => {
    expect(seriesColor(0)).toBe("var(--fd-chart-1)");
    expect(seriesColor(MAX_SERIES - 1)).toBe("var(--fd-chart-8)");
    expect(seriesColor(MAX_SERIES)).toBe(OTHER_COLOR);
  });

  it("quantises a position onto the 7-step sequential ramp", () => {
    expect(sequentialBin(0)).toBe(0);
    expect(sequentialBin(1)).toBe(6);
    expect(sequentialBin(0.5)).toBe(3);
    expect(sequentialColor(1)).toBe(SEQUENTIAL_COLORS[6]);
  });

  it("spreads fewer bins across the full ramp so the extremes stay extreme", () => {
    const steps = [0, 0.3, 0.5, 0.7, 0.99].map((t) => sequentialStep(t, 5));
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(6);
    expect(new Set(steps).size).toBe(5);
  });

  it("flips the in-cell label with the ramp so it always opposes the fill", () => {
    expect(sequentialLabelClass(0)).toBe("fill-fg");
    expect(sequentialLabelClass(6)).toBe("fill-fg-inverse");
    expect(sequentialLabelClass(3)).toContain("light:fill-fg");
  });

  it("cycles marker shapes for the redundant shape channel", () => {
    expect(markerShape(0)).toBe("circle");
    expect(markerShape(4)).toBe("circle");
    expect(new Set([0, 1, 2, 3].map(markerShape)).size).toBe(4);
  });
});

describe("paybackDay", () => {
  const points = [
    { day: 0, value: 0.06 },
    { day: 30, value: 0.88 },
    { day: 60, value: 1.34 },
  ];

  it("interpolates the day a cohort crosses break-even", () => {
    expect(paybackDay(points)).toBe(38);
  });

  it("is null while the cohort has not paid back yet", () => {
    expect(
      paybackDay([
        { day: 0, value: 0.1 },
        { day: 30, value: 0.6 },
      ]),
    ).toBeNull();
  });

  it("does not depend on input order", () => {
    expect(paybackDay([...points].reverse())).toBe(38);
  });
});

describe("scoreBand", () => {
  it("maps checklist scores to the contract bands", () => {
    expect(scoreBand(100).letter).toBe("A");
    expect(scoreBand(85).letter).toBe("A");
    expect(scoreBand(84).letter).toBe("B");
    expect(scoreBand(70).letter).toBe("B");
    expect(scoreBand(69).letter).toBe("C");
    expect(scoreBand(55).letter).toBe("C");
    expect(scoreBand(54).letter).toBe("D");
    expect(scoreBand(40).letter).toBe("D");
    expect(scoreBand(39).letter).toBe("E");
    expect(scoreBand(0).word).toBe("Fix before posting");
  });
});
