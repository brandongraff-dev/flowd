// housekeeping: everything that keeps the market tidy and every promise on time.
//   pg_cron: every hour at :20 (all phases except webhooks)  and  every 5 minutes with { "phase": "webhooks" }
//   POST /functions/v1/housekeeping  { "phase"?: "sla" | "lifecycle" | "inbox" | "webhooks" | "wallet" | "keys" | "fatigue" }   (no phase = all but webhooks)
//
//   sla         The 72-hour review clock (No-Rug Approvals). Every submission in review is placed on it (on_track under 48 h, stale to 72 h,
//               breached after). Stale: the brand's reviewers are nudged. Breached: the brand's Scorecard takes the hit (through its decision time),
//               Ops are told, and the brand's timeout policy applies: "escalate" (default) or "approve if clean" (auto-approve only when every QA
//               check passed). Nothing is rejected by a timer, ever.
//   lifecycle   Bounties start (scheduled -> live) and end (-> ended) on their dates. Revision requests expire after 14 days (reservation released).
//               Offers expire after 7 days. An approved video nobody posted in 30 days is RELEASED: the reservation returns to the pool and, when it
//               scores 55 or more with no failed QA check, it becomes a Spec with first refusal for the brand for 7 days; first refusals that ran out
//               are listed on the Spec Market.
//   inbox       Replay webhook events that failed (up to 5 attempts, then `dead`).
//   webhooks    Deliver the outbound webhook outbox (retries with backoff, signed).
//   wallet      Auto top-up: wallets under the brand's threshold are topped up from the saved card (once a day, ledger posted by the Stripe webhook).
//   keys        Re-seal social tokens and secrets still on an old encryption key.
//   fatigue     Winner posts whose trial rate fell 30% from its peak: a refresh alert for the brand (ML fatigue model).
//
// Every phase is idempotent and bounded (limits per run), and its own failure never stops the others.

import { buildAdapters, type Adapters } from '../_shared/adapters/index.ts';
import { requireCaller } from '../_shared/auth.ts';
import { type KeyRing, loadKeyRing } from '../_shared/crypto.ts';
import { type Db, rpc, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { type Env, loadEnv, now as clock } from '../_shared/env.ts';
import { errorMessage, FlowdError } from '../_shared/errors.ts';
import { handle, log, readJson, requireMethod } from '../_shared/http.ts';
import { hourSlot, minuteSlot, runJob } from '../_shared/jobs.ts';
import { markInbound, MAX_ATTEMPTS } from '../_shared/inbox.ts';
import { brandRecipients, notify } from '../_shared/notify.ts';
import { rotateKeys, rotateSecrets } from '../_shared/tokens.ts';
import { deliverDue, enqueueEvent } from '../_shared/webhooks-out.ts';
import { dispatch as dispatchStripe } from '../webhook-stripe/handler.ts';
import { processEvent as processRevenueCat } from '../webhook-revenuecat/handler.ts';
import { normalizeRevenueCatEvent, type RevenueCatPayload, UnsupportedEvent } from '../_shared/revenuecat.ts';
import type { StripeEvent } from '../_shared/adapters/payments.ts';
import { canListAsSpec, hoursInReview, isClean, isoDay, releasedSpecPriceCents, slaState } from './rules.ts';

type Phase = 'sla' | 'lifecycle' | 'inbox' | 'webhooks' | 'wallet' | 'keys' | 'fatigue';
const ALL_PHASES: Phase[] = ['sla', 'lifecycle', 'inbox', 'wallet', 'keys', 'fatigue'];

interface Body {
  phase?: Phase;
  scheduled_for?: string;
}

type Stats = Record<string, unknown>;

interface Ctx {
  db: Db;
  adapters: Adapters;
  env: Env;
  ring: KeyRing | null;
  now: Date;
}

// ── sla ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runSla({ db, adapters, now }: Ctx): Promise<Stats> {
  const stats = { checked: 0, became_stale: 0, became_breached: 0, auto_approved: 0, escalated: 0 };
  const rows = unwrap(
    await db.from('submissions').select('id,brand_id,bounty_id,creator_id,sla_due_at,sla_state,sla_breached_at,brands!inner(timeout_policy)').eq('status', 'in_review').not('sla_due_at', 'is', null).limit(2000),
  ) as Array<{ id: string; brand_id: string; bounty_id: string; creator_id: string; sla_due_at: string; sla_state: string; sla_breached_at: string | null; brands: { timeout_policy: string } | Array<{ timeout_policy: string }> }>;
  const touchedBrands = new Set<string>();
  for (const s of rows) {
    stats.checked++;
    const state = slaState(hoursInReview(s.sla_due_at, now));
    if (state === s.sla_state) continue;
    if (state === 'stale') {
      unwrap(await db.from('submissions').update({ sla_state: 'stale' }).eq('id', s.id).select('id'));
      stats.became_stale++;
      for (const userId of await brandRecipients(db, s.brand_id, 'review')) {
        await notify(db, adapters.push, { recipientUserId: userId, audience: 'brand', kind: 'review_sla_warning', priority: 'normal', title: 'A video is 24 hours from its review deadline', body: 'Decide within 24 hours to stay inside the 72-hour promise.', deepLink: `flowd://review/${s.id}`, refKind: 'submission', refId: s.id }, now);
      }
    } else if (state === 'breached') {
      unwrap(await db.from('submissions').update({ sla_state: 'breached', sla_breached_at: now.toISOString() }).eq('id', s.id).select('id'));
      stats.became_breached++;
      touchedBrands.add(s.brand_id);
      const policy = Array.isArray(s.brands) ? s.brands[0]?.timeout_policy : s.brands.timeout_policy;
      const version = unwrapMaybe(await db.from('submission_versions').select('qa_pass,qa_warn,qa_fail').eq('submission_id', s.id).order('version', { ascending: false }).limit(1).maybeSingle()) as { qa_pass: number; qa_warn: number; qa_fail: number } | null;
      if (policy === 'approve_if_clean' && version && isClean(version)) {
        unwrap(
          await db.from('submissions').update({ status: 'approved', auto_approved: true, approved_at: now.toISOString(), sla_state: 'breached', decision: { action: 'timeout_approve', decided_at: now.toISOString() } }).eq('id', s.id).eq('status', 'in_review').select('id'),
        );
        stats.auto_approved++;
        const user = unwrapMaybe(await db.from('creators').select('user_id').eq('id', s.creator_id).maybeSingle()) as { user_id: string } | null;
        if (user) await notify(db, adapters.push, { recipientUserId: user.user_id, audience: 'creator', kind: 'approval', priority: 'normal', title: 'Approved', body: 'The brand did not decide in 72 hours and every check passed, so your video is approved. You can post it now.', deepLink: `flowd://submissions/${s.id}`, refKind: 'submission', refId: s.id }, now);
      } else {
        stats.escalated++;
        unwrap(await db.from('audit_log').insert({ actor_kind: 'system', action: 'review.sla_breach', target_table: 'submissions', target_id: s.id, reason: 'No decision within 72 hours. Escalated to Ops.' }).select('id'));
        for (const a of unwrap(await db.from('users').select('id').eq('role', 'admin').eq('status', 'active')) as Array<{ id: string }>) {
          await notify(db, adapters.push, { recipientUserId: a.id, audience: 'admin', kind: 'review_sla_warning', priority: 'normal', title: 'Review SLA breached', body: 'A submission passed 72 hours without a decision.', deepLink: `flowd://admin/sla/${s.id}`, refKind: 'submission', refId: s.id }, now);
        }
      }
    } else if (state === 'on_track') {
      unwrap(await db.from('submissions').update({ sla_state: 'on_track' }).eq('id', s.id).select('id'));
    }
  }
  for (const brandId of touchedBrands) await rpc(db, 'refresh_brand_scorecard', { p_brand_id: brandId });
  return stats;
}

// ── lifecycle ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function releaseUnusedApproval(ctx: Ctx, sub: { id: string; bounty_id: string; creator_id: string; brand_id: string; app_id: string; rights_card: unknown; flow_band: string; flow_points: number; hook_band: string; hook_points: number }): Promise<'spec' | 'released'> {
  const { db, adapters, now } = ctx;
  await rpc(db, 'release_reserved', { p_submission_id: sub.id, p_reason: 'unused_30_days' });
  unwrap(await db.from('submissions').update({ status: 'released', released_at: now.toISOString() }).eq('id', sub.id).eq('status', 'approved').select('id'));

  const version = unwrapMaybe(
    await db.from('submission_versions').select('video_asset_id,video_duration_ms,video_width,video_height,video_size_bytes,video_fps,video_has_captions,video_language,video_art,video_uploaded_at,qa_pass,qa_warn,qa_fail').eq('submission_id', sub.id).order('version', { ascending: false }).limit(1).maybeSingle(),
  ) as { video_asset_id: string; video_duration_ms: number; video_width: number; video_height: number; video_size_bytes: number; video_fps: number; video_has_captions: boolean; video_language: string; video_art: unknown; video_uploaded_at: string; qa_pass: number; qa_warn: number; qa_fail: number } | null;
  const analysis = unwrapMaybe(await db.from('video_analyses').select('hook,tags').eq('submission_id', sub.id).order('version', { ascending: false }).limit(1).maybeSingle()) as { hook: { text?: string; hook_type?: string }; tags: Record<string, unknown> } | null;
  const bounty = unwrapMaybe(await db.from('bounties').select('title,pay_math,format_ids,apps!inner(category)').eq('id', sub.bounty_id).maybeSingle()) as
    | { title: string; pay_math: { median_cents?: number }; format_ids: string[]; apps: { category: string } | Array<{ category: string }> }
    | null;
  const hookType = analysis?.hook.hook_type;
  const listable = version !== null && bounty !== null && analysis !== null && hookType !== undefined && canListAsSpec(sub.flow_points, version);
  if (listable && version && bounty && analysis) {
    const category = Array.isArray(bounty.apps) ? bounty.apps[0]?.category : bounty.apps.category;
    unwrap(
      await db.from('specs').insert({
        creator_id: sub.creator_id, title: bounty.title, description: `Released after 30 days unused. Approved for ${bounty.title}; the original brand has first refusal for 7 days.`,
        status: 'first_refusal', source: 'released_from_bounty', art: version.video_art,
        video: { asset_id: version.video_asset_id, duration_ms: version.video_duration_ms, width: version.video_width, height: version.video_height, size_bytes: version.video_size_bytes, fps: version.video_fps, has_captions: version.video_has_captions, language: version.video_language, art: version.video_art, uploaded_at: version.video_uploaded_at },
        format_id: bounty.format_ids[0] ?? null, hook_text: analysis.hook.text ?? '', hook_type: hookType, category: category ?? 'lifestyle',
        flow_band: sub.flow_band, flow_points: sub.flow_points, hook_band: sub.hook_band, hook_points: sub.hook_points, qa_pass: version.qa_pass, qa_warn: version.qa_warn, qa_fail: version.qa_fail,
        tags: analysis.tags, price_cents: releasedSpecPriceCents(bounty.pay_math.median_cents), paid_ads_days: 90, exclusive: false, rights_card: sub.rights_card, stats: { previews: 0, saves: 0, licenses: 0 },
        source_submission_id: sub.id, source_bounty_id: sub.bounty_id, source_brand_id: sub.brand_id, first_refusal_ends_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      }).select('id'),
    );
  }
  const creator = unwrapMaybe(await db.from('creators').select('user_id').eq('id', sub.creator_id).maybeSingle()) as { user_id: string } | null;
  if (creator) {
    await notify(db, adapters.push, { recipientUserId: creator.user_id, audience: 'creator', kind: 'system_notice', priority: 'normal', title: listable ? 'Your video moved to the Spec Market' : 'Your approved video was released', body: listable ? 'The brand did not post it in 30 days. It is listed for licensing after the brand\'s 7-day first refusal. You keep earning from every license.' : 'The brand did not use it in 30 days, so it is yours again to post elsewhere.', deepLink: `flowd://submissions/${sub.id}`, refKind: 'submission', refId: sub.id }, now);
  }
  return listable ? 'spec' : 'released';
}

export async function runLifecycle(ctx: Ctx): Promise<Stats> {
  const { db, now } = ctx;
  const nowIso = now.toISOString();
  const stats = { bounties_started: 0, bounties_ended: 0, revisions_expired: 0, offers_expired: 0, approvals_released: 0, specs_created: 0, specs_listed: 0 };

  // bounties start and end on their dates
  const starting = unwrap(await db.from('bounties').select('id,brand_id').eq('status', 'scheduled').eq('funded', true).lte('starts_at', nowIso)) as Array<{ id: string; brand_id: string }>;
  for (const b of starting) {
    unwrap(await db.from('bounties').update({ status: 'live' }).eq('id', b.id).eq('status', 'scheduled').select('id'));
    await enqueueEvent(db, b.brand_id, 'bounty_live', { bounty_id: b.id }, now);
    stats.bounties_started++;
  }
  const ending = unwrap(await db.from('bounties').select('id,brand_id,status').in('status', ['live', 'paused', 'filled']).lte('ends_at', nowIso)) as Array<{ id: string; brand_id: string; status: string }>;
  for (const b of ending) {
    unwrap(await db.from('bounties').update({ status: 'ended', ended_at: nowIso }).eq('id', b.id).eq('status', b.status).select('id'));
    stats.bounties_ended++;
  }

  // revision requests nobody answered in 14 days
  const stale = unwrap(await db.from('submissions').select('id').eq('status', 'changes_requested').lte('updated_at', new Date(now.getTime() - 14 * 86_400_000).toISOString()).limit(500)) as Array<{ id: string }>;
  for (const s of stale) {
    await rpc(db, 'release_reserved', { p_submission_id: s.id, p_reason: 'revision_expired' });
    unwrap(await db.from('submissions').update({ status: 'expired' }).eq('id', s.id).eq('status', 'changes_requested').select('id'));
    stats.revisions_expired++;
  }

  // offers older than 7 days
  const offers = unwrap(await db.from('offers').select('id,status').in('status', ['awaiting_creator', 'awaiting_brand']).lte('expires_at', nowIso).limit(500)) as Array<{ id: string; status: string }>;
  for (const o of offers) {
    unwrap(await db.from('offers').update({ status: 'expired', closed_at: nowIso }).eq('id', o.id).eq('status', o.status).select('id'));
    stats.offers_expired++;
  }

  // approved but never posted in 30 days: released, and listed as a Spec when it qualifies
  const unused = unwrap(
    await db.from('submissions').select('id,bounty_id,creator_id,brand_id,app_id,rights_card,flow_band,flow_points,hook_band,hook_points').eq('status', 'approved').is('post_id', null).lte('approved_at', new Date(now.getTime() - 30 * 86_400_000).toISOString()).limit(200),
  ) as Array<{ id: string; bounty_id: string; creator_id: string; brand_id: string; app_id: string; rights_card: unknown; flow_band: string; flow_points: number; hook_band: string; hook_points: number }>;
  for (const sub of unused) {
    try {
      const kind = await releaseUnusedApproval(ctx, sub);
      stats.approvals_released++;
      if (kind === 'spec') stats.specs_created++;
    } catch (err) {
      log('housekeeping', 'error', 'release_failed', { submission: sub.id, message: errorMessage(err) });
    }
  }

  // first refusals that ran out go on the market
  const listed = unwrap(await db.from('specs').update({ status: 'listed', listed_at: nowIso }).eq('status', 'first_refusal').lte('first_refusal_ends_at', nowIso).select('id')) as Array<{ id: string }>;
  stats.specs_listed = listed.length;
  return stats;
}

// ── inbox ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runInbox({ db, adapters, now }: Ctx): Promise<Stats> {
  const stats = { retried: 0, processed: 0, failed: 0 };
  const retryable = unwrap(
    await db.from('inbound_events').select('id,provider,event_id,payload,attempts').in('status', ['received', 'failed']).lt('attempts', MAX_ATTEMPTS).lte('received_at', new Date(now.getTime() - 5 * 60_000).toISOString()).gte('received_at', new Date(now.getTime() - 7 * 86_400_000).toISOString()).order('received_at').limit(50),
  ) as Array<{ id: string; provider: string; event_id: string; payload: Record<string, unknown>; attempts: number }>;
  for (const ev of retryable) {
    stats.retried++;
    try {
      if (ev.provider === 'stripe') {
        const outcome = await dispatchStripe({ db, push: adapters.push, now }, ev.payload as unknown as StripeEvent);
        await markInbound(db, ev.id, outcome);
      } else if (ev.provider === 'revenuecat') {
        const appId = typeof ev.payload.flowd_app_id === 'string' ? ev.payload.flowd_app_id : null;
        if (!appId) {
          await markInbound(db, ev.id, 'dead', 'The stored event has no flowd_app_id; replay it by hand with ?app=.');
          continue;
        }
        const payload = ev.payload as unknown as RevenueCatPayload;
        const result = await processRevenueCat(db, appId, normalizeRevenueCatEvent(payload, now), payload, now);
        await markInbound(db, ev.id, result.matchStatus === 'matched' || result.matchStatus === 'duplicate' ? 'processed' : 'ignored');
      } else {
        await markInbound(db, ev.id, 'ignored', `no replay handler for ${ev.provider}`);
        continue;
      }
      stats.processed++;
    } catch (err) {
      if (err instanceof UnsupportedEvent) {
        await markInbound(db, ev.id, 'ignored', err.reason);
        continue;
      }
      stats.failed++;
      await markInbound(db, ev.id, 'failed', errorMessage(err));
    }
  }
  return stats;
}

// ── webhooks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runWebhooks({ db, env, ring, now }: Ctx): Promise<Stats> {
  if (!ring) return { skipped: 'TOKEN_ENCRYPTION_KEYS is not configured: signing secrets cannot be opened' };
  return { ...(await deliverDue(db, ring, now, env.webhooksOutbound.userAgent)) };
}

// ── wallet: auto top-up ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runWallet({ db, adapters, now }: Ctx): Promise<Stats> {
  const stats = { checked: 0, charged: 0, failed: 0 };
  const brands = unwrap(
    await db.from('brands').select('id,wallet_balance_cents,auto_top_up,stripe_customer_id').not('auto_top_up', 'is', null).not('stripe_customer_id', 'is', null).is('deleted_at', null).is('suspended_at', null).limit(1000),
  ) as Array<{ id: string; wallet_balance_cents: number; auto_top_up: { enabled: boolean; threshold_cents: number; amount_cents: number } | null; stripe_customer_id: string }>;
  for (const b of brands) {
    const cfg = b.auto_top_up;
    if (!cfg || !cfg.enabled || b.wallet_balance_cents >= cfg.threshold_cents) continue;
    stats.checked++;
    const processing = await rpc<number>(db, 'card_processing', { p_amount_cents: cfg.amount_cents });
    const result = await adapters.payments.chargeSavedCard({ brandId: b.id, customerId: b.stripe_customer_id, walletCreditCents: cfg.amount_cents, chargeCents: cfg.amount_cents + processing, idempotencyKey: `auto-topup:${b.id}:${isoDay(now)}` });
    if (result.status === 'failed') {
      stats.failed++;
      for (const userId of await brandRecipients(db, b.id, 'finance.write')) {
        await notify(db, adapters.push, { recipientUserId: userId, audience: 'brand', kind: 'funding_needed', priority: 'normal', title: 'Auto top-up failed', body: `${result.failureMessage ?? 'The card was declined.'} Update the card so bounties stay funded.`, deepLink: 'flowd://wallet', refKind: 'brand', refId: b.id }, now);
      }
      await enqueueEvent(db, b.id, 'wallet_low', { wallet_balance_cents: b.wallet_balance_cents, threshold_cents: cfg.threshold_cents, auto_top_up_failed: true }, now);
    } else {
      stats.charged++; // the wallet is credited by the payment_intent.succeeded webhook, like every top-up
    }
  }
  return stats;
}

// ── keys ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runKeys({ db, ring }: Ctx): Promise<Stats> {
  if (!ring) return { skipped: 'TOKEN_ENCRYPTION_KEYS is not configured' };
  return { tokens_rotated: await rotateKeys(db, ring, 200), secrets_rotated: await rotateSecrets(db, ring, 200) };
}

// ── fatigue ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function runFatigue({ db, adapters, now }: Ctx): Promise<Stats> {
  const stats = { checked: 0, alerts: 0 };
  const winners = unwrap(await db.from('posts').select('id,brand_id,app_id,bounty_id,creator_id,ad_id').eq('is_winner', true).in('status', ['live', 'cleared', 'paid']).limit(300)) as Array<{ id: string; brand_id: string; app_id: string; bounty_id: string; creator_id: string; ad_id: string | null }>;
  for (const w of winners) {
    const open = unwrap(await db.from('fatigue_alerts').select('id').eq('post_id', w.id).in('status', ['open', 'acknowledged', 'refreshing']).limit(1)) as Array<{ id: string }>;
    if (open.length > 0) continue;
    const rows = unwrap(await db.from('post_metrics_daily').select('date,views,installs,trials').eq('post_id', w.id).gte('date', isoDay(new Date(now.getTime() - 28 * 86_400_000))).order('date')) as Array<{ date: string; views: number; installs: number; trials: number }>;
    if (rows.length < 7) continue;
    stats.checked++;
    const verdict = await adapters.ml.fatigue({ series: rows });
    if (verdict.status !== 'fatigued' || verdict.peak_rate === null || verdict.current_rate === null || verdict.drop_pct === null) continue;
    const rates = rows.filter((r) => r.installs > 0).map((r) => ({ date: r.date, rate: r.trials / r.installs }));
    const peak = rates.reduce((m, r) => (r.rate > m.rate ? r : m), rates[0] ?? { date: rows[0]?.date ?? isoDay(now), rate: 0 });
    unwrap(
      await db.from('fatigue_alerts').insert({
        brand_id: w.brand_id, app_id: w.app_id, bounty_id: w.bounty_id, post_id: w.id, ad_id: w.ad_id, creator_id: w.creator_id, metric: 'trial_rate', status: 'open',
        peak_value: Math.min(1, verdict.peak_rate), current_value: Math.min(verdict.peak_rate, verdict.current_rate), drop_ratio: Math.min(1, verdict.drop_pct / 100), peak_on: peak.date,
        series: rates.map((r) => ({ x: r.date, y: Math.round(r.rate * 10000) / 10000 })), message: verdict.summary, detected_at: now.toISOString(),
      }).select('id'),
    );
    stats.alerts++;
    await enqueueEvent(db, w.brand_id, 'ad_fatigued', { post_id: w.id, drop_pct: verdict.drop_pct }, now);
    for (const userId of await brandRecipients(db, w.brand_id, 'promote')) {
      await notify(db, adapters.push, { recipientUserId: userId, audience: 'brand', kind: 'fatigue_alert', priority: 'normal', title: 'A winner is wearing out', body: `${verdict.summary} Brief a refresh while it still performs.`, deepLink: `flowd://fatigue/${w.id}`, refKind: 'post', refId: w.id }, now);
    }
  }
  return stats;
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const RUNNERS: Record<Phase, (ctx: Ctx) => Promise<Stats>> = {
  sla: runSla, lifecycle: runLifecycle, inbox: runInbox, webhooks: runWebhooks, wallet: runWallet, keys: runKeys, fatigue: runFatigue,
};

export const handler = handle('housekeeping', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'ml', 'push', 'stripe']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  if (body.phase && !(body.phase in RUNNERS)) throw new FlowdError('validation_failed', `phase must be one of ${Object.keys(RUNNERS).join(', ')}.`, 422);
  const now = clock(env);
  const db = serviceClient(env);
  const ring = Object.keys(env.tokenKeys).length > 0 ? await loadKeyRing(env.tokenKeys, env.tokenKeyActive) : null;
  const ctx: Ctx = { db, adapters: buildAdapters(env), env, ring, now };
  const phases = body.phase ? [body.phase] : ALL_PHASES;
  const out: Record<string, unknown> = {};
  for (const phase of phases) {
    const slot = body.scheduled_for ?? (phase === 'webhooks' ? minuteSlot(now, 5) : hourSlot(now));
    try {
      out[phase] = await runJob(db, `housekeeping:${phase}`, slot, now, () => RUNNERS[phase](ctx));
    } catch (err) {
      out[phase] = { error: errorMessage(err) };
      log('housekeeping', 'error', 'phase_failed', { phase, message: errorMessage(err) });
    }
  }
  return out;
});
