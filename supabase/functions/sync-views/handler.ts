// sync-views: the hourly pull of view counts.   pg_cron: every hour at :00  ->  POST /functions/v1/sync-views
//
// Verified views are the basis of payment, so this is the job the money depends on. For every post still inside its 72-hour window (and, less
// often, for the 30 days after it) it asks the platform adapter for the current counts and records them through public.ingest_post_sample():
//   * the hourly delta and the daily row (post_metrics_hourly / post_metrics_daily)
//   * the post's counters; window_views follows the verified views while the window is open
//   * every 6 hours, and once more just before the window ends, a View Ledger snapshot (view_snapshots): the audited record of what each post
//     was paid for. Verified views never go backwards; close_window() freezes the last snapshot at or before window end.
//
// Cadence: posts in their window every hour; posts after the window every 6 hours (hours 0, 6, 12, 18), up to 33 days after posting.
// Isolation: one failing post never stops the batch; a platform that rate-limits stops only its own posts until the next run; an account whose
// token cannot be refreshed is marked needs_reauth and its creator is told once.
//
// Idempotent: the slot is the hour (job_runs); a repeated sample at the same timestamp adds a zero delta; the snapshot insert ignores a duplicate
// (post, taken_at).

import { buildAdapters, type Adapters } from '../_shared/adapters/index.ts';
import type { PostStats, SocialPlatform } from '../_shared/adapters/platform.ts';
import { requireCaller } from '../_shared/auth.ts';
import { loadKeyRing } from '../_shared/crypto.ts';
import { type Db, type PostRow, rpc, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { loadEnv, now as clock } from '../_shared/env.ts';
import { errorMessage, PostGoneError, RateLimitedError, ReauthRequiredError } from '../_shared/errors.ts';
import { assessPost } from '../_shared/fraud.ts';
import { handle, log, readJson, requireMethod } from '../_shared/http.ts';
import { hourSlot, runJob } from '../_shared/jobs.ts';
import { notify } from '../_shared/notify.ts';
import { mapLimit } from '../_shared/pool.ts';
import { getAccessToken } from '../_shared/tokens.ts';
import { FOLLOW_DAYS, isDue, wantsSnapshot } from './schedule.ts';

interface Body {
  /** Cap on posts per run (default 400). */
  limit?: number;
  /** Only this platform (a manual run). */
  platform?: SocialPlatform;
  /** Override the slot (backfill or manual re-run). */
  scheduled_for?: string;
}

export interface SyncStats extends Record<string, unknown> {
  posts_due: number;
  sampled: number;
  snapshots: number;
  assessed: number;
  removed: number;
  failures: number;
  rate_limited_platforms: string[];
  reauth_accounts: string[];
}

const POST_COLUMNS = 'id,submission_id,creator_id,brand_id,app_id,bounty_id,social_account_id,platform,platform_post_id,posted_at,window_ends_at,status,views,window_views,views_invalid,likes,comments,shares,saves,fraud_score,fraud';

async function syncOne(db: Db, adapters: Adapters, ring: Awaited<ReturnType<typeof loadKeyRing>>, post: PostRow, now: Date, stats: SyncStats): Promise<void> {
  const adapter = adapters.platform(post.platform);
  const token = await getAccessToken(db, ring, adapter, post.social_account_id, now);
  let sample: PostStats;
  try {
    sample = await adapter.fetchPostStats({ platform: post.platform, platformPostId: post.platform_post_id, accessToken: token, postedAt: post.posted_at, now: now.toISOString() });
  } catch (err) {
    if (err instanceof PostGoneError) {
      // A deleted post earns nothing while its window is open. After the window the money is already settled: only note it.
      if (post.status === 'live') {
        await rpc(db, 'release_reserved', { p_submission_id: post.submission_id, p_reason: 'post_removed' });
        unwrap(await db.from('posts').update({ status: 'removed', removed_at: now.toISOString() }).eq('id', post.id).eq('status', 'live').select('id'));
        stats.removed++;
      } else {
        log('sync-views', 'warn', 'post_gone_after_window', { post: post.id, status: post.status });
      }
      return;
    }
    throw err;
  }

  const last = unwrapMaybe(await db.from('view_snapshots').select('taken_at').eq('post_id', post.id).order('taken_at', { ascending: false }).limit(1).maybeSingle()) as { taken_at: string } | null;
  const snapshot = wantsSnapshot(post, last?.taken_at ?? null, now);
  await rpc(db, 'ingest_post_sample', {
    p_post_id: post.id, p_sampled_at: now.toISOString(), p_views_reported: sample.viewsReported, p_views_verified: sample.viewsVerified,
    p_likes: sample.likes, p_comments: sample.comments, p_shares: sample.shares, p_saves: sample.saves,
    p_sources: sample.sources, p_geo: sample.geo, p_exclusions: sample.exclusions.length > 0 ? sample.exclusions : null,
    p_fraud_score: post.fraud_score, p_source: 'platform_api', p_snapshot: snapshot,
  });
  stats.sampled++;
  if (snapshot) stats.snapshots++;

  // Early warning: score live posts as they age so Ops see a problem hours before the window closes, not at settlement.
  const ageHours = (now.getTime() - Date.parse(post.posted_at)) / 3_600_000;
  if (snapshot && post.status === 'live' && ageHours >= 12) {
    const fresh = unwrapMaybe(await db.from('posts').select(POST_COLUMNS).eq('id', post.id).maybeSingle()) as PostRow | null;
    if (fresh) {
      await assessPost(db, adapters.ml, fresh, now);
      stats.assessed++;
    }
  }
  unwrap(await db.from('social_accounts').update({ last_synced_at: now.toISOString() }).eq('id', post.social_account_id).select('id'));
}

export const handler = handle('sync-views', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'tokens']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  const now = clock(env);
  const db = serviceClient(env);
  const adapters = buildAdapters(env);
  const ring = await loadKeyRing(env.tokenKeys, env.tokenKeyActive);

  const outcome = await runJob<SyncStats>(db, 'sync-views', body.scheduled_for ?? hourSlot(now), now, async () => {
    const stats: SyncStats = { posts_due: 0, sampled: 0, snapshots: 0, assessed: 0, removed: 0, failures: 0, rate_limited_platforms: [], reauth_accounts: [] };
    const since = new Date(now.getTime() - (3 + FOLLOW_DAYS) * 86_400_000).toISOString();
    let query = db.from('posts').select(POST_COLUMNS).gte('posted_at', since).in('status', ['live', 'window_closed', 'held', 'cleared', 'paid']).order('window_ends_at', { ascending: true }).limit(Math.min(body.limit ?? 400, 1000));
    if (body.platform) query = query.eq('platform', body.platform);
    const due = (unwrap(await query) as PostRow[]).filter((p) => isDue(p, now));
    stats.posts_due = due.length;

    const limited = new Set<string>();
    const reauth = new Set<string>();
    const results = await mapLimit(due, 5, async (post) => {
      if (limited.has(post.platform) || reauth.has(post.social_account_id)) return;
      try {
        await syncOne(db, adapters, ring, post, now, stats);
      } catch (err) {
        if (err instanceof RateLimitedError) {
          limited.add(post.platform);
          return;
        }
        if (err instanceof ReauthRequiredError) {
          reauth.add(post.social_account_id);
          const acct = unwrapMaybe(await db.from('social_accounts').select('status').eq('id', post.social_account_id).maybeSingle()) as { status: string } | null;
          if (acct && acct.status !== 'needs_reauth') {
            unwrap(await db.from('social_accounts').update({ status: 'needs_reauth' }).eq('id', post.social_account_id).select('id'));
            const user = unwrapMaybe(await db.from('creators').select('user_id').eq('id', post.creator_id).maybeSingle()) as { user_id: string } | null;
            if (user) {
              await notify(db, adapters.push, { recipientUserId: user.user_id, audience: 'creator', kind: 'system_notice', priority: 'normal', title: 'Reconnect your account', body: 'We cannot read views for one of your accounts until you reconnect it. Views keep counting once you do.', deepLink: 'flowd://profile/accounts', refKind: 'social_account', refId: post.social_account_id }, now);
            }
          }
          return;
        }
        throw err;
      }
    });
    for (const r of results) {
      if (!r.ok) {
        stats.failures++;
        log('sync-views', 'error', 'post_failed', { message: errorMessage(r.error) });
      }
    }
    stats.rate_limited_platforms = [...limited];
    stats.reauth_accounts = [...reauth];
    return stats;
  });
  return { ...outcome };
});
