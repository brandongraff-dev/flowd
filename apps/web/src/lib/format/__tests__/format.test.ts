import { describe, expect, it } from "vitest";
import { formatMoney as engineFormatMoney } from "@/lib/engine";
import {
  compactWhitespace,
  displayUrl,
  excerpt,
  formatCostPer,
  formatCpm,
  formatCpmRange,
  formatDecimal,
  formatFee,
  formatHandle,
  formatList,
  formatMoney,
  formatMoneyRange,
  formatPct,
  formatPoints,
  formatRank,
  formatSignedPct,
  formatViews,
  humanize,
  initials,
  ordinal,
  pluralOf,
  pluralWord,
  pluralise,
  shortId,
  splitMoney,
  truncate,
  truncateMiddle,
  truncateWords,
  withArticle,
} from "../index";

describe("money", () => {
  it("re-exports the engine's formatter, so every surface agrees", () => {
    expect(formatMoney).toBe(engineFormatMoney);
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(25000, { cents: "auto" })).toBe("$250");
    expect(formatMoney(-1230)).toBe("-$12.30");
  });
  it("formats CPMs in the house wording", () => {
    expect(formatCpm(210)).toBe("$2.10 per 1,000 views");
    expect(formatCpm(210, "short")).toBe("$2.10 CPM");
    expect(formatCpm(210, "bare")).toBe("$2.10");
  });
  it("formats percentages without trailing zeros", () => {
    expect(formatPct(0.12)).toBe("12%");
    expect(formatPct(0.015)).toBe("1.5%");
    expect(formatPct(0.1234, 1)).toBe("12.3%");
  });
  it("always signs a delta, and leaves zero alone", () => {
    expect(formatSignedPct(0.124)).toBe("+12.4%");
    expect(formatSignedPct(-0.045)).toBe("-4.5%");
    expect(formatSignedPct(0)).toBe("0%");
    expect(formatSignedPct(0.0001, 0)).toBe("0%");
    expect(formatPoints(0.62, 0.55)).toBe("+7 pts");
    expect(formatPoints(0.5, 0.58)).toBe("-8 pts");
    expect(formatPoints(0.5, 0.5)).toBe("0 pts");
  });
  it("formats ranges, swapping reversed bounds and collapsing equal ones", () => {
    expect(formatMoneyRange(8000, 11500)).toBe("$80 to $115");
    expect(formatMoneyRange(11500, 8000)).toBe("$80 to $115");
    expect(formatMoneyRange(8000, 11540)).toBe("$80 to $115.40");
    expect(formatMoneyRange(8000, 11500, { joiner: "dash" })).toBe("$80–$115");
    expect(formatMoneyRange(5000, 5000)).toBe("$50");
    expect(formatCpmRange(190, 310)).toBe("$1.90 to $3.10 per 1,000 views");
    expect(formatCpmRange(310, 190, "short")).toBe("$1.90 to $3.10 CPM");
    expect(formatCpmRange(200, 200, "bare")).toBe("$2.00");
  });
  it("never shows a zero for a missing cost", () => {
    expect(formatCostPer(340, "trial")).toBe("$3.40 per trial");
    expect(formatCostPer(null, "trial")).toBe("not enough data");
    expect(formatCostPer(Number.NaN, "install")).toBe("not enough data");
  });
  it("shows a fee before confirm", () => {
    expect(formatFee(240, 0.015)).toBe("$2.40 fee (1.5%)");
    expect(formatFee(240)).toBe("$2.40 fee");
    expect(formatFee(0)).toBe("No fee");
  });
  it("splits money for hero figures", () => {
    expect(splitMoney(128460)).toEqual({ sign: "", dollars: "1,284", cents: "60" });
    expect(splitMoney(-5)).toEqual({ sign: "-", dollars: "0", cents: "05" });
    expect(splitMoney(0)).toEqual({ sign: "", dollars: "0", cents: "00" });
  });
  it("formats counts and decimals", () => {
    expect(formatViews(14200)).toBe("14.2K views");
    expect(formatViews(1)).toBe("1 view");
    expect(formatDecimal(1234.567, 1)).toBe("1,234.6");
    expect(formatDecimal(-0.04, 1)).toBe("0.0");
    expect(formatDecimal(-12.5, 0)).toBe("-13");
  });
});

describe("ordinal", () => {
  it("handles the 1st, 2nd, 3rd pattern and the teens", () => {
    const cases: [number, string][] = [
      [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [10, "10th"], [11, "11th"], [12, "12th"], [13, "13th"],
      [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"], [112, "112th"], [1003, "1003rd"],
    ];
    for (const [n, text] of cases) expect(ordinal(n)).toBe(text);
  });
  it("rounds and keeps the sign", () => {
    expect(ordinal(2.6)).toBe("3rd");
    expect(ordinal(-1)).toBe("-1st");
    expect(ordinal(Number.NaN)).toBe("0th");
  });
  it("ranks against a field", () => {
    expect(formatRank(4, 30)).toBe("4th of 30");
    expect(formatRank(1)).toBe("1st");
  });
});

describe("pluralise", () => {
  it("builds regular plurals", () => {
    expect(pluralOf("bounty")).toBe("bounties");
    expect(pluralOf("day")).toBe("days");
    expect(pluralOf("match")).toBe("matches");
    expect(pluralOf("creator")).toBe("creators");
    expect(pluralOf("person")).toBe("people");
    expect(pluralOf("Person")).toBe("People");
    expect(pluralOf("")).toBe("");
  });
  it("counts with the number", () => {
    expect(pluralise(1, "bounty")).toBe("1 bounty");
    expect(pluralise(0, "submission")).toBe("0 submissions");
    expect(pluralise(1204, "view")).toBe("1,204 views");
    expect(pluralise(2, "person")).toBe("2 people");
    expect(pluralise(3, "ox", "oxen")).toBe("3 oxen");
  });
  it("returns just the word on request", () => {
    expect(pluralWord(1, "bounty")).toBe("bounty");
    expect(pluralWord(5, "bounty")).toBe("bounties");
  });
  it("joins lists and picks articles", () => {
    expect(formatList(["views", "installs", "trials"])).toBe("views, installs and trials");
    expect(formatList(["a", "b"])).toBe("a and b");
    expect(withArticle("hour")).toBe("an hour");
    expect(withArticle("bounty")).toBe("a bounty");
    expect(withArticle("user")).toBe("a user");
  });
});

describe("truncate", () => {
  it("leaves text that fits alone", () => {
    expect(truncate("Money follows what works.", 40)).toBe("Money follows what works.");
  });
  it("cuts on a word and counts the ellipsis", () => {
    const out = truncate("Money follows what works.", 14);
    expect(out).toBe("Money follows…");
    expect(Array.from(out).length).toBeLessThanOrEqual(14);
  });
  it("hard-cuts when there is no word to cut on", () => {
    expect(truncate("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });
  it("never splits an emoji and never exceeds max", () => {
    const out = truncate("🎬🎬🎬🎬🎬🎬🎬🎬", 4);
    expect(Array.from(out)).toHaveLength(4);
    expect(out.endsWith("…")).toBe(true);
  });
  it("handles degenerate limits", () => {
    expect(truncate("hello", 0)).toBe("");
    expect(truncate("hello", 1)).toBe("…");
  });
  it("cuts by words", () => {
    expect(truncateWords("one two three four", 2)).toBe("one two…");
    expect(truncateWords("one two", 5)).toBe("one two");
    expect(truncateWords("a, b, c, d", 2)).toBe("a, b…");
  });
  it("keeps both ends of an id", () => {
    const out = truncateMiddle("joinflowd.io/p/proof_8f3a91c2d4e5", 20);
    expect(Array.from(out)).toHaveLength(20);
    expect(out.startsWith("joinflowd.i")).toBe(true);
    expect(out.endsWith("d4e5")).toBe(true);
    expect(truncateMiddle("short", 20)).toBe("short");
  });
  it("builds an excerpt around the match", () => {
    const text = `${"lorem ".repeat(30)}the hook lands in two seconds ${"ipsum ".repeat(30)}`;
    const out = excerpt(text, 60, "hook lands");
    expect(out).toContain("hook lands");
    expect(Array.from(out).length).toBeLessThanOrEqual(61);
    expect(excerpt("short text", 60)).toBe("short text");
    expect(excerpt("a   b\n\nc", 60)).toBe("a b c");
  });
  it("compacts whitespace", () => {
    expect(compactWhitespace("  a \n b\t c ")).toBe("a b c");
  });
});

describe("identity text", () => {
  it("makes initials", () => {
    expect(initials("Maya Reyes")).toBe("MR");
    expect(initials("maya.makes")).toBe("MM");
    expect(initials("@lou_learns")).toBe("LL");
    expect(initials("flowd")).toBe("FL");
    expect(initials("")).toBe("");
  });
  it("normalises handles and urls", () => {
    expect(formatHandle("maya.makes")).toBe("@maya.makes");
    expect(formatHandle("@@maya.makes")).toBe("@maya.makes");
    expect(displayUrl("https://www.joinflowd.io/c/maya.makes/")).toBe("joinflowd.io/c/maya.makes");
  });
  it("shortens ids and humanises codes", () => {
    expect(shortId("sub_0634")).toBe("0634");
    expect(shortId("proof_8f3a91c2d4e5")).toBe("c2d4e5");
    expect(humanize("reason_required")).toBe("Reason required");
    expect(humanize("window_closed")).toBe("Window closed");
  });
});
