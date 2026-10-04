import { describe, expect, it } from "vitest";
import {
  callsToAction,
  capitalize,
  containment,
  contentTokens,
  escapeRegExp,
  findPhrase,
  findPhrases,
  jaccard,
  joinList,
  normalizeText,
  secondsLabel,
  slugify,
  textParity,
  timecode,
  titleCase,
  tokenize,
  wordCount,
} from "../text";

describe("normalising and tokenising", () => {
  it("lower-cases, straightens quotes and dashes, and collapses whitespace", () => {
    expect(normalizeText("  I’m   “SURE”\tthis – works \n now ")).toBe(`i'm "sure" this - works now`);
    expect(normalizeText("")).toBe("");
  });

  it("splits words, keeping apostrophes inside words and a leading # on hashtags", () => {
    expect(tokenize("I didn’t expect #ad Lumi's 7-day trial!")).toEqual(["i", "didn't", "expect", "#ad", "lumi's", "7", "day", "trial"]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("!!! ???")).toEqual([]);
    expect(wordCount("I was wrong about photo editing apps.")).toBe(7);
    expect(wordCount("")).toBe(0);
  });

  it("drops function words when comparing what is said with what is shown", () => {
    expect(contentTokens("I was wrong about the photo apps")).toEqual(["wrong", "about", "photo", "apps"]);
  });
});

describe("similarity", () => {
  it("measures Jaccard similarity of two token lists", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3, 9);
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
    expect(jaccard([], ["a"])).toBe(0);
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["a", "a", "b"], ["a", "b"])).toBe(1); // sets, not bags
  });

  it("measures how much of one list the other covers", () => {
    expect(containment(["a", "b"], ["a", "b", "c"])).toBe(1);
    expect(containment(["a", "b", "x", "y"], ["a", "b"])).toBe(0.5);
    expect(containment([], ["a"])).toBe(0);
  });

  it("counts a shortened on-screen caption as a mirror of the spoken line", () => {
    expect(textParity("I was wrong about photo editing apps", "I was wrong about photo editing apps")).toBe(1);
    expect(textParity("I was wrong about photo editing apps, honestly", "Wrong about photo apps")).toBeGreaterThanOrEqual(0.75);
    expect(textParity("I was wrong about photo editing apps", "Try Lumi free today")).toBe(0);
    expect(textParity("", "anything")).toBe(0);
    expect(textParity("anything", "")).toBe(0);
    expect(textParity("the a an", "the a")).toBe(0); // only function words: nothing to compare
  });
});

describe("finding phrases", () => {
  it("matches whole phrases only, case-insensitively", () => {
    expect(findPhrase("This is a PAID partnership with Lumi", ["paid partnership"])).toEqual({ phrase: "paid partnership", index: 10 });
    expect(findPhrase("That was bad advice", ["ad"])).toBeNull();
    expect(findPhrase("Shipping was a bad deal", ["bad deal"])?.index).toBe(15);
    expect(findPhrase("nothing here", ["#ad", "sponsored"])).toBeNull();
    expect(findPhrase("anything", [""])).toBeNull();
  });

  it("matches hashtags as a unit and does not run into the next word", () => {
    expect(findPhrase("Love it #ad #lumi", ["#ad"])).toEqual({ phrase: "#ad", index: 8 });
    expect(findPhrase("Love it #adventure", ["#ad"])).toBeNull();
    expect(findPhrase("so #ad.", ["#ad"])?.index).toBe(3);
  });

  it("returns the earliest of several phrases, and all that occur", () => {
    expect(findPhrase("a sponsored post, also #ad", ["#ad", "sponsored"])).toEqual({ phrase: "sponsored", index: 2 });
    expect(findPhrases("guaranteed results, honestly 100% realistic", ["guaranteed results", "100% realistic", "free money"])).toEqual(["guaranteed results", "100% realistic"]);
    expect(findPhrases("clean", ["x"])).toEqual([]);
  });

  it("escapes regular-expression characters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
    expect(findPhrase("costs $1.50 (really)", ["$1.50 (really)"])).not.toBeNull();
  });
});

describe("small formatters", () => {
  it("title-cases, keeping short all-caps tokens", () => {
    expect(titleCase("lumi ai photo editor")).toBe("Lumi Ai Photo Editor");
    expect(titleCase("Lumi AI Photo Editor")).toBe("Lumi AI Photo Editor");
    expect(titleCase("  mixed   CASE  words ")).toBe("Mixed Case Words");
    expect(titleCase("")).toBe("");
  });

  it("makes URL slugs", () => {
    expect(slugify("Lumi AI Photo Editor")).toBe("lumi-ai-photo-editor");
    expect(slugify("Lumi & Co.")).toBe("lumi-and-co");
    expect(slugify("  --Hello,   World!-- ")).toBe("hello-world");
    expect(slugify("")).toBe("");
  });

  it("capitalises and joins lists", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("")).toBe("");
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });

  it("writes timecodes and seconds", () => {
    expect(timecode(0)).toBe("0:00");
    expect(timecode(2400)).toBe("0:02");
    expect(timecode(2600)).toBe("0:03");
    expect(timecode(75_000)).toBe("1:15");
    expect(timecode(-5)).toBe("0:00");
    expect(secondsLabel(2400)).toBe("2.4s");
    expect(secondsLabel(0)).toBe("0.0s");
    expect(secondsLabel(null)).toBe("never");
    expect(secondsLabel(undefined)).toBe("never");
  });
});

describe("calls to action", () => {
  it("finds the one ask in a line, however it is phrased", () => {
    expect(callsToAction("Try Lumi free with the link in my bio.")).toEqual(["get_the_app"]);
    expect(callsToAction("Download it on the App Store")).toEqual(["get_the_app"]);
    expect(callsToAction("Use my code MAYA7 for a free week")).toEqual(["get_the_app"]);
    expect(callsToAction("Link in bio, tap the link, search it in the App Store")).toEqual(["get_the_app"]);
    expect(callsToAction("Follow me for more")).toEqual(["follow"]);
    expect(callsToAction("Like and comment below")).toEqual(["engage"]);
    expect(callsToAction("Visit our website")).toEqual(["visit_site"]);
  });

  it("counts several asks separately, so more than one means the CTA is unclear", () => {
    expect(callsToAction("Download the app and follow me for more").sort()).toEqual(["follow", "get_the_app"]);
    expect(callsToAction("Download it, follow me and share this").length).toBe(3);
  });

  it("finds none in a line that asks for nothing", () => {
    expect(callsToAction("This changed how I edit photos.")).toEqual([]);
    expect(callsToAction("")).toEqual([]);
  });
});
