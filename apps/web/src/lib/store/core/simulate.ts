/**
 * The demo world keeps moving: when the clock advances, live posts collect views, the funnel fills in (link and code conversions are tracked, MMP and
 * survey ones are estimated and never paid), and View Ledger snapshots are taken. Everything is deterministic (seeded by post and time), reproducible
 * on web, in tests and in the mock API.
 *
 * The curve: about 70% of lifetime views land in the first 24 hours (`NATURAL_FIRST_DAY_SHARE`), so views(h) = V72 x g(h) / g(72) with
 * g(h) = 1 - e^(-h/20) inside the 72-hour window, then a slow tail of up to 12% more over the following days. A new post's V72 comes from the
 * creator's median views at the Flow band; a post already collecting views extrapolates its own curve, so a tick never jumps.
 */

import type {
  AppMetricsDaily,
  Conversion,
  ConversionKind,
  ConversionSource,
  Country,
  IsoDate,
  IsoTimestamp,
  MoneyClockRow,
  Post,
  PostMetricsDaily,
  ViewSnapshot,
} from "@/lib/contract/types";
import {
  CONSTANTS,
  DAY_MS,
  HOUR_MS,
  conversionRunOnPost,
  confidenceFor,
  dateOf,
  hoursBetween,
  iso,
  predictedViews,
  rateForKind,
  reasonText,
  seededRng,
  toMs,
  type Rng,
} from "@/lib/engine";
import { pad } from "../ids";
import { recountBounty } from "./recount";
import type { Tx } from "./tx";

const TAU_H = 20;
const g = (h: number): number => 1 - Math.exp(-h / TAU_H);
const G_WINDOW = g(CONSTANTS.windows.view_window_hours);
const TAIL_SHARE = 0.12;
const TAIL_TAU_H = 96;
const TAIL_DAYS = 30;

/** Cumulative verified views at `h` hours after posting, given the 72-hour total. */
export function viewsAtHour(v72: number, h: number): number {
  const w = CONSTANTS.windows.view_window_hours;
  if (h <= 0) return 0;
  if (h <= w) return (v72 * g(h)) / G_WINDOW;
  return v72 * (1 + TAIL_SHARE * (1 - Math.exp(-(h - w) / TAIL_TAU_H)));
}

/** Probabilistic rounding: floor(x) plus one with probability frac(x). Deterministic for a given Rng. */
const draw = (rng: Rng, x: number): number => {
  if (x <= 0) return 0;
  const f = Math.floor(x);
  return f + (rng() < x - f ? 1 : 0);
};

const ratio = (num: number, den: number, min: number, fallback: number): number => (den >= min && num > 0 ? num / den : fallback);

/** The 72-hour view total of a post: extrapolated from what it has, or predicted from its creator's median views for a new post. */
export function projectedV72(tx: Tx, post: Post, now: IsoTimestamp): number {
  const h = hoursBetween(post.posted_at, now);
  if (h >= 1 && post.views > 0) return (post.views * G_WINDOW) / g(Math.min(h, CONSTANTS.windows.view_window_hours));
  const account = tx.get("social_accounts", post.social_account_id);
  const median = account?.median_views_28d ?? 8000;
  const jitter = 0.7 + seededRng(`v72|${post.id}`)() * 0.65;
  return Math.max(200, predictedViews(median, post.flow_band) * jitter);
}

const GEO_SPLIT: readonly Country[] = ["CA", "GB", "AU"];

function snapshotRow(tx: Tx, post: Post, takenAt: IsoTimestamp, verified: number, prev: ViewSnapshot | undefined, seq: number): ViewSnapshot {
  const us = tx.get("social_accounts", post.social_account_id)?.us_audience_ratio ?? 0.7;
  const rest = 1 - us;
  const geo: Partial<Record<Country, number>> = { US: Math.round(us * 100) / 100, CA: Math.round(rest * 0.3 * 100) / 100, GB: Math.round(rest * 0.3 * 100) / 100 };
  geo[GEO_SPLIT[2]] = Math.round((1 - (geo.US ?? 0) - (geo.CA ?? 0) - (geo.GB ?? 0)) * 100) / 100;
  return {
    id: `vsn_${post.id.slice("post_".length)}_${pad(seq, 3)}`,
    post_id: post.id,
    taken_at: takenAt,
    views_reported: verified,
    views_verified: verified,
    views_invalid: 0,
    delta_verified: Math.max(0, verified - (prev?.views_verified ?? 0)),
    source: "platform_api",
    sources: { fyp: 0.62, following: 0.16, profile: 0.08, search: 0.05, share: 0.05, other: 0.04 },
    geo,
    flags: [],
    fraud_score: post.fraud.score,
  };
}

export interface GrowthResult {
  posts: number;
  views: number;
  conversions: number;
  snapshots: number;
}

/** Everything the growth step touches, kept out of the per-post loop so tests can inspect it. */
interface GrowthCtx {
  rng: Rng;
  t0: IsoTimestamp;
  t1: IsoTimestamp;
}

function dayEdges(from: IsoTimestamp, to: IsoTimestamp): { date: IsoDate; start: number; end: number }[] {
  const out: { date: IsoDate; start: number; end: number }[] = [];
  let cursor = toMs(from);
  const end = toMs(to);
  while (cursor < end) {
    const nextMidnight = Math.floor(cursor / DAY_MS) * DAY_MS + DAY_MS;
    const stop = Math.min(nextMidnight, end);
    out.push({ date: dateOf(iso(cursor)), start: cursor, end: stop });
    cursor = stop;
  }
  return out;
}

/** Splits an integer across weights (largest remainder); falls back to the last slot when every weight is zero. */
function split(total: number, weights: readonly number[]): number[] {
  const wsum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  if (wsum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  const exact = weights.map((w) => (total * w) / wsum);
  const floors = exact.map(Math.floor);
  let rest = total - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  const out = [...floors];
  for (let k = 0; rest > 0 && k < order.length; k += 1, rest -= 1) out[order[k].i] += 1;
  return out;
}

/** Lookups built once per growth step so the per-post loop never scans a table. */
interface GrowthIndex {
  /** Pending conversion batches by "post|kind|source|date". */
  pending: Map<string, Conversion>;
  /** Money Clock rows by conversion id. */
  clockByConversion: Map<string, MoneyClockRow>;
  snapshotsByPost: Map<string, ViewSnapshot[]>;
}

function buildIndex(tx: Tx): GrowthIndex {
  const pending = new Map<string, Conversion>();
  for (const c of tx.all("conversions")) if (c.status === "pending") pending.set(`${c.post_id}|${c.kind}|${c.source}|${c.occurred_on}`, c);
  const clockByConversion = new Map<string, MoneyClockRow>();
  for (const r of tx.all("money_clock")) if (r.conversion_id) clockByConversion.set(r.conversion_id, r);
  const snapshotsByPost = new Map<string, ViewSnapshot[]>();
  for (const s of tx.all("view_snapshots")) {
    const list = snapshotsByPost.get(s.post_id);
    if (list) list.push(s);
    else snapshotsByPost.set(s.post_id, [s]);
  }
  for (const list of snapshotsByPost.values()) list.sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
  return { pending, clockByConversion, snapshotsByPost };
}

/** Upserts one conversion batch and, for a payable one, its Money Clock row. */
function addConversion(tx: Tx, idx: GrowthIndex, post: Post, p: { kind: ConversionKind; source: ConversionSource; quantity: number; date: IsoDate; at: IsoTimestamp }): number {
  if (p.quantity <= 0) return 0;
  const bounty = tx.must("bounties", post.bounty_id);
  const app = tx.must("apps", post.app_id);
  const key = `${post.id}|${p.kind}|${p.source}|${p.date}`;
  const existing = idx.pending.get(key);
  const payable = p.source === "link" || p.source === "code";
  const revenue = p.kind === "paid" ? p.quantity * app.avg_first_payment_cents : 0;
  let conv: Conversion;
  if (existing) {
    conv = tx.put("conversions", { ...existing, quantity: existing.quantity + p.quantity, revenue_cents: existing.revenue_cents + revenue });
  } else {
    conv = tx.put("conversions", {
      id: tx.nextId("conv"),
      post_id: post.id,
      link_id: post.tracking_link_id,
      app_id: post.app_id,
      bounty_id: post.bounty_id,
      creator_id: post.creator_id,
      kind: p.kind,
      source: p.source,
      confidence: confidenceFor(p.source),
      quantity: p.quantity,
      occurred_on: p.date,
      first_at: p.at,
      revenue_cents: revenue,
      country: "US",
      status: "pending",
      payable,
      capped: false,
    });
  }
  idx.pending.set(key, conv);
  if (payable) {
    const rate = rateForKind({ install: bounty.cpa_install_cents, trial: bounty.cpa_trial_cents, paid: bounty.cpa_paid_cents }, p.kind);
    if (rate > 0) {
      const mc = idx.clockByConversion.get(conv.id);
      const live = post.status === "live";
      const eta = conversionRunOnPost(p.kind, conv.first_at, post.posted_at);
      const amount = conv.quantity * rate;
      const row: MoneyClockRow = {
        id: mc?.id ?? tx.nextId("mc"),
        creator_id: post.creator_id,
        bounty_id: post.bounty_id,
        app_id: post.app_id,
        post_id: post.id,
        conversion_id: conv.id,
        source: p.kind === "install" ? "cpa_install" : p.kind === "trial" ? "cpa_trial" : "cpa_paid",
        state: live ? "accruing" : "pending",
        amount_cents: amount,
        estimated: live,
        earned_at: conv.first_at,
        eta_at: eta,
        reason: live ? "window_open" : "conversion_clearing",
        reason_text: "",
        label: `${app.name}: ${bounty.title}`,
      };
      row.reason_text = reasonText({ reason: row.reason, eta_at: eta, window_ends_at: post.window_ends_at });
      tx.put("money_clock", row);
      idx.clockByConversion.set(conv.id, row);
    }
  }
  return p.quantity;
}

/**
 * Advances every post from `t0` to `t1`: views and engagement, the funnel, conversion batches, per-day metrics, the app rollup and View Ledger
 * snapshots. Needs the heavy tables `post_metrics_daily`, `app_metrics_daily`, `conversions` and `view_snapshots` to be loaded.
 */
export function growPosts(tx: Tx, t0: IsoTimestamp, t1: IsoTimestamp): GrowthResult {
  const out: GrowthResult = { posts: 0, views: 0, conversions: 0, snapshots: 0 };
  const touchedBounties = new Set<string>();
  const idx = buildIndex(tx);
  const WINDOW_H = CONSTANTS.windows.view_window_hours;
  for (const post of tx.all("posts")) {
    if (post.status === "removed" || post.status === "clawed_back") continue;
    const hOld = Math.max(0, hoursBetween(post.posted_at, t0));
    const hNew = hoursBetween(post.posted_at, t1);
    if (hNew <= 0) continue;
    let v72: number;
    let target: number;
    if (post.status === "live" || hOld < WINDOW_H) {
      v72 = projectedV72(tx, post, t0);
      target = Math.round(viewsAtHour(v72, Math.min(hNew, WINDOW_H)));
      if (hNew >= WINDOW_H) target = Math.round(v72);
    } else if (hNew <= TAIL_DAYS * 24 && post.window_views > 0) {
      v72 = post.window_views;
      target = Math.round(viewsAtHour(v72, hNew));
    } else continue;
    const delta = Math.max(0, target - post.views);
    if (delta === 0) continue;
    const rng = seededRng(`grow|${post.id}|${t1}`);
    const slices = dayEdges(iso(Math.max(toMs(t0), toMs(post.posted_at))), t1);
    const weights = slices.map((s) => Math.max(0, viewsAtHour(v72, (s.end - toMs(post.posted_at)) / HOUR_MS) - viewsAtHour(v72, (s.start - toMs(post.posted_at)) / HOUR_MS)));
    const perDay = split(delta, weights);
    const likeRate = ratio(post.likes, post.views, 500, 0.055);
    const commentRate = ratio(post.comments, post.views, 500, 0.0035);
    const shareRate = ratio(post.shares, post.views, 500, 0.0045);
    const saveRate = ratio(post.saves, post.views, 500, 0.009);
    const clickRate = ratio(post.funnel.clicks, post.funnel.views, 2000, CONSTANTS.funnel_defaults.view_to_visit);
    const installRate = ratio(post.funnel.installs, post.funnel.clicks, 30, CONSTANTS.funnel_defaults.visit_to_install);
    const trialRate = ratio(post.funnel.trials, post.funnel.installs, 20, CONSTANTS.funnel_defaults.install_to_trial);
    const paidRate = ratio(post.funnel.paid, post.funnel.trials, 10, CONSTANTS.funnel_defaults.trial_to_paid);
    const funnel = { ...post.funnel };
    let likes = post.likes;
    let comments = post.comments;
    let shares = post.shares;
    let saves = post.saves;
    const inCpaWindow = hNew <= CONSTANTS.pay.cpa_window_days * 24;
    for (const [i, slice] of slices.entries()) {
      const dv = perDay[i];
      if (dv <= 0) continue;
      const dLikes = draw(rng, dv * likeRate);
      const dComments = draw(rng, dv * commentRate);
      const dShares = draw(rng, dv * shareRate);
      const dSaves = draw(rng, dv * saveRate);
      const dClicks = inCpaWindow ? draw(rng, dv * clickRate) : 0;
      const dInstalls = Math.min(dClicks, draw(rng, dClicks * installRate));
      const dTrials = Math.min(dInstalls, draw(rng, dInstalls * trialRate));
      const dPaid = Math.min(dTrials, draw(rng, dTrials * paidRate));
      const dEstInstalls = draw(rng, dInstalls * 0.34);
      const dEstTrials = Math.min(dEstInstalls, draw(rng, dTrials * 0.4));
      const dEstPaid = Math.min(dEstTrials, draw(rng, dPaid * 0.45));
      likes += dLikes;
      comments += dComments;
      shares += dShares;
      saves += dSaves;
      funnel.clicks += dClicks;
      funnel.installs += dInstalls;
      funnel.trials += dTrials;
      funnel.paid += dPaid;
      funnel.est_installs += dEstInstalls;
      funnel.est_trials += dEstTrials;
      funnel.est_paid += dEstPaid;
      // per-day metrics row (the grain the charts read)
      const key = `${post.id}|${slice.date}`;
      const prev: PostMetricsDaily = tx.get("post_metrics_daily", key) ?? { post_id: post.id, date: slice.date, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0 };
      tx.put("post_metrics_daily", { ...prev, views: prev.views + dv, likes: prev.likes + dLikes, comments: prev.comments + dComments, shares: prev.shares + dShares, saves: prev.saves + dSaves, clicks: prev.clicks + dClicks, installs: prev.installs + dInstalls, trials: prev.trials + dTrials, paid: prev.paid + dPaid, est_installs: prev.est_installs + dEstInstalls, est_trials: prev.est_trials + dEstTrials, est_paid: prev.est_paid + dEstPaid });
      // the app rollup
      const appKey = `${post.app_id}|${slice.date}`;
      const app = tx.get("apps", post.app_id);
      const aprev: AppMetricsDaily = tx.get("app_metrics_daily", appKey) ?? { app_id: post.app_id, date: slice.date, views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0, revenue_cents: 0, posts_live: 0, new_posts: 0, new_submissions: 0, approvals: 0, creator_pay_cents: 0, fee_cents: 0 };
      tx.put("app_metrics_daily", { ...aprev, views: aprev.views + dv, clicks: aprev.clicks + dClicks, installs: aprev.installs + dInstalls, trials: aprev.trials + dTrials, paid: aprev.paid + dPaid, est_installs: aprev.est_installs + dEstInstalls, est_trials: aprev.est_trials + dEstTrials, est_paid: aprev.est_paid + dEstPaid, revenue_cents: aprev.revenue_cents + dPaid * (app?.avg_first_payment_cents ?? 0) });
      // conversion batches: tracked (link and code) and estimated (MMP, survey, modelled)
      const at = iso(Math.max(slice.start, slice.end - 1000));
      const linkShare = 0.62;
      const split2 = (n: number): [number, number] => {
        const a = Math.round(n * linkShare);
        return [a, n - a];
      };
      const [il, ic] = split2(dInstalls);
      const [tl, tc] = split2(dTrials);
      const [pl, pc] = split2(dPaid);
      out.conversions += addConversion(tx, idx, post, { kind: "install", source: "link", quantity: il, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "install", source: "code", quantity: ic, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "trial", source: "link", quantity: tl, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "trial", source: "code", quantity: tc, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "paid", source: "link", quantity: pl, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "paid", source: "code", quantity: pc, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "install", source: "mmp", quantity: dEstInstalls, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "trial", source: "survey", quantity: dEstTrials, date: slice.date, at });
      out.conversions += addConversion(tx, idx, post, { kind: "paid", source: "modelled", quantity: dEstPaid, date: slice.date, at });
    }
    const views = post.views + delta;
    funnel.views = views;
    const windowViews = post.status === "live" ? views : post.window_views;
    tx.put("posts", { ...post, views, window_views: windowViews, likes, comments, shares, saves, funnel });
    const link = tx.get("attribution_links", post.tracking_link_id);
    if (link) tx.patch("attribution_links", link.id, { clicks: funnel.clicks, installs: funnel.installs, trials: funnel.trials, paid: funnel.paid, ...(funnel.clicks > link.clicks ? { last_click_at: t1 } : {}) });
    touchedBounties.add(post.bounty_id);
    out.posts += 1;
    out.views += delta;

    // View Ledger: a snapshot every 6 hours inside the window, then every 7 days
    const snaps = idx.snapshotsByPost.get(post.id) ?? [];
    let last = snaps[snaps.length - 1];
    let seq = snaps.length;
    const times: number[] = [];
    for (let k = 0; k <= 12; k += 1) times.push(toMs(post.posted_at) + k * CONSTANTS.windows.snapshot_interval_hours * HOUR_MS);
    for (let w = 1; w <= 5; w += 1) times.push(toMs(post.posted_at) + (72 + 168 * w) * HOUR_MS);
    for (const when of times) {
      if (when <= toMs(t0) && !(toMs(post.posted_at) === when && snaps.length === 0)) continue;
      if (when > toMs(t1)) continue;
      const h = (when - toMs(post.posted_at)) / HOUR_MS;
      const verified = h >= WINDOW_H && hOld < WINDOW_H && h === WINDOW_H ? views : Math.round(viewsAtHour(v72, h));
      const snap = snapshotRow(tx, post, iso(when), Math.min(verified, views), last, seq + 1);
      tx.put("view_snapshots", snap);
      last = snap;
      seq += 1;
      out.snapshots += 1;
    }
  }
  for (const id of touchedBounties) recountBounty(tx, id);
  return out;
}

/** The snapshot at the moment a post is created (views 0), so the View Ledger is never empty. */
export function openSnapshot(tx: Tx, post: Post): void {
  tx.put("view_snapshots", snapshotRow(tx, post, post.posted_at, 0, undefined, 1));
}
