/**
 * Id sequences. New rows continue the numbering the fixtures use (`sub_0705`, `ledg_004278`, `txn_001634` ...), so ids stay unique, ordered and
 * deterministic: the same actions on the same world always create the same ids (tests and the mock API rely on it).
 *
 * `state.counters[seq]` holds the last number handed out. It starts at the highest number found in the tables (or, for a heavy table that is not
 * loaded, the row count the world manifest records) and is persisted with the overlay.
 */

import { SEQUENCES, type SequenceName } from "./tables";
import type { DemoState } from "./state";
import type { Auction, ChatThread, Creator, Offer, Submission, TestPlan, Webhook } from "@/lib/contract/types";

/** Zero-padded number: pad(7, 4) is "0007". */
export const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** The trailing number of ids that look like `<prefix><digits>`; 0 when none do. */
function maxSuffix(prefix: string, ids: Iterable<string | undefined>): number {
  let max = 0;
  for (const id of ids) {
    if (!id || !id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue;
    const n = Number.parseInt(rest, 10);
    if (n > max) max = n;
  }
  return max;
}

function* messageIds(s: DemoState, seq: "omsg" | "msg" | "bid" | "vid" | "whd" | "pm" | "cell"): Iterable<string | undefined> {
  switch (seq) {
    case "omsg":
      for (const o of Object.values(s.offers) as Offer[]) for (const m of o.thread) yield m.id;
      return;
    case "msg":
      for (const t of Object.values(s.threads) as ChatThread[]) for (const m of t.messages) yield m.id;
      return;
    case "bid":
      for (const a of Object.values(s.auctions) as Auction[]) for (const b of a.bids) yield b.id;
      return;
    case "vid":
      for (const sub of Object.values(s.submissions) as Submission[]) for (const v of sub.versions) yield v.video.asset_id;
      for (const sp of Object.values(s.specs)) yield sp.video.asset_id;
      return;
    case "whd":
      for (const w of Object.values(s.webhooks) as Webhook[]) for (const d of w.deliveries) yield d.id;
      return;
    case "pm":
      for (const c of Object.values(s.creators) as Creator[]) yield c.payout_method?.id;
      return;
    case "cell":
      for (const p of Object.values(s.test_plans) as TestPlan[]) for (const c of p.cells) yield c.id;
      return;
  }
}

/** Scans a world for the highest number used by a sequence. */
export function scanSequence(s: DemoState, seq: SequenceName): number {
  const def = SEQUENCES[seq];
  let max = 0;
  if (def.table === null) {
    max = maxSuffix(def.prefix, messageIds(s, seq as "omsg"));
  } else {
    const table = s[def.table] as unknown as Record<string, Record<string, unknown>>;
    const field = "field" in def ? (def.field as string) : "id";
    max = maxSuffix(
      def.prefix,
      (function* () {
        for (const row of Object.values(table)) yield row[field] as string | undefined;
      })(),
    );
    // A heavy table that is not loaded yet: the manifest's row count is the highest number (the ids run 1..n).
    if (!s.loaded[def.table]) max = Math.max(max, s.world.counts[def.table] ?? 0);
  }
  return max;
}

/** The starting counters of a world: one per sequence. */
export function initialCounters(s: DemoState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seq of Object.keys(SEQUENCES) as SequenceName[]) out[seq] = scanSequence(s, seq);
  return out;
}

/** The id for number `n` of a sequence. */
export const formatSequenceId = (seq: SequenceName, n: number): string => `${SEQUENCES[seq].prefix}${pad(n, SEQUENCES[seq].width)}`;

/** Lower-case slug for ids built from names ("Glow-up reveal!" becomes "glow-up-reveal"). */
export function slug(text: string, max = 32): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}
