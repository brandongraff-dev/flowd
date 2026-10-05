/**
 * The View Ledger of one post: timestamped, source-labelled snapshots (verified vs excluded views, traffic mix, the bot-flag cause in plain words),
 * the conversions with their Tracked / Estimated labels, the per-video cap, the dated earnings timeline and the dispute path.
 */

import type { Conversion, DisputeStatus, Retention, TrafficSource, ViewExclusion, ViewSnapshot } from "@/lib/contract/types";
import { hoursBetween, sourceChip } from "@/lib/engine";
import { defineSelector, groupBy, type Db } from "../select";
import { postView, POST_VIEW_KEYS, type PostView, type PostViewDb } from "./posts";

export interface ConversionRow extends Conversion {
  /** "Tracked" or "Estimated", the label of its source, and whether CPA pays on it. */
  chip: { label: string; kind: "tracked" | "estimated"; pays: boolean };
}

export interface LedgerEvent {
  at: string;
  kind: "settled" | "cleared" | "paid" | "clawback";
  amount_cents: number;
  memo: string;
}

export interface PostLedger {
  /** The snapshot and conversion tables are still loading; the post itself is ready. */
  loading: boolean;
  post?: PostView;
  /** Oldest first. 13 across the 72-hour window (every 6 hours), then weekly. */
  snapshots: readonly ViewSnapshot[];
  /** One point per snapshot for the chart: reported, verified and excluded views, with hours since posting. */
  series: readonly { at: string; hours: number; reported: number; verified: number; excluded: number }[];
  views: { reported: number; verified: number; excluded: number; window_verified: number };
  /** Traffic sources and audience countries at the latest snapshot that recorded them. */
  sources: readonly { source: TrafficSource; ratio: number }[];
  geo: readonly { country: string; ratio: number }[];
  /** Why views were excluded, in plain words, from the latest snapshot that excluded any. */
  exclusions: readonly ViewExclusion[];
  /** One sentence for the bot-flag cause, or null when nothing was excluded. */
  bot_flag_cause: string | null;
  conversions: readonly ConversionRow[];
  /** Earnings on the ledger for this post: settled, cleared, paid and any clawback, in order. */
  earnings: readonly LedgerEvent[];
  retention?: Retention;
  /** The creator can open a dispute from this page (own post, not removed, none open). */
  can_dispute: boolean;
  /** The status of the open dispute, if any. */
  dispute_status?: DisputeStatus;
}

type PostLedgerDb = PostViewDb & Db<"view_snapshots" | "conversions" | "ledger" | "loaded" | "session">;

export const selectPostLedger = defineSelector(
  [...POST_VIEW_KEYS, "view_snapshots", "conversions", "ledger", "loaded", "session"] as const,
  (db: PostLedgerDb, id: string | undefined): PostLedger => {
    const loading = db.loaded.view_snapshots !== true || db.loaded.conversions !== true;
    const p = id ? db.posts[id] : undefined;
    if (!p) return { loading, snapshots: [], series: [], views: { reported: 0, verified: 0, excluded: 0, window_verified: 0 }, sources: [], geo: [], exclusions: [], bot_flag_cause: null, conversions: [], earnings: [], can_dispute: false };
    const view = postView(db, p);
    const snapshots = groupBy(db.view_snapshots, "post", (s) => s.post_id)
      .get(p.id)
      .slice()
      .sort((a, b) => (a.taken_at < b.taken_at ? -1 : a.taken_at > b.taken_at ? 1 : 0));
    const last = snapshots[snapshots.length - 1];
    const withSources = [...snapshots].reverse().find((s) => s.sources !== undefined);
    const withGeo = [...snapshots].reverse().find((s) => s.geo !== undefined);
    const excluded = [...snapshots].reverse().find((s) => (s.exclusions?.length ?? 0) > 0);
    const legs = groupBy(db.ledger, "post", (e) => e.post_id).get(p.id).filter((e) => e.account === `creator:${p.creator_id}`);
    const events: LedgerEvent[] = [];
    for (const e of legs) {
      if (e.entry_type === "clawback") {
        events.push({ at: e.posted_at, kind: "clawback", amount_cents: e.amount_cents, memo: e.memo });
        continue;
      }
      if (e.amount_cents <= 0) continue;
      events.push({ at: e.posted_at, kind: "settled", amount_cents: e.amount_cents, memo: e.memo });
      if (e.cleared_at) events.push({ at: e.cleared_at, kind: "cleared", amount_cents: e.amount_cents, memo: e.memo });
      if (e.paid_at) events.push({ at: e.paid_at, kind: "paid", amount_cents: e.amount_cents, memo: e.memo });
    }
    events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const mine = db.session.creator_id === p.creator_id;
    return {
      loading,
      post: view,
      snapshots,
      series: snapshots.map((s) => ({ at: s.taken_at, hours: Math.max(0, hoursBetween(p.posted_at, s.taken_at)), reported: s.views_reported, verified: s.views_verified, excluded: s.views_invalid })),
      views: { reported: last?.views_reported ?? p.views, verified: last?.views_verified ?? p.views, excluded: last?.views_invalid ?? p.views_invalid, window_verified: p.window_views },
      sources: Object.entries(withSources?.sources ?? {})
        .map(([source, ratio]) => ({ source: source as TrafficSource, ratio: ratio ?? 0 }))
        .sort((a, b) => b.ratio - a.ratio),
      geo: Object.entries(withGeo?.geo ?? {})
        .map(([country, ratio]) => ({ country, ratio: ratio ?? 0 }))
        .sort((a, b) => b.ratio - a.ratio),
      exclusions: excluded?.exclusions ?? [],
      bot_flag_cause: excluded ? (excluded.exclusions ?? []).map((x) => x.detail).join(" ") || excluded.note || null : null,
      conversions: groupBy(db.conversions, "post", (c) => c.post_id)
        .get(p.id)
        .map((c): ConversionRow => ({ ...c, chip: sourceChip(c.source) }))
        .sort((a, b) => (a.first_at < b.first_at ? 1 : -1)),
      earnings: events,
      retention: p.retention,
      can_dispute: mine && p.status !== "removed" && view.dispute === undefined,
      ...(view.dispute ? { dispute_status: view.dispute.status } : {}),
    };
  },
  { ensure: ["view_snapshots", "conversions"] },
);

