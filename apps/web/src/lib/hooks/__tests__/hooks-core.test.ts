import { describe, expect, it, vi } from "vitest";
import { DEMO_NOW_MS } from "@/lib/constants";
import { createDemoClock } from "../demo-clock";
import {
  createSequenceMatcher,
  isEditableTarget,
  isPlainKey,
  matchesCombo,
  mayFire,
  parseCombo,
  sequenceKeys,
  type KeyEventLike,
} from "../hotkeys-core";

const key = (k: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k, ...extra });

describe("the demo clock", () => {
  const HOUR = 3_600_000;
  const make = () => {
    let wall = 1_000_000;
    const clock = createDemoClock({ realNow: () => wall });
    return { clock, tick: (ms: number) => void (wall += ms) };
  };

  it("starts at the demo world's instant, frozen", () => {
    const { clock, tick } = make();
    expect(clock.now()).toBe(DEMO_NOW_MS);
    tick(5 * 60_000);
    expect(clock.now()).toBe(DEMO_NOW_MS);
  });
  it("lets live time run on top of the frozen instant", () => {
    const { clock, tick } = make();
    tick(90_000);
    expect(clock.liveNow()).toBe(DEMO_NOW_MS + 90_000);
    expect(clock.now()).toBe(DEMO_NOW_MS);
  });
  it("advances and restarts the live offset", () => {
    const { clock, tick } = make();
    tick(10_000);
    clock.advance(24 * HOUR);
    expect(clock.now()).toBe(DEMO_NOW_MS + 24 * HOUR);
    expect(clock.liveNow()).toBe(DEMO_NOW_MS + 24 * HOUR);
    tick(2_000);
    expect(clock.liveNow()).toBe(DEMO_NOW_MS + 24 * HOUR + 2_000);
  });
  it("sets from an ISO string or milliseconds, ignoring garbage", () => {
    const { clock } = make();
    clock.set("2026-10-06T14:00:00Z");
    expect(clock.now()).toBe(Date.parse("2026-10-06T14:00:00Z"));
    clock.set(5);
    expect(clock.now()).toBe(5);
    clock.set("not a date");
    clock.set(Number.NaN);
    clock.advance(Number.NaN);
    expect(clock.now()).toBe(5);
  });
  it("resets to the start", () => {
    const { clock } = make();
    clock.advance(72 * HOUR);
    clock.reset();
    expect(clock.now()).toBe(DEMO_NOW_MS);
  });
  it("notifies on change, not on ticks, and stops after unsubscribe", () => {
    const { clock, tick } = make();
    const listener = vi.fn();
    const off = clock.subscribe(listener);
    tick(1000);
    clock.liveNow();
    expect(listener).not.toHaveBeenCalled();
    clock.advance(HOUR);
    clock.set(DEMO_NOW_MS);
    clock.reset();
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    clock.advance(HOUR);
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it("never lets live time run backwards", () => {
    let wall = 5000;
    const clock = createDemoClock({ realNow: () => wall });
    wall = 1000;
    expect(clock.liveNow()).toBe(DEMO_NOW_MS);
  });
});

describe("parseCombo", () => {
  it("reads modifiers and the key", () => {
    expect(parseCombo("mod+k")).toEqual({ key: "k", mod: true, shift: false, alt: false });
    expect(parseCombo("Cmd+Shift+P")).toEqual({ key: "p", mod: true, shift: true, alt: false });
    expect(parseCombo("alt + option + x").alt).toBe(true);
    expect(parseCombo("?")).toEqual({ key: "?", mod: false, shift: false, alt: false });
  });
  it("understands key aliases and a plus key", () => {
    expect(parseCombo("esc").key).toBe("escape");
    expect(parseCombo("mod+return").key).toBe("enter");
    expect(parseCombo("space").key).toBe(" ");
    expect(parseCombo("mod++")).toMatchObject({ key: "+", mod: true });
  });
});

describe("matchesCombo", () => {
  it("matches a mod chord with Cmd or Ctrl", () => {
    expect(matchesCombo(key("k", { metaKey: true }), "mod+k")).toBe(true);
    expect(matchesCombo(key("k", { ctrlKey: true }), "mod+k")).toBe(true);
    expect(matchesCombo(key("K", { ctrlKey: true }), "mod+k")).toBe(true);
    expect(matchesCombo(key("k"), "mod+k")).toBe(false);
  });
  it("does not let a modifier through a bare key, or the reverse", () => {
    expect(matchesCombo(key("j"), "j")).toBe(true);
    expect(matchesCombo(key("j", { metaKey: true }), "j")).toBe(false);
    expect(matchesCombo(key("j", { altKey: true }), "j")).toBe(false);
  });
  it("compares shift for letters but not for symbols like ?", () => {
    expect(matchesCombo(key("a", { shiftKey: true }), "shift+a")).toBe(true);
    expect(matchesCombo(key("A", { shiftKey: true }), "a")).toBe(false);
    expect(matchesCombo(key("?", { shiftKey: true }), "?")).toBe(true);
    expect(matchesCombo(key("/", { shiftKey: false }), "/")).toBe(true);
  });
  it("matches named keys with their shift state", () => {
    expect(matchesCombo(key("Escape"), "esc")).toBe(true);
    expect(matchesCombo(key("Enter", { metaKey: true }), "mod+enter")).toBe(true);
    expect(matchesCombo(key("ArrowDown", { shiftKey: true }), "shift+arrowdown")).toBe(true);
    expect(matchesCombo(key("ArrowDown"), "shift+arrowdown")).toBe(false);
  });
  it("ignores key repeat and IME composition", () => {
    expect(matchesCombo(key("j", { repeat: true }), "j")).toBe(false);
    expect(matchesCombo(key("j", { isComposing: true }), "j")).toBe(false);
  });
});

describe("typing targets", () => {
  it("recognises fields, editable regions and ARIA text roles", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", getAttribute: (n: string) => (n === "role" ? "combobox" : null) })).toBe(true);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget("x")).toBe(false);
  });
  it("lets a bare key fire outside fields only, and a mod chord anywhere", () => {
    const input = { tagName: "INPUT" };
    const body = { tagName: "BODY" };
    expect(mayFire(key("j", { target: body }), parseCombo("j"))).toBe(true);
    expect(mayFire(key("j", { target: input }), parseCombo("j"))).toBe(false);
    expect(mayFire(key("j", { target: input }), parseCombo("j"), true)).toBe(true);
    expect(mayFire(key("k", { target: input, metaKey: true }), parseCombo("mod+k"))).toBe(true);
  });
  it("treats Cmd, Ctrl and Alt as not plain", () => {
    expect(isPlainKey(key("g"))).toBe(true);
    expect(isPlainKey(key("g", { shiftKey: true }))).toBe(true);
    expect(isPlainKey(key("g", { metaKey: true }))).toBe(false);
  });
});

describe("key sequences", () => {
  const bindings = [
    { keys: ["g", "w"], id: "wallet" },
    { keys: ["g", "r"], id: "review" },
    { keys: ["g", "b"], id: "bounties" },
    { keys: ["?"], id: "help" },
  ];
  const press = (m: ReturnType<typeof createSequenceMatcher<string>>, keys: string, startMs = 0, gapMs = 100): (string | null)[] =>
    [...keys].map((k, i) => m.feed(k, startMs + i * gapMs));

  it("completes a two-key sequence", () => {
    const m = createSequenceMatcher(bindings);
    expect(press(m, "gw")).toEqual([null, "wallet"]);
  });
  it("shares the prefix between sequences", () => {
    const m = createSequenceMatcher(bindings);
    expect(press(m, "gr")).toEqual([null, "review"]);
    expect(press(m, "gb", 1000)).toEqual([null, "bounties"]);
  });
  it("fires a single key at once", () => {
    expect(createSequenceMatcher(bindings).feed("?", 0)).toBe("help");
  });
  it("reports the keys typed so far, for a hint", () => {
    const m = createSequenceMatcher(bindings);
    m.feed("g", 0);
    expect(m.pending()).toEqual(["g"]);
    m.feed("w", 50);
    expect(m.pending()).toEqual([]);
  });
  it("restarts when a key does not continue the sequence, so g g w still works", () => {
    const m = createSequenceMatcher(bindings);
    expect(press(m, "ggw")).toEqual([null, null, "wallet"]);
    expect(press(m, "gxgr", 5000)).toEqual([null, null, null, "review"]);
  });
  it("forgets a half-typed sequence after the timeout", () => {
    const m = createSequenceMatcher(bindings, 900);
    m.feed("g", 0);
    expect(m.feed("w", 2000)).toBeNull(); // too slow: "w" alone is nothing
    expect(press(m, "gw", 5000)).toEqual([null, "wallet"]);
  });
  it("is case-insensitive and resettable", () => {
    const m = createSequenceMatcher(bindings);
    m.feed("G", 0);
    expect(m.feed("W", 10)).toBe("wallet");
    m.feed("g", 100);
    m.reset();
    expect(m.pending()).toEqual([]);
  });
  it("accepts a sequence as a string or a list", () => {
    expect(sequenceKeys("g  w")).toEqual(["g", "w"]);
    expect(sequenceKeys(["g", "w"])).toEqual(["g", "w"]);
    expect(sequenceKeys("")).toEqual([]);
  });
  it("ignores bindings with no keys", () => {
    const m = createSequenceMatcher([{ keys: [], id: "none" }, { keys: ["x"], id: "x" }]);
    expect(m.feed("x", 0)).toBe("x");
  });
});
