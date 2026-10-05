// The fraud gate between "window closed" and "cleared" (docs: DOMAIN 12.4).
//
//   buildFraudRequest()  everything the model needs, gathered from the tables: hourly view curve, latest traffic-source and audience mix,
//                        the account's age and followers, the bounty's target regions and cap, the creator's recent earnings (cap
//                        clustering) and perceptual-hash duplicates (public.phash_duplicates).
//   assessPost()         call the model, store the assessment on the post (posts.fraud) and, from a score of 40, open a fraud_flags row
//                        for the Ops queue with a 24 h SLA. It never holds money itself: clear_post() reads posts.fraud_score at the
//                        clearing run and holds with reason fraud_review (review band) or the Ops queue takes it (high band).
//
// Only proven fraud is clawed back, and delivered legitimate views are still paid: the gate delays money, it does not decide guilt.

import type { FraudRequest, FraudResponse, MlAdapter } from './adapters/ml.ts';
import { type Db, type PostRow, unwrap, unwrapMaybe } from './db.ts';
import { curveShape, expectedEnvelope, type HourlyRow, hourlySeries } from './fraud-math.ts';

interface SnapshotRow {
  taken_at: string;
  views_verified: number;
  sources: Record<string, number> | null;
  geo: Record<string, number> | null;
}

export async function buildFraudRequest(db: Db, post: PostRow, now: Date): Promise<{ request: FraudRequest; duplicateOf: string | null; hourly: number[]; audienceUsRatio: number; accountAgeDays: number }> {
  const until = new Date(Math.min(now.getTime(), Date.parse(post.window_ends_at))).toISOString();
  const [hourlyRows, snapshots, account, bounty, history, dups] = await Promise.all([
    db.from('post_metrics_hourly').select('ts,views').eq('post_id', post.id).order('ts'),
    db.from('view_snapshots').select('taken_at,views_verified,sources,geo').eq('post_id', post.id).order('taken_at'),
    db.from('social_accounts').select('followers,account_created_at').eq('id', post.social_account_id).maybeSingle(),
    db.from('bounties').select('deliverables,eligibility,per_video_cap_cents,cpm_cents').eq('id', post.bounty_id).maybeSingle(),
    db.from('posts').select('earnings,bounty_id').eq('creator_id', post.creator_id).neq('id', post.id).in('status', ['cleared', 'paid']).order('posted_at', { ascending: false }).limit(5),
    db.rpc('phash_duplicates', { p_post_id: post.id }),
  ]);
  const hourly = hourlySeries(post.posted_at, until, unwrap(hourlyRows) as HourlyRow[]);
  const snaps = unwrap(snapshots) as SnapshotRow[];
  const lastSnap = snaps.at(-1);
  const acct = unwrapMaybe(account) as { followers: number; account_created_at: string } | null;
  const b = unwrapMaybe(bounty) as { deliverables: { regions?: string[] }; eligibility: { min_target_audience_ratio?: number }; per_video_cap_cents: number; cpm_cents: number } | null;
  const past = unwrap(history) as Array<{ earnings: { total_cents?: number }; bounty_id: string }>;
  const dupRows = unwrap(dups) as Array<{ other_post_id: string; distance: number; same_creator: boolean }>;

  const ageDays = acct ? Math.max(0, (now.getTime() - Date.parse(acct.account_created_at)) / 86_400_000) : 0;
  const usRatio = lastSnap?.geo?.US ?? 0;
  const dup = dupRows[0];
  const request: FraudRequest = {
    post_id: post.id,
    post: {
      views: post.views, likes: post.likes, comments: post.comments, shares: post.shares, saves: post.saves,
      hourly_views: hourly,
      snapshots: snaps.map((s) => ({ t_hours: (Date.parse(s.taken_at) - Date.parse(post.posted_at)) / 3_600_000, views: s.views_verified })),
      traffic_sources: lastSnap?.sources ?? null,
      geo: lastSnap?.geo ?? null,
    },
    account: { followers: acct?.followers ?? null, account_age_days: acct ? Math.round(ageDays) : null },
    bounty: b ? { target_countries: b.deliverables.regions ?? [], min_target_audience_ratio: b.eligibility.min_target_audience_ratio ?? null, per_video_cap_cents: b.per_video_cap_cents, cpm_cents: b.cpm_cents } : undefined,
    history: past.map((p) => ({ earnings_cents: p.earnings.total_cents ?? 0, cap_cents: b?.per_video_cap_cents ?? null })),
    duplicate: dup ? { phash_distance: dup.distance, duplicate_of: dup.other_post_id, kind: dup.same_creator ? 'own_earlier_post' : 'other_creator' } : null,
  };
  return { request, duplicateOf: dup?.other_post_id ?? null, hourly, audienceUsRatio: usRatio, accountAgeDays: Math.round(ageDays) };
}

export interface Assessment {
  postId: string;
  score: number;
  band: FraudResponse['band'];
  action: string;
  flagged: boolean;
}

/** Score the post and persist the result. Idempotent: re-assessing replaces posts.fraud and updates the open flag instead of adding one. */
export async function assessPost(db: Db, ml: MlAdapter, post: PostRow, now: Date): Promise<Assessment> {
  const { request, duplicateOf, hourly, audienceUsRatio, accountAgeDays } = await buildFraudRequest(db, post, now);
  const result = await ml.fraud(request);
  const assessment = { score: result.score, band: result.band, signals: result.signals.map((s) => ({ signal: s.signal, points: s.points, severity: s.severity, detail: s.detail })), assessed_at: now.toISOString() };
  unwrap(await db.from('posts').update({ fraud: assessment }).eq('id', post.id).select('id'));

  const flagged = result.score >= 40;
  if (flagged) {
    const bounty = unwrapMaybe(await db.from('bounties').select('cpm_cents,per_video_cap_cents').eq('id', post.bounty_id).maybeSingle()) as { cpm_cents: number; per_video_cap_cents: number } | null;
    const atStake = bounty ? Math.min(bounty.per_video_cap_cents, Math.round((post.window_views * bounty.cpm_cents) / 1000)) : 0;
    const base = {
      score: result.score, band: result.band, signals: assessment.signals, curve_shape: curveShape(hourly), curve: { views: hourly, ...expectedEnvelope(hourly) },
      money_at_stake_cents: atStake, duplicate_of_post_id: duplicateOf, audience_us_ratio: audienceUsRatio, account_age_days: accountAgeDays,
    };
    const open = unwrapMaybe(await db.from('fraud_flags').select('id').eq('post_id', post.id).in('status', ['open', 'monitoring']).maybeSingle()) as { id: string } | null;
    if (open) {
      unwrap(await db.from('fraud_flags').update(base).eq('id', open.id).select('id'));
    } else {
      unwrap(
        await db.from('fraud_flags').insert({
          ...base, post_id: post.id, creator_id: post.creator_id, brand_id: post.brand_id, bounty_id: post.bounty_id, status: 'open', hold_placed: false,
          opened_at: now.toISOString(), sla_due_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        }).select('id'),
      );
    }
  }
  return { postId: post.id, score: result.score, band: result.band, action: result.action, flagged };
}
