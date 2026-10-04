/**
 * Keyboard shortcut matching, pure and DOM-free so it can be tested in Node. `use-hotkeys.ts` wires it to `keydown`.
 *
 * Two shapes:
 *  - a COMBO is one chord: "mod+k" (Cmd on Apple, Ctrl elsewhere), "shift+/", "?", "j".
 *  - a SEQUENCE is keys pressed one after another: "g" then "w" (the palette's go-to shortcuts).
 */

/** The parts of a `KeyboardEvent` the matcher reads. A real event satisfies it. */
export interface KeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** `isComposing`: an IME is mid-composition, so keys are not shortcuts. */
  isComposing?: boolean;
  repeat?: boolean;
  target?: unknown;
}

export interface ParsedCombo {
  /** Lower-cased key name: "k", "/", "?", "escape", "enter". */
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const KEY_ALIASES: Readonly<Record<string, string>> = { esc: "escape", return: "enter", space: " ", spacebar: " ", plus: "+", del: "delete" };

/** "mod+shift+k" to a structured combo. Unknown modifiers are ignored; the last part is the key. */
export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter((p, i, all) => p !== "" || i === all.length - 1);
  // "+" itself ("mod++") leaves an empty last part: treat it as the plus key.
  const rawKey = parts[parts.length - 1] ?? "";
  const key = rawKey === "" ? "+" : (KEY_ALIASES[rawKey] ?? rawKey);
  const mods = parts.slice(0, -1);
  return {
    key,
    mod: mods.includes("mod") || mods.includes("cmd") || mods.includes("meta") || mods.includes("ctrl") || mods.includes("control"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt") || mods.includes("option"),
  };
}

const isLetterOrDigit = (key: string): boolean => /^[a-z0-9]$/.test(key);

/**
 * Does the event match the combo? `mod` accepts Cmd or Ctrl. Shift must match for letters and digits; for a symbol ("?", "/") it is
 * implied by the key itself and is not compared. Auto-repeat and IME composition never match.
 */
export function matchesCombo(event: KeyEventLike, combo: string | ParsedCombo): boolean {
  const wanted = typeof combo === "string" ? parseCombo(combo) : combo;
  if (event.isComposing || event.repeat) return false;
  if (event.key.toLowerCase() !== wanted.key) return false;
  const modPressed = Boolean(event.metaKey || event.ctrlKey);
  if (wanted.mod !== modPressed) return false;
  if (Boolean(event.altKey) !== wanted.alt) return false;
  const shiftMatters = isLetterOrDigit(wanted.key) || wanted.key.length > 1;
  if (shiftMatters && Boolean(event.shiftKey) !== wanted.shift) return false;
  return true;
}

/** Is the event's target something people type into? Duck-typed, so it works with any DOM and in Node. */
export function isEditableTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown; getAttribute?: (name: string) => string | null };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable === true) return true;
  const role = typeof el.getAttribute === "function" ? el.getAttribute("role") : null;
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** A bare key (no Cmd, Ctrl or Alt) is a plain typing key. Used to decide whether a shortcut may fire while focus is in a field. */
export const isPlainKey = (event: KeyEventLike): boolean => !event.metaKey && !event.ctrlKey && !event.altKey;

/**
 * Should a shortcut fire for this event? Chords with a modifier always may; a bare key does not while focus is in a text field
 * (so "j" never fires while someone types a comment) unless `allowInInputs`.
 */
export function mayFire(event: KeyEventLike, combo: ParsedCombo, allowInInputs = false): boolean {
  if (allowInInputs || combo.mod || combo.alt) return true;
  return !isEditableTarget(event.target);
}

// ── sequences ──────────────────────────────────────────────────────────────────────────────────

export interface SequenceBinding<T = string> {
  /** The keys in order: ["g", "w"]. */
  keys: readonly string[];
  /** What to return when it completes. */
  id: T;
}

export interface SequenceMatcher<T> {
  /**
   * Feeds one key press. Returns the id of a completed sequence, or null. A key that does not continue the current
   * sequence restarts it (so "g g w" still finds "g w"); a pause longer than the timeout restarts it too.
   */
  feed(key: string, atMs: number): T | null;
  /** The keys typed so far (for a "g..." hint). */
  pending(): readonly string[];
  reset(): void;
}

/** A matcher over many sequences that share prefixes ("g w", "g r", "g f"). Pure: pass the time in. */
export function createSequenceMatcher<T>(bindings: readonly SequenceBinding<T>[], timeoutMs = 900): SequenceMatcher<T> {
  const table = bindings.map((b) => ({ keys: b.keys.map((k) => k.toLowerCase()), id: b.id })).filter((b) => b.keys.length > 0);
  let typed: string[] = [];
  let last = Number.NEGATIVE_INFINITY;

  const prefixOf = (keys: readonly string[]): boolean => table.some((b) => b.keys.length > keys.length && keys.every((k, i) => b.keys[i] === k));

  return {
    feed(rawKey, atMs) {
      const key = rawKey.toLowerCase();
      if (atMs - last > timeoutMs) typed = [];
      last = atMs;
      let candidate = [...typed, key];
      if (!prefixOf(candidate) && !table.some((b) => b.keys.length === candidate.length && candidate.every((k, i) => b.keys[i] === k))) {
        // Not a continuation: try the key as a fresh start.
        candidate = [key];
      }
      const done = table.find((b) => b.keys.length === candidate.length && candidate.every((k, i) => b.keys[i] === k));
      if (done) {
        typed = [];
        return done.id;
      }
      typed = prefixOf(candidate) ? candidate : [];
      return null;
    },
    pending: () => typed,
    reset() {
      typed = [];
      last = Number.NEGATIVE_INFINITY;
    },
  };
}

/** "g w" or ["g", "w"] to the key list. */
export const sequenceKeys = (sequence: string | readonly string[]): string[] => (typeof sequence === "string" ? sequence.trim().split(/\s+/).filter(Boolean) : [...sequence]);
