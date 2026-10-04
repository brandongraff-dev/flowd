/**
 * The persisted overlay: what the visitor changed, as a diff against the immutable fixtures.
 *
 * The full demo world is about 20 MB, far over what localStorage holds, and almost all of it never changes. The store persists only
 *   - rows whose identity differs from their base row (edited or new),
 *   - tombstones for base rows that were removed,
 *   - docs that were edited,
 *   - the session, the demo clock and the id counters.
 * Unchanged tables are skipped in O(1) because the state shares the base table object. On rehydrate the overlay is laid back over the base.
 */

import { CONSTANTS, DEMO_NOW } from "@/lib/contract/types";
import { getBaseDoc, getBaseTable } from "./base";
import type { Clock, DemoState, Docs, Session } from "./state";
import { DOC_NAMES, ROW_TABLES, type DocName, type RowTableName } from "./tables";

/** Bump when the overlay shape or the meaning of a stored row changes; `migrateOverlay` handles older versions. */
export const OVERLAY_VERSION = 1;

export interface Overlay {
  v: typeof OVERLAY_VERSION;
  rows: Partial<Record<RowTableName, Record<string, unknown>>>;
  removed: Partial<Record<RowTableName, string[]>>;
  docs: Partial<Record<DocName, unknown>>;
  session: Session;
  clock: Clock;
  counters: Record<string, number>;
}

/** Diffs a state against the base. Cheap: untouched tables compare by reference. */
export function toOverlay(state: DemoState): Overlay {
  const rows: Overlay["rows"] = {};
  const removed: Overlay["removed"] = {};
  for (const t of ROW_TABLES) {
    const table = state[t] as Record<string, unknown>;
    const base = getBaseTable(t) as Record<string, unknown> | undefined;
    if (base !== undefined && table === base) continue;
    let changed: Record<string, unknown> | undefined;
    for (const [id, row] of Object.entries(table)) {
      if (base !== undefined && base[id] === row) continue;
      (changed ??= {})[id] = row;
    }
    if (changed) rows[t] = changed;
    const tomb = state.tombstones[t];
    if (tomb && tomb.length > 0) removed[t] = tomb;
  }
  const docs: Overlay["docs"] = {};
  for (const d of DOC_NAMES) {
    const base = getBaseDoc(d);
    if (base !== undefined && state[d] !== base) docs[d] = state[d];
  }
  return { v: OVERLAY_VERSION, rows, removed, docs, session: state.session, clock: state.clock, counters: state.counters };
}

/** True when the overlay carries no data change (just the default session and clock). */
export function overlayIsEmpty(o: Overlay): boolean {
  return Object.keys(o.rows).length === 0 && Object.keys(o.removed).length === 0 && Object.keys(o.docs).length === 0;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Upgrades a stored overlay to the current version, or returns null when it cannot be trusted (then the visitor starts from the seed). */
export function migrateOverlay(stored: unknown, fromVersion: number): Overlay | null {
  if (!isRecord(stored)) return null;
  // Version 0 never shipped; a stored value without `rows` is not an overlay.
  if (fromVersion === OVERLAY_VERSION && isRecord(stored.rows) && isRecord(stored.session) && isRecord(stored.clock)) {
    return {
      v: OVERLAY_VERSION,
      rows: stored.rows as Overlay["rows"],
      removed: isRecord(stored.removed) ? (stored.removed as Overlay["removed"]) : {},
      docs: isRecord(stored.docs) ? (stored.docs as Overlay["docs"]) : {},
      session: stored.session as unknown as Session,
      clock: stored.clock as unknown as Clock,
      counters: isRecord(stored.counters) ? (stored.counters as Record<string, number>) : {},
    };
  }
  return null;
}

/** Lays an overlay over a state: upserts rows, applies tombstones, restores docs, session, clock and counters (never lowering a counter). */
export function applyOverlay(state: DemoState, overlay: Overlay): DemoState {
  const out = { ...state } as unknown as Record<string, unknown>;
  const tombstones: DemoState["tombstones"] = { ...state.tombstones };
  for (const t of ROW_TABLES) {
    const upserts = overlay.rows[t];
    const gone = overlay.removed[t];
    if (!upserts && !gone) continue;
    const table = { ...(state[t] as Record<string, unknown>) };
    if (gone) {
      for (const id of gone) delete table[id];
      tombstones[t] = [...new Set([...(tombstones[t] ?? []), ...gone])];
    }
    if (upserts) Object.assign(table, upserts);
    out[t] = table;
  }
  for (const d of DOC_NAMES) if (overlay.docs[d] !== undefined) out[d] = overlay.docs[d] as Docs[typeof d];
  const counters = { ...state.counters };
  for (const [k, n] of Object.entries(overlay.counters)) if (typeof n === "number" && n > (counters[k] ?? 0)) counters[k] = n;
  const clock: Clock = {
    now: typeof overlay.clock.now === "string" ? overlay.clock.now : DEMO_NOW,
    advanced_hours: typeof overlay.clock.advanced_hours === "number" ? overlay.clock.advanced_hours : 0,
  };
  return { ...(out as unknown as DemoState), tombstones, counters, session: overlay.session, clock };
}

/** Constant re-exported for tests: where the demo world starts. */
export const WORLD_START = CONSTANTS.now;
