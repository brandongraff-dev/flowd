/**
 * Things that happen because time passes (run by the demo clock, see `tick.ts`): the review SLA and its timeout policy, expired revisions, approved
 * videos nobody used, bounties starting, ending and settling, rights expiry alerts, the Daily Drop, tournaments and running ads.
 */

import type { Ad, AdDaily, DailyDrop, DropItem, Spec, Tournament } from "@/lib/contract/types";
import {
  CONSTANTS,
  addDays,
  addHours,
  adMustStop,
  adCommissionTxn,
  adFeeTxn,
  clockLabel,
  dateOf,
  deriveGrantStatus,
  dueExpiryAlerts,
  formatMoney,
  hoursBetween,
  makeArtSeed,
  mulRate,
  reviewClock,
  seededRng,
  settleBounty,
  spotsLeft,
  timeoutAction,
  toMs,
} from "@/lib/engine";
import { addPlatformEarning, earningRows } from "./earnings";
import { applyEscrow, escrowOf, releaseFor } from "./escrow";
import { notifyAdmins, notifyBrand, notifyCreator, notify } from "./notify";
import { recountBounty } from "./recount";
import { finalizeApproval } from "./review";
import { refreshCreator, refreshReputation, refreshBrandScorecard } from "./creator-stats";
import type { Tx } from "./tx";

// ── review SLA, timeout policy and expiry ──────────────────────────────────────────────────────

/**
 * Walks every submission in review: the SLA state follows the hours in the queue (on track, stale from 48 hours, breached after 72), a stale video warns the
 * brand once, and a breached one follows the brand's timeout policy: approve if every QA check is clean, or escalate to the owner and Ops.
 */
export function advanceReviewSla(tx: Tx): { stale: number; breached: number; auto_approved: number } {
  const out = { stale: 0, breached: 0, auto_approved: 0 };
  for (const s of tx.all("submissions")) {
    if (s.status !== "in_review") continue;
    const bounty = tx.get("bounties", s.bounty_id);
    const brand = tx.get("brands", s.brand_id);
    if (!bounty || !brand) continue;
    const entered = s.versions[s.version - 1]?.submitted_at ?? s.submitted_at;
    const clock = reviewClock({ entered_review_at: entered, now: tx.now, sla_hours: bounty.review_sla_hours });
    if (clock.state === s.sla_state) continue;
    if (clock.state === "stale") {
      tx.patch("submissions", s.id, { sla_state: "stale", updated_at: tx.now });
      notifyBrand(tx, s.brand_id, { kind: "review_sla_warning", title: `A video has waited ${Math.floor(clock.hours_in_queue)} hours`, body: `Decide by ${clockLabel(clock.due_at)} UTC to stay inside the ${bounty.review_sla_hours}-hour review promise.`, route: `/brand/review/${s.id}`, ref_kind: "submission", ref_id: s.id, member_id: bounty.owner_member_id });
      out.stale += 1;
      continue;
    }
    if (clock.state === "breached") {
      const v = s.versions[s.version - 1];
      const clean = v ? v.qa_fail === 0 && v.qa_warn === 0 : false;
      const action = timeoutAction({ policy: brand.timeout_policy, hours_in_queue: clock.hours_in_queue, qa_clean: clean });
      if (action === "approve") {
        finalizeApproval(tx, s.id, { action: "timeout_approve", summary: "Approved automatically: the 72-hour review window passed and every QA check was clean." });
        out.auto_approved += 1;
        continue;
      }
      tx.patch("submissions", s.id, { sla_state: "breached", sla_breached_at: clock.due_at, updated_at: tx.now });
      notifyBrand(tx, s.brand_id, { kind: "review_sla_warning", title: "A video passed the 72-hour review promise", body: "It has been escalated to the workspace owner and the SLA desk. Your reliability score takes a hit until it is decided.", route: `/brand/review/${s.id}`, ref_kind: "submission", ref_id: s.id });
      notifyAdmins(tx, { kind: "review_sla_warning", title: `SLA breach at ${brand.name}`, body: `${bounty.title}: ${Math.floor(clock.hours_in_queue)} hours in the queue.`, route: "/admin/sla", ref_kind: "submission", ref_id: s.id });
      out.breached += 1;
    }
  }
  return out;
}

/**
 * Closes things that were left waiting: a requested revision not resubmitted in 14 days expires; an approved video not posted in 30 days is released to the
 * Spec Market (the brand keeps first refusal for seven days); a bounty that ended without a decision on its last videos expires them.
 */
export function expireStale(tx: Tx): { expired: number; released: number } {
  let expired = 0;
  let released = 0;
  for (const s of tx.all("submissions")) {
    const bounty = tx.get("bounties", s.bounty_id);
    if (!bounty) continue;
    if (s.status === "changes_requested" && s.decision && hoursBetween(s.decision.decided_at, tx.now) >= CONSTANTS.review.revision_expiry_days * 24) {
      releaseFor(tx, s.bounty_id, s.reserved_cents);
      tx.patch("submissions", s.id, { status: "expired", reserved_cents: 0, updated_at: tx.now });
      notifyCreator(tx, s.creator_id, { kind: "system_notice", title: `Revision window closed: "${bounty.title}"`, body: `${CONSTANTS.review.revision_expiry_days} days passed without a resubmission. Your reservation is released; nothing is charged to you.`, path: `submission/${s.id}`, ref_kind: "submission", ref_id: s.id });
      recountBounty(tx, s.bounty_id);
      expired += 1;
    } else if (s.status === "approved" && s.approved_at && hoursBetween(s.approved_at, tx.now) >= CONSTANTS.review.unused_release_days * 24) {
      releaseFor(tx, s.bounty_id, s.reserved_cents);
      tx.patch("submissions", s.id, { status: "released", reserved_cents: 0, released_at: tx.now, updated_at: tx.now });
      const spec = releaseToSpecMarket(tx, s.id);
      notifyCreator(tx, s.creator_id, { kind: "system_notice", title: `Your approved video moved to the Spec Market`, body: `"${bounty.title}" was not posted in ${CONSTANTS.review.unused_release_days} days. The brand has ${CONSTANTS.review.first_refusal_days} days of first refusal; then any brand can license it and you are paid.`, path: `spec/${spec.id}`, ref_kind: "spec", ref_id: spec.id });
      recountBounty(tx, s.bounty_id);
      released += 1;
    }
  }
  return { expired, released };
}

/** An approved video nobody used becomes a spec in first refusal. */
function releaseToSpecMarket(tx: Tx, submissionId: string): Spec {
  const s = tx.must("submissions", submissionId);
  const bounty = tx.must("bounties", s.bounty_id);
  const app = tx.must("apps", s.app_id);
  const v = s.versions[s.version - 1];
  const analysis = tx.get("video_analyses", `va_${s.id.slice(4)}_v${s.version}`);
  const price = Math.min(CONSTANTS.specs.price_cap_cents, Math.max(CONSTANTS.specs.price_floor_cents, Math.round(bounty.pay_math.median_cents * 0.9)));
  const id = tx.nextId("spec");
  const spec: Spec = {
    id,
    creator_id: s.creator_id,
    title: s.title,
    description: `Approved for "${bounty.title}" and not used. Made by a creator who is paid on every licence.`,
    status: "first_refusal",
    source: "released_from_bounty",
    art: v.video.art,
    video: v.video,
    ...(s.format_id ? { format_id: s.format_id } : {}),
    hook_text: analysis?.hook.text ?? s.title,
    hook_type: analysis?.hook.hook_type ?? "direct_question",
    category: app.category,
    flow_band: s.flow_band,
    flow_points: s.flow_points,
    hook_band: s.hook_band,
    hook_points: s.hook_points,
    qa_pass: v.qa_pass,
    qa_warn: v.qa_warn,
    qa_fail: v.qa_fail,
    tags: analysis?.tags ?? { hook_type: "direct_question", hook_words: s.title.split(/\s+/).slice(0, 4).join(" "), time_to_app_reveal_ms: 2500, cta_type: "link_in_bio" },
    price_cents: price,
    paid_ads_days: CONSTANTS.specs.default_paid_ads_days,
    exclusive: false,
    rights_card: s.rights_card,
    stats: { previews: 0, saves: 0, licenses: 0 },
    licenses: [],
    source_submission_id: s.id,
    source_bounty_id: s.bounty_id,
    source_brand_id: s.brand_id,
    first_refusal_ends_at: addDays(tx.now, CONSTANTS.review.first_refusal_days),
    created_at: tx.now,
    updated_at: tx.now,
  };
  return tx.put("specs", spec);
}

// ── bounties ───────────────────────────────────────────────────────────────────────────────────

/**
 * Starts scheduled bounties, ends the ones past their end date, and settles ended bounties once every post window and 30-day conversion window is
 * closed: the unspent budget and unused fee reserve return to the wallet in one transaction.
 */
export function advanceBounties(tx: Tx): { started: number; ended: number; settled: number } {
  const out = { started: 0, ended: 0, settled: 0 };
  for (const b0 of tx.all("bounties")) {
    let b = b0;
    if (b.status === "scheduled" && toMs(b.starts_at) <= toMs(tx.now)) {
      b = tx.patch("bounties", b.id, { status: "live", published_at: b.published_at ?? tx.now, updated_at: tx.now });
      notifyBrand(tx, b.brand_id, { kind: "bounty_funded", title: `"${b.title}" is live`, body: "It reached its start date and is open to creators.", route: `/brand/bounties/${b.id}`, ref_kind: "bounty", ref_id: b.id });
      out.started += 1;
    }
    if ((b.status === "live" || b.status === "paused" || b.status === "filled") && toMs(b.ends_at) <= toMs(tx.now)) {
      b = tx.patch("bounties", b.id, { status: "ended", ended_at: b.ends_at, updated_at: tx.now });
      out.ended += 1;
    }
    if (b.status !== "ended") continue;
    const posts = tx.all("posts").filter((p) => p.bounty_id === b.id);
    const lastPost = posts.map((p) => toMs(p.posted_at)).sort((x, y) => y - x)[0];
    const conversionsClosed = lastPost === undefined || toMs(tx.now) >= lastPost + CONSTANTS.pay.cpa_window_days * 86_400_000;
    const open = tx.all("submissions").filter((s) => s.bounty_id === b.id && ["qa_pending", "in_review", "changes_requested", "approved", "appealed"].includes(s.status));
    const endedFor = b.ended_at ? hoursBetween(b.ended_at, tx.now) : 0;
    // Videos still waiting when a bounty has been over for 72 hours are closed (the brand had its review window).
    if (open.length > 0 && endedFor >= CONSTANTS.review.sla_hours) {
      for (const s of open) {
        releaseFor(tx, b.id, s.reserved_cents);
        tx.patch("submissions", s.id, { status: "expired", reserved_cents: 0, updated_at: tx.now });
        notifyCreator(tx, s.creator_id, { kind: "system_notice", title: `"${b.title}" has ended`, body: "The bounty ended before a decision. Your reservation is released and nothing was charged to you.", path: `submission/${s.id}`, ref_kind: "submission", ref_id: s.id });
      }
      recountBounty(tx, b.id);
    }
    const stillOpen = tx.all("submissions").some((s) => s.bounty_id === b.id && ["qa_pending", "in_review", "changes_requested", "approved", "appealed"].includes(s.status));
    const livePost = posts.some((p) => p.status === "live");
    if (stillOpen || livePost || !conversionsClosed || !b.funded) continue;
    const fresh = tx.must("bounties", b.id);
    const settled = settleBounty({ state: escrowOf(fresh), txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: b.brand_id, bounty_id: b.id, title: b.title });
    if (settled.txn) tx.post(settled.txn);
    applyEscrow(tx, b.id, settled.state, { status: "settled", settled_at: tx.now });
    notifyBrand(tx, b.brand_id, { kind: "bounty_funded", title: `"${b.title}" is settled`, body: settled.refund_cents > 0 ? `${formatMoney(settled.refund_cents)} of unspent budget and fee reserve returned to your wallet.` : "Every dollar of the pool was used.", amount_cents: settled.refund_cents, route: `/brand/bounties/${b.id}`, ref_kind: "bounty", ref_id: b.id });
    out.settled += 1;
  }
  return out;
}

// ── rights ─────────────────────────────────────────────────────────────────────────────────────

/** Expiry alerts at 30, 14 and 7 days, status changes (expiring, expired), and ads that must stop because their rights or Spark code ended. */
export function advanceRights(tx: Tx): { alerts: number; expired: number; ads_stopped: number } {
  const out = { alerts: 0, expired: 0, ads_stopped: 0 };
  for (const g of tx.all("rights_grants")) {
    if (g.status === "revoked" || !g.ends_at) continue;
    const status = deriveGrantStatus({ status: g.status, ends_at: g.ends_at, revoked_at: g.revoked_at, now: tx.now });
    const alerts = dueExpiryAlerts({ ends_at: g.ends_at, alerts_sent: g.alerts_sent, now: tx.now });
    const patch: Partial<typeof g> = {};
    if (status !== g.status) patch.status = status;
    if (alerts.send !== null) {
      patch.alerts_sent = [...new Set([...g.alerts_sent, ...alerts.due])].sort((a, b) => b - a);
      const post = tx.get("posts", g.post_id);
      const label = post ? `@${tx.get("creators", g.creator_id)?.handle ?? "creator"}'s video` : "a video";
      notifyBrand(tx, g.brand_id, { kind: "rights_expiring", title: `Paid-ad rights end in ${alerts.send} days`, body: `${label}. Renew for ${formatMoney(g.renewal_price_cents)} per 30 days or the ad stops.`, route: "/brand/rights", ref_kind: "rights_grant", ref_id: g.id });
      notifyCreator(tx, g.creator_id, { kind: "rights_expiring", title: `A licence on your video ends in ${alerts.send} days`, body: "The brand can renew it. You are paid 25% of your base fee for every extra 30 days.", path: "rights", ref_kind: "rights_grant", ref_id: g.id });
      out.alerts += 1;
    }
    if (status === "expired" && g.status !== "expired") out.expired += 1;
    if (Object.keys(patch).length > 0) tx.patch("rights_grants", g.id, { ...patch, updated_at: tx.now });
  }
  for (const ad of tx.all("ads")) {
    if (ad.status !== "live" && ad.status !== "paused" && ad.status !== "fatigued" && ad.status !== "authorised") continue;
    const stop = adMustStop({ now: tx.now, code_expires_at: ad.code_expires_at, rights_ends_at: ad.rights_ends_at });
    if (!stop.stop) continue;
    tx.patch("ads", ad.id, { status: "expired", ended_at: tx.now });
    notifyBrand(tx, ad.brand_id, { kind: "ad_live", title: "An ad stopped automatically", body: stop.reason ?? "Its rights ended.", route: "/brand/promote", ref_kind: "ad", ref_id: ad.id });
    out.ads_stopped += 1;
  }
  return out;
}

// ── ads ────────────────────────────────────────────────────────────────────────────────────────

/** Accrues a day of results for every running ad; commission (10% of ad-attributed revenue for 60 days) and the 1% platform fee follow in the weekly settlement. */
export function advanceAds(tx: Tx, fromDate: string, toDate: string): number {
  let n = 0;
  for (const ad of tx.all("ads")) {
    if (ad.status !== "live" || !ad.started_at) continue;
    const post = tx.get("posts", ad.post_id);
    const app = tx.get("apps", ad.app_id);
    if (!post || !app) continue;
    const days: AdDaily[] = [];
    let cursor = ad.daily.length > 0 ? addDays(`${ad.daily[ad.daily.length - 1].date}T00:00:00Z`, 1) : `${dateOf(ad.started_at)}T00:00:00Z`;
    while (dateOf(cursor) <= toDate && dateOf(cursor) > fromDate) {
      const rng = seededRng(`ad|${ad.id}|${dateOf(cursor)}`);
      const spend = ad.daily_budget_cents;
      const impressions = Math.round(spend * (90 + rng() * 40));
      const clicks = Math.round(impressions * (0.011 + rng() * 0.006));
      const installs = Math.round(clicks * (0.22 + rng() * 0.1));
      const trials = Math.round(installs * (0.07 + rng() * 0.03));
      const paid = Math.round(trials * (0.3 + rng() * 0.1));
      days.push({ date: dateOf(cursor), spend_cents: spend, impressions, clicks, installs, trials, paid, revenue_cents: paid * app.avg_first_payment_cents });
      cursor = addDays(cursor, 1);
    }
    if (days.length === 0) continue;
    const daily = [...ad.daily, ...days];
    const sum = (f: (d: AdDaily) => number): number => daily.reduce((s, d) => s + f(d), 0);
    const windowEnd = ad.commission_window_ends_at ?? addDays(ad.started_at, CONSTANTS.pay.ad_commission_days);
    const inWindowRevenue = daily.filter((d) => toMs(`${d.date}T00:00:00Z`) <= toMs(windowEnd)).reduce((s, d) => s + d.revenue_cents, 0);
    const spend = sum((d) => d.spend_cents);
    tx.patch("ads", ad.id, { daily, spend_cents: spend, impressions: sum((d) => d.impressions), clicks: sum((d) => d.clicks), installs: sum((d) => d.installs), trials: sum((d) => d.trials), paid: sum((d) => d.paid), revenue_cents: sum((d) => d.revenue_cents), commission_cents: mulRate(inWindowRevenue, ad.commission_rate), platform_fee_cents: mulRate(spend, CONSTANTS.fees.ad_spend_fee_rate) } as Partial<Ad>);
    n += days.length;
  }
  return n;
}

/** The weekly settlement of running ads: new commission goes to the creator (outside the per-video cap) and the 1% fee on new spend to the platform. */
export function settleAds(tx: Tx): number {
  let n = 0;
  for (const ad of tx.all("ads")) {
    if (ad.status === "requested" || ad.status === "authorised" || ad.status === "declined") continue;
    const bounty = tx.get("bounties", ad.bounty_id);
    let paidCommission = 0;
    let paidFee = 0;
    for (const e of tx.all("ledger")) {
      if (e.ad_id !== ad.id) continue;
      if (e.entry_type === "commission" && e.account.startsWith("creator:")) paidCommission += e.amount_cents;
      if (e.entry_type === "ad_fee" && e.account === "platform:fees") paidFee += e.amount_cents;
    }
    const commission = ad.commission_cents - paidCommission;
    const fee = ad.platform_fee_cents - paidFee;
    if (commission > 0) {
      const rows = tx.post(adCommissionTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: ad.brand_id, creator_id: ad.creator_id, ad_id: ad.id, post_id: ad.post_id, bounty_id: ad.bounty_id, commission_cents: commission, title: bounty?.title }));
      const creatorLeg = rows.find((r) => r.account === `creator:${ad.creator_id}`);
      tx.put("money_clock", { id: tx.nextId("mc"), creator_id: ad.creator_id, bounty_id: ad.bounty_id, app_id: ad.app_id, post_id: ad.post_id, source: "ad_commission", state: "pending", amount_cents: commission, estimated: false, earned_at: tx.now, eta_at: addHours(tx.now, 24), reason: "awaiting_clearing_run", reason_text: "Ad commission settles with the next clearing run.", label: `${bounty?.title ?? "Ad"} (ad commission)`, ...(creatorLeg ? { ledger_id: creatorLeg.id } : {}) });
      n += 1;
    }
    if (fee > 0) {
      tx.post(adFeeTxn({ txn_id: tx.nextId("txn"), posted_at: tx.now, brand_id: ad.brand_id, ad_id: ad.id, fee_cents: fee, title: bounty?.title }));
      n += 1;
    }
  }
  return n;
}

// ── the Daily Drop ─────────────────────────────────────────────────────────────────────────────

/** Builds a drop for a date from the live bounties with real spots. Spots are true counts: a bounty with fewer than 8 spots left is not dropped. */
export function generateDrop(tx: Tx, date: string): DailyDrop | null {
  if (tx.get("daily_drops", `drop_${date}`)) return null;
  const used = new Set(
    tx
      .all("daily_drops")
      .filter((d) => d.date >= addDays(`${date}T00:00:00Z`, -3).slice(0, 10))
      .flatMap((d) => d.items.map((i) => i.bounty_id)),
  );
  const candidates = tx
    .all("bounties")
    .filter((b) => b.status === "live" && b.funded && (b.visibility === "open" || b.visibility === "drop") && spotsLeft({ remaining_cents: b.remaining_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate }) >= CONSTANTS.daily_drop.min_spots_per_item)
    .sort((a, b) => (used.has(a.id) === used.has(b.id) ? (b.published_at ?? "").localeCompare(a.published_at ?? "") : used.has(a.id) ? 1 : -1));
  const picks = candidates.slice(0, CONSTANTS.daily_drop.items_per_drop);
  if (picks.length === 0) return null;
  const items: DropItem[] = picks.map((b) => {
    const spots = spotsLeft({ remaining_cents: b.remaining_cents, per_video_cap_cents: b.per_video_cap_cents, take_rate: b.take_rate });
    const total = Math.min(CONSTANTS.daily_drop.max_spots_per_item, Math.max(CONSTANTS.daily_drop.min_spots_per_item, Math.floor(spots * 0.6)));
    return { bounty_id: b.id, spots_total: total, spots_left: total, claims: [] };
  });
  const total = items.reduce((s, i) => s + i.spots_total, 0);
  const release = `${date}T${String(CONSTANTS.daily_drop.hour_utc).padStart(2, "0")}:00:00Z`;
  const drop: DailyDrop = {
    id: `drop_${date}`,
    date,
    release_at: release,
    claim_window_ends_at: addHours(release, CONSTANTS.daily_drop.claim_window_hours),
    status: "upcoming",
    headline: `${items.length} new ${items.length === 1 ? "bounty" : "bounties"}. Real spots.`,
    items,
    spots_total: total,
    spots_left: total,
    claims_total: 0,
    created_at: tx.now,
  };
  return tx.put("daily_drops", drop);
}

/** Moves drops through upcoming, live, sold out and closed, makes sure the next two days exist, and tells creators who opted in to the reminder. */
export function advanceDrops(tx: Tx): number {
  let n = 0;
  for (const offset of [0, 1, 2]) generateDrop(tx, dateOf(addDays(tx.now, offset)));
  for (const d of tx.all("daily_drops")) {
    let status = d.status;
    if (d.status === "upcoming" && toMs(d.release_at) <= toMs(tx.now)) status = "live";
    if ((status === "live" || status === "sold_out") && toMs(d.claim_window_ends_at) <= toMs(tx.now)) status = "closed";
    else if (status === "live" && d.spots_left === 0) status = "sold_out";
    if (status === d.status) continue;
    tx.patch("daily_drops", d.id, { status });
    if (status === "live") {
      for (const prefs of tx.all("notification_prefs")) {
        if (!prefs.drop_reminder) continue;
        notify(tx, { recipient_user_id: prefs.user_id, audience: "creator", kind: "drop_live", title: "Today's Daily Drop is live", body: `${d.items.length} bounties, ${d.spots_left} real spots. Claims hold your place for ${CONSTANTS.daily_drop.claim_window_hours} hours.`, deep_link: "flowd://drop", ref_kind: "daily_drop", ref_id: d.id });
      }
    }
    n += 1;
  }
  return n;
}

// ── tournaments ────────────────────────────────────────────────────────────────────────────────

/** Moves tournaments by date; at the end the top hook scores win the prizes (paid from flowd's treasury, or the sponsor's). */
export function advanceTournaments(tx: Tx): number {
  let n = 0;
  for (const t of tx.all("tournaments")) {
    let status: Tournament["status"] = t.status;
    if (status === "announced" && toMs(t.entries_open_at) <= toMs(tx.now)) status = "open";
    if (status === "open" && toMs(t.starts_at) <= toMs(tx.now)) status = "live";
    if (status === "live" && toMs(t.ends_at) <= toMs(tx.now)) status = "judging";
    if (status === "judging" && toMs(addHours(t.ends_at, 24)) <= toMs(tx.now)) {
      status = "complete";
      payTournament(tx, t);
    }
    if (status !== t.status) {
      const cur = tx.must("tournaments", t.id);
      tx.patch("tournaments", t.id, { status });
      if (status === "live" || status === "judging" || status === "complete") {
        for (const e of tx.all("tournament_entries").filter((x) => x.tournament_id === t.id)) {
          notifyCreator(tx, e.creator_id, { kind: "tournament_update", title: status === "live" ? `${cur.title} is live` : status === "judging" ? `${cur.title}: judging` : `${cur.title}: results are in`, body: status === "complete" ? "Check the standings and any prize you won." : "Entries are locked. Results come within 24 hours.", path: `tournament/${t.id}`, ref_kind: "tournament", ref_id: t.id });
        }
      }
      n += 1;
    }
  }
  return n;
}

function payTournament(tx: Tx, t: Tournament): void {
  const entries = tx.all("tournament_entries").filter((e) => e.tournament_id === t.id && e.status !== "disqualified").sort((a, b) => b.hook_points - a.hook_points || (a.entered_at < b.entered_at ? -1 : 1));
  const winners: string[] = [];
  for (const prize of [...t.prizes].sort((a, b) => a.place - b.place)) {
    const entry = entries[prize.place - 1];
    if (!entry) continue;
    tx.patch("tournament_entries", entry.id, { status: prize.place === 1 ? "won" : entry.status, placement: prize.place, prize_cents: prize.amount_cents, updated_at: tx.now });
    addPlatformEarning(tx, { creator_id: entry.creator_id, type: "prize", amount_cents: prize.amount_cents, memo: `Tournament prize, place ${prize.place}: ${t.title}`, label: `${t.title}: place ${prize.place}` });
    notifyCreator(tx, entry.creator_id, { kind: "cash_event", title: `You placed ${prize.place} in ${t.title}`, body: `${formatMoney(prize.amount_cents)} is pending and clears with the next daily run.`, amount_cents: prize.amount_cents, path: `tournament/${t.id}`, ref_kind: "tournament", ref_id: t.id });
    if (prize.place === 1) winners.push(entry.creator_id);
  }
  if (winners.length > 0) tx.patch("tournaments", t.id, { winner_creator_ids: winners });
}

/** Creators whose cleared lifetime changed through clearing: refresh their tier path and reputation once. */
export function refreshAffectedCreators(tx: Tx, creatorIds: Iterable<string>): void {
  for (const id of new Set(creatorIds)) {
    if (!tx.get("creators", id)) continue;
    refreshCreator(tx, id);
    refreshReputation(tx, id);
  }
}

/** Brands whose scorecard may have moved. */
export function refreshBrands(tx: Tx, brandIds: Iterable<string>): void {
  for (const id of new Set(brandIds)) refreshBrandScorecard(tx, id);
}

export { earningRows, makeArtSeed };
