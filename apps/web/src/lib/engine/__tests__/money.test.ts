import { describe, expect, it } from "vitest";
import {
  bps,
  divRound,
  dollarsToCents,
  formatCompact,
  formatCpm,
  formatDeltaMoney,
  formatHours,
  formatInt,
  formatMoney,
  formatMultiple,
  formatPercent,
  mulRate,
  parseMoney,
  roundHalfUp,
  splitCents,
  sumCents,
} from "../money";

describe("rounding", () => {
  it("converts a rate to basis points without float drift", () => {
    expect(bps(0.12)).toBe(1200);
    expect(bps(0.029)).toBe(290);
    expect(bps(0.015)).toBe(150);
    expect(bps(0.1)).toBe(1000);
    expect(bps(0.07)).toBe(700);
  });

  it("rounds half away from zero, symmetric for negatives", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.4999)).toBe(2);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-2.4)).toBe(-2);
    expect(roundHalfUp(0)).toBe(0);
  });

  it("applies a rate in integer math: round half up per leg", () => {
    expect(mulRate(500_000, 0.12)).toBe(60_000);
    expect(mulRate(9640, 0.1)).toBe(964);
    expect(mulRate(2260, 0.1)).toBe(226);
    expect(mulRate(5, 0.1)).toBe(1); // 0.5 rounds up
    expect(mulRate(4, 0.1)).toBe(0); // 0.4 rounds down
    expect(mulRate(15, 0.1)).toBe(2); // 1.5 rounds up
    expect(mulRate(6594, 0.1)).toBe(659); // 659.4
    expect(mulRate(0, 0.12)).toBe(0);
    expect(mulRate(1, 0.029)).toBe(0);
    expect(mulRate(17, 0.029)).toBe(0); // 0.493
    expect(mulRate(18, 0.029)).toBe(1); // 0.522
  });

  it("never drifts on a classic float trap", () => {
    // 1.005 * 100 style traps: the amounts below are exact in integer math.
    expect(mulRate(10_050, 0.01)).toBe(101); // 100.5 rounds up
    expect(mulRate(1_145, 0.1)).toBe(115); // 114.5 rounds up
    expect(mulRate(33_333, 0.3)).toBe(10_000); // 9999.9 rounds up
  });

  it("is odd-symmetric for negative amounts (clawbacks)", () => {
    expect(mulRate(-5, 0.1)).toBe(-1);
    expect(mulRate(-6594, 0.1)).toBe(-659);
  });

  it("rounds integer ratios half up", () => {
    expect(divRound(1, 2)).toBe(1);
    expect(divRound(1, 3)).toBe(0);
    expect(divRound(2, 3)).toBe(1);
    expect(divRound(-1, 2)).toBe(-1);
    expect(divRound(576_270 * 200, 500_000)).toBe(231);
    expect(() => divRound(1, 0)).toThrow();
  });

  it("sums cents", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([])).toBe(0);
  });
});

describe("splitCents", () => {
  it("splits with the largest remainder method and never drifts", () => {
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(splitCents(0, [1, 2])).toEqual([0, 0]);
    for (const total of [1, 7, 99, 1000, 12_345]) {
      const parts = splitCents(total, [3, 5, 7, 11]);
      expect(sumCents(parts)).toBe(total);
    }
  });

  it("gives a zero weight nothing", () => {
    expect(splitCents(100, [0, 1, 1])).toEqual([0, 50, 50]);
  });

  it("handles empty input and all-zero weights", () => {
    expect(splitCents(5, [])).toEqual([]);
    expect(splitCents(0, [0, 0])).toEqual([0, 0]);
    expect(() => splitCents(5, [0, 0])).toThrow();
  });
});

describe("parseMoney", () => {
  it("parses clean amounts into cents", () => {
    expect(parseMoney("$1,234.56")).toBe(123_456);
    expect(parseMoney("1234.5")).toBe(123_450);
    expect(parseMoney("250")).toBe(25_000);
    expect(parseMoney(" $0.99 ")).toBe(99);
    expect(parseMoney(".5")).toBe(50);
    expect(parseMoney("+12")).toBe(1200);
  });

  it("parses negatives", () => {
    expect(parseMoney("-$12")).toBe(-1200);
    expect(parseMoney("(12.00)")).toBe(-1200);
    expect(parseMoney("-12.30")).toBe(-1230);
  });

  it("rejects text that is not a clean amount", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("1,23")).toBeNull();
    expect(parseMoney("$-5")).toBeNull();
    expect(parseMoney("12 dollars")).toBeNull();
  });

  it("converts form dollars to cents", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(1.005)).toBe(101);
    expect(dollarsToCents(0)).toBe(0);
  });
});

describe("formatMoney", () => {
  it("formats cents as dollars with grouping", () => {
    expect(formatMoney(123_456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(99)).toBe("$0.99");
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(100_000_000)).toBe("$1,000,000.00");
    expect(formatMoney(5_000_000)).toBe("$50,000.00");
  });

  it("formats negatives and signed deltas", () => {
    expect(formatMoney(-1230)).toBe("-$12.30");
    expect(formatMoney(120, { sign: "always" })).toBe("+$1.20");
    expect(formatMoney(0, { sign: "always" })).toBe("$0.00");
    expect(formatDeltaMoney(-40)).toBe("-$0.40");
    expect(formatDeltaMoney(40)).toBe("+$0.40");
  });

  it("supports whole-dollar modes", () => {
    expect(formatMoney(25_000, { cents: "auto" })).toBe("$250");
    expect(formatMoney(25_040, { cents: "auto" })).toBe("$250.40");
    expect(formatMoney(25_050, { cents: "never" })).toBe("$251");
    expect(formatMoney(25_049, { cents: "never" })).toBe("$250");
  });

  it("supports compact dashboards", () => {
    expect(formatMoney(1_500_000, { compact: true })).toBe("$15K");
    expect(formatMoney(250_000_000, { compact: true })).toBe("$2.5M");
    expect(formatMoney(-1_500_000, { compact: true })).toBe("-$15K");
  });

  it("rounds fractional cents and survives non-finite input", () => {
    expect(formatMoney(100.4)).toBe("$1.00");
    expect(formatMoney(100.5)).toBe("$1.01");
    expect(formatMoney(Number.NaN)).toBe("—");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatCpm", () => {
  it("writes a CPM the house way", () => {
    expect(formatCpm(210)).toBe("$2.10 per 1,000 views");
    expect(formatCpm(50)).toBe("$0.50 per 1,000 views");
    expect(formatCpm(210, "short")).toBe("$2.10 CPM");
    expect(formatCpm(210, "bare")).toBe("$2.10");
  });
});

describe("formatCompact", () => {
  it("compacts counts", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(1000)).toBe("1K");
    expect(formatCompact(1250)).toBe("1.3K");
    expect(formatCompact(14_200)).toBe("14.2K");
    expect(formatCompact(142_000)).toBe("142K");
    expect(formatCompact(1_500_000)).toBe("1.5M");
    expect(formatCompact(2_100_000_000)).toBe("2.1B");
  });

  it("carries at unit boundaries", () => {
    expect(formatCompact(999_500)).toBe("1M");
    expect(formatCompact(999.6)).toBe("1K");
    expect(formatCompact(99_960)).toBe("100K");
  });

  it("drops a trailing .0 and handles negatives and junk", () => {
    expect(formatCompact(2000)).toBe("2K");
    expect(formatCompact(-14_200)).toBe("-14.2K");
    expect(formatCompact(Number.NaN)).toBe("0");
  });
});

describe("formatInt, formatPercent, formatMultiple, formatHours", () => {
  it("groups integers", () => {
    expect(formatInt(2_500_000)).toBe("2,500,000");
    expect(formatInt(31_400)).toBe("31,400");
    expect(formatInt(-1234.5)).toBe("-1,235");
    expect(formatInt(Number.NaN)).toBe("0");
  });

  it("formats ratios as percentages", () => {
    expect(formatPercent(0.12)).toBe("12%");
    expect(formatPercent(0.015)).toBe("1.5%");
    expect(formatPercent(0.1)).toBe("10%");
    expect(formatPercent(0.0045)).toBe("0.45%");
    expect(formatPercent(0.348)).toBe("34.8%");
    expect(formatPercent(0.78, 1)).toBe("78.0%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  it("formats multiples", () => {
    expect(formatMultiple(1.6)).toBe("1.6x");
    expect(formatMultiple(2)).toBe("2x");
    expect(formatMultiple(0.55, 2)).toBe("0.55x");
  });

  it("formats hours the way fill times read", () => {
    expect(formatHours(0.5)).toBe("30 min");
    expect(formatHours(1)).toBe("1 h");
    expect(formatHours(31)).toBe("31 h");
    expect(formatHours(35.9)).toBe("35.9 h");
    expect(formatHours(70.2)).toBe("3 days");
    expect(formatHours(48)).toBe("2 days");
    expect(formatHours(126.35)).toBe("5 days");
    expect(formatHours(Number.NaN)).toBe("n/a");
  });
});
