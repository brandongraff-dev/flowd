// settle-window: closes 72-hour view windows, runs the fraud gate and writes the ledger.   POST /functions/v1/settle-window  { "phase": "close" | "clear" }
//
//   phase "close"  pg_cron: every hour at :05
//     for every live post whose 72-hour window has ended:
//       close_window()   freeze the verified views that count (the last View Ledger snapshot at or before window end)  live -> window_closed
//       assessPost()     fraud model on the whole curve; the evidence is stored on the post and, from a score of 40, in the Ops queue
//       settle_post()    CPM leg: escrow debited, creator credited PENDING, platform fee credited (pay = min(views x CPM, per-video cap))
//       hold_post()      a score of 40+ holds the pending money with reason fraud_review; delivered legitimate views are still paid on release
//     then the creators' Money Clocks are rebuilt (accruing -> pending, dated ETAs).
//
//   phase "clear"  pg_cron: 14:00 UTC daily (the clearing run)
//       clear_post()           pending -> cleared for posts whose clearing time has come: fraud score under 40, no failed disclosure check, no
//                              open dispute; otherwise the post is held with a named reason. Cleared money counts toward tiers and is parked on
//                              the creator's scheduled weekly payout.
//       settle_conversion()    CPA legs after their clearing window (install 24 h, trial 72 h, paid 168 h): link and code conversions only
//       finalize_cpa_windows() release the reservations of posts whose 30-day conversion window ended
//       settle_bounty()        ended bounties whose windows are all closed: unspent escrow returns to the wallet
//       notifications          one cash notification per creator ("$X cleared, pays Friday 18:00 UTC") and a tier-up notice when a tier changed
//
// Money rules live in SQL (0003_functions.sql): every call below is idempotent and re-checks its own invariants; this function only decides
// WHICH rows are due. A crash mid-run is repaired by the next run of the same slot.

import { buildAdapters } from '../_shared/adapters/index.ts';
import { requireCaller } from '../_shared/auth.ts';
import { type Db, type PostRow, rpc, serviceClient, tolerate, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { loadEnv, now as clock } from '../_shared/env.ts';
import { errorMessage, FlowdError } from '../_shared/errors.ts';
import { assessPost } from '../_shared/fraud.ts';
import { handle, log, readJson, requireMethod } from '../_shared/http.ts';
import { daySlot, hourSlot, runJob } from '../_shared/jobs.ts';
import { notify } from '../_shared/notify.ts';
import { mapLimit } from '../_shared/pool.ts';
import { enqueueEvent } from '../_shared/webhooks-out.ts';
import type { Adapters } from '../_shared/adapters/index.ts';

interface Body {
  phase?: 'close' | 'clear';
  scheduled_for?: string;
  limit?: number;
}

const POST_COLUMNS = 'id,submission_id,creator_id,brand_id,app_id,bounty_id,social_account_id,platform,platform_post_id,posted_at,window_ends_at,status,views,window_views,views_invalid,likes,comments,shares,saves,fraud_score,fraud';

export interface CloseStats extends Record<string, unknown> {
  closed: number;
  settled: number;
  held: number;
  pay_cents: number;
  failures: number;
}

export interface ClearStats extends Record<string, unknown> {
  cleared: number;
  held: number;
  cleared_cents: number;
  conversions_settled: number;
  conversions_waiting: number;
  reservations_released: number;
  bounties_settled: number;
  tier_ups: number;
  failures: number;
}

// ── close ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function closeOne(db: Db, adapters: Adapters, postId: string, now: Date, stats: CloseStats): Promise<void> {
  await rpc(db, 'close_window', { p_post_id: postId });
  stats.closed++;
  const post = unwrapMaybe(await db.from('posts').select(POST_COLUMNS).eq('id', postId).maybeSingle()) as PostRow | null;
  if (!post) return;
  const assessment = await assessPost(db, adapters.ml, post, now);
  const settled = await rpc<{ pay_cents?: number; idempotent?: boolean }>(db, 'settle_post', { p_post_id: postId });
  stats.settled++;
  stats.pay_cents += settled.pay_cents ?? 0;
  if (assessment.score >= 40) {
    await rpc(db, 'hold_post', { p_post_id: postId, p_reason: 'fraud_review' });
    stats.held++;
  }
  await enqueueEvent(db, post.brand_id, 'post_window_closed', { post_id: postId, bounty_id: post.bounty_id, window_views: post.window_views, fraud_band: assessment.band }, now);
}

export async function runClose(db: Db, adapters: Adapters, now: Date, limit: number): Promise<CloseStats> {
  const stats: CloseStats = { closed: 0, settled: 0, held: 0, pay_cents: 0, failures: 0 };
  const due = unwrap(await db.from('posts').select('id').eq('status', 'live').lte('window_ends_at', now.toISOString()).order('window_ends_at').limit(limit)) as Array<{ id: string }>;
  const results = await mapLimit(due, 4, (p) => closeOne(db, adapters, p.id, now, stats));
  for (const r of results) {
    if (!r.ok) {
      stats.failures++;
      log('settle-window', 'error', 'close_failed', { message: errorMessage(r.error) });
    }
  }
  // accruing -> pending and the dated ETAs change with time, not only with events
  const creators = unwrap(await db.from('posts').select('creator_id').in('status', ['live', 'window_closed']).limit(1000)) as Array<{ creator_id: string }>;
  await mapLimit([...new Set(creators.map((c) => c.creator_id))], 6, (id) => rpc(db, 'refresh_money_clock', { p_creator_id: id, p_now: now.toISOString() }));
  return stats;
}

// ── clear ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const money = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function runClear(db: Db, adapters: Adapters, now: Date, limit: number): Promise<ClearStats> {
  const stats: ClearStats = { cleared: 0, held: 0, cleared_cents: 0, conversions_settled: 0, conversions_waiting: 0, reservations_released: 0, bounties_settled: 0, tier_ups: 0, failures: 0 };
  const perCreator = new Map<string, { cents: number; posts: number }>();

  // 1. posts due at this run: window closed at least 2 hours ago (the clearing buffer)
  const cutoff = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const posts = unwrap(await db.from('posts').select('id,creator_id,brand_id').eq('status', 'window_closed').lte('window_ends_at', cutoff).order('window_ends_at').limit(limit)) as Array<{ id: string; creator_id: string; brand_id: string }>;
  const before = new Map<string, string>();
  const creatorIds = [...new Set(posts.map((p) => p.creator_id))];
  if (creatorIds.length > 0) {
    for (const c of unwrap(await db.from('creators').select('id,tier').in('id', creatorIds)) as Array<{ id: string; tier: string }>) before.set(c.id, c.tier);
  }
  const cleared = await mapLimit(posts, 4, async (p) => {
    const res = await rpc<{ status: string; cleared_cents?: number }>(db, 'clear_post', { p_post_id: p.id });
    if (res.status === 'cleared') {
      stats.cleared++;
      stats.cleared_cents += res.cleared_cents ?? 0;
      const agg = perCreator.get(p.creator_id) ?? { cents: 0, posts: 0 };
      agg.cents += res.cleared_cents ?? 0;
      agg.posts += 1;
      perCreator.set(p.creator_id, agg);
      await enqueueEvent(db, p.brand_id, 'post_cleared', { post_id: p.id, cleared_cents: res.cleared_cents ?? 0 }, now);
    } else if (res.status === 'held') {
      stats.held++;
    }
  });
  for (const r of cleared) if (!r.ok) { stats.failures++; log('settle-window', 'error', 'clear_failed', { message: errorMessage(r.error) }); }

  // 2. conversions whose clearing window has passed (SQL decides if each one is really due and payable)
  const convs = unwrap(await db.from('conversions').select('id,creator_id').eq('status', 'pending').eq('payable', true).lte('first_at', new Date(now.getTime() - 24 * 3_600_000).toISOString()).order('first_at').limit(limit)) as Array<{ id: string; creator_id: string }>;
  const settled = await mapLimit(convs, 4, async (c) => {
    const res = await rpc<{ status: string; pay_cents?: number; fee_cents?: number }>(db, 'settle_conversion', { p_conversion_id: c.id });
    if (res.status === 'cleared' && (res.pay_cents ?? 0) > 0) {
      stats.conversions_settled++;
      const agg = perCreator.get(c.creator_id) ?? { cents: 0, posts: 0 };
      agg.cents += res.pay_cents ?? 0;
      perCreator.set(c.creator_id, agg);
      creatorIds.push(c.creator_id);
    } else if (res.status === 'pending') {
      stats.conversions_waiting++;
    }
  });
  for (const r of settled) if (!r.ok) { stats.failures++; log('settle-window', 'error', 'conversion_failed', { message: errorMessage(r.error) }); }

  // 3. reservations of posts whose 30-day conversion window ended go back to the pool
  stats.reservations_released = await rpc<number>(db, 'finalize_cpa_windows', { p_now: now.toISOString() });

  // 4. ended bounties whose work is all settled: the unspent escrow returns to the wallet (a bounty that is not ready answers "conflict")
  const ended = unwrap(await db.from('bounties').select('id,brand_id').eq('status', 'ended').limit(limit)) as Array<{ id: string; brand_id: string }>;
  for (const b of ended) {
    const res = await tolerate('conflict', () => rpc<{ status: string; refunded_cents?: number }>(db, 'settle_bounty', { p_bounty_id: b.id }));
    if (res?.status === 'settled') {
      stats.bounties_settled++;
      await enqueueEvent(db, b.brand_id, 'bounty_ended', { bounty_id: b.id, refunded_cents: res.refunded_cents ?? 0 }, now);
    }
  }

  // 5. tell people: one cash notification per creator, plus a tier-up notice
  const users = new Map<string, string>();
  const involved = [...new Set([...perCreator.keys(), ...creatorIds])];
  if (involved.length > 0) {
    for (const c of unwrap(await db.from('creators').select('id,user_id,tier').in('id', involved)) as Array<{ id: string; user_id: string; tier: string }>) {
      users.set(c.id, c.user_id);
      const was = before.get(c.id);
      if (was && was !== c.tier) {
        stats.tier_ups++;
        await notify(db, adapters.push, { recipientUserId: c.user_id, audience: 'creator', kind: 'tier_up', priority: 'normal', title: `You are ${c.tier}`, body: `Your tier moved from ${was} to ${c.tier}. New perks are on.`, deepLink: 'flowd://profile/tier', refKind: 'creator', refId: c.id }, now);
      }
    }
  }
  const next = unwrapMaybe(await db.rpc('weekly_payout_for', { p_cleared_at: now.toISOString() })) as string | null;
  const payDay = next ? new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(next)) + ' UTC' : 'the next Friday run';
  for (const [creatorId, agg] of perCreator) {
    const userId = users.get(creatorId);
    if (!userId || agg.cents <= 0) continue;
    await notify(db, adapters.push, { recipientUserId: userId, audience: 'creator', kind: 'payout_cleared', priority: 'cash', title: `${money(agg.cents)} cleared`, body: `Cleared and ready. It pays out ${payDay}, or cash out now.`, amountCents: agg.cents, deepLink: 'flowd://wallet', refKind: 'creator', refId: creatorId }, now);
  }
  return stats;
}

export const handler = handle('settle-window', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'ml', 'push']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  const phase = body.phase ?? 'close';
  if (phase !== 'close' && phase !== 'clear') throw new FlowdError('validation_failed', 'phase must be "close" or "clear"', 422);
  const now = clock(env);
  const db = serviceClient(env);
  const adapters = buildAdapters(env);
  const limit = Math.min(body.limit ?? 500, 2000);

  if (phase === 'close') {
    const outcome = await runJob<CloseStats>(db, 'settle-window:close', body.scheduled_for ?? hourSlot(now), now, () => runClose(db, adapters, now, limit));
    return { ...outcome };
  }
  const outcome = await runJob<ClearStats>(db, 'settle-window:clear', body.scheduled_for ?? daySlot(now, 14), now, () => runClear(db, adapters, now, limit));
  return { ...outcome };
});
