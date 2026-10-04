// daily-drop: one drop a day at 16:00 UTC, with real inventory.   POST /functions/v1/daily-drop  { "phase": "prepare" | "release" | "close" }
//
//   phase "prepare"  pg_cron: 14:00 UTC. Build today's drop (state `upcoming`, the pre-drop countdown): pick the best bounties (select.ts), each with
//                    spots = what its pool truly has room for. No qualifying bounty = no drop that day, and the app says so.
//   phase "release"  pg_cron: 16:00 UTC. Re-check every item against its pool NOW (a bounty may have filled or paused since 14:00), drop items that
//                    no longer have room, set the drop `live`, and tell the creators who opted in to the one Daily Drop reminder.
//   phase "close"    pg_cron: every hour at :10. Keep counts true while the drop is live: an item can never offer more than its claims plus the pool's
//                    remaining room (drop_inventory_sync derives spots_left and `sold_out` from the rows). When the 24-hour claim window ends the drop
//                    closes.
//
// Claiming is a database operation (claim_drop_spot): a spot is claimed under a row lock, so the count in the app is the count in the table.
// Idempotent: the drop id is drop_<yyyymmdd>; every phase checks the state it expects.

import { buildAdapters } from '../_shared/adapters/index.ts';
import { requireCaller } from '../_shared/auth.ts';
import { type Db, serviceClient, unwrap, unwrapMaybe } from '../_shared/db.ts';
import { loadEnv, now as clock } from '../_shared/env.ts';
import { FlowdError } from '../_shared/errors.ts';
import { handle, readJson, requireMethod } from '../_shared/http.ts';
import { daySlot, hourSlot, runJob } from '../_shared/jobs.ts';
import { notify } from '../_shared/notify.ts';
import { mapLimit } from '../_shared/pool.ts';
import { DEFAULT_CONFIG, type DropCandidate, headline, pickItems, spotsLeft, syncedSpotsTotal } from './select.ts';
import type { Adapters } from '../_shared/adapters/index.ts';

interface Body {
  phase?: 'prepare' | 'release' | 'close';
  scheduled_for?: string;
  /** Prepare a drop even though today's release time has passed (manual). */
  for_date?: string;
}

export interface PrepareStats extends Record<string, unknown> {
  drop_id: string | null;
  date: string;
  candidates: number;
  items: number;
  spots: number;
  skipped: string | null;
}

export interface ReleaseStats extends Record<string, unknown> {
  drop_id: string | null;
  items_kept: number;
  items_dropped: number;
  notified: number;
  status: string | null;
}

export interface CloseStats extends Record<string, unknown> {
  synced_items: number;
  closed_drops: number;
}

interface BountyRow {
  id: string;
  brand_id: string;
  cpm_cents: number;
  per_video_cap_cents: number;
  take_rate: number;
  remaining_cents: number;
  published_at: string | null;
  apps: { category: string } | Array<{ category: string }> | null;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

function releaseAt(date: string): string {
  return `${date}T16:00:00.000Z`;
}

export async function runPrepare(db: Db, now: Date, forDate?: string): Promise<PrepareStats> {
  // before 16:00 UTC we prepare today's drop; after it, tomorrow's
  const date = forDate ?? ymd(now.getTime() < Date.parse(releaseAt(ymd(now))) ? now : new Date(now.getTime() + 86_400_000));
  const stats: PrepareStats = { drop_id: null, date, candidates: 0, items: 0, spots: 0, skipped: null };
  const id = `drop_${date.replaceAll('-', '')}`;
  const existing = unwrapMaybe(await db.from('daily_drops').select('id').eq('date', date).maybeSingle()) as { id: string } | null;
  if (existing) {
    stats.drop_id = existing.id;
    stats.skipped = 'a drop already exists for this date';
    return stats;
  }

  const rows = unwrap(
    await db.from('bounties').select('id,brand_id,cpm_cents,per_video_cap_cents,take_rate,remaining_cents,published_at,apps!inner(category)')
      .eq('status', 'live').eq('funded', true).eq('is_starter', false).in('visibility', ['open', 'drop']).gt('ends_at', new Date(now.getTime() + 24 * 3_600_000).toISOString()).gt('remaining_cents', 0).limit(500),
  ) as BountyRow[];
  const brandIds = [...new Set(rows.map((r) => r.brand_id))];
  const scores = new Map<string, number | null>();
  if (brandIds.length > 0) {
    for (const s of unwrap(await db.from('brand_scorecards').select('brand_id,reliability_score,band').eq('window_days', 90).in('brand_id', brandIds)) as Array<{ brand_id: string; reliability_score: number; band: string }>) {
      scores.set(s.brand_id, s.band === 'new' ? null : s.reliability_score);
    }
  }
  const recent = new Map<string, number>();
  const since = ymd(new Date(now.getTime() - 14 * 86_400_000));
  for (const r of unwrap(await db.from('drop_items').select('bounty_id,daily_drops!inner(date)').gte('daily_drops.date', since)) as Array<{ bounty_id: string; daily_drops: { date: string } | Array<{ date: string }> }>) {
    const d = Array.isArray(r.daily_drops) ? r.daily_drops[0]?.date : r.daily_drops.date;
    if (!d) continue;
    const days = Math.floor((now.getTime() - Date.parse(d)) / 86_400_000);
    recent.set(r.bounty_id, Math.min(recent.get(r.bounty_id) ?? 999, days));
  }

  const candidates: DropCandidate[] = rows.map((r) => ({
    bountyId: r.id, brandId: r.brand_id, category: (Array.isArray(r.apps) ? r.apps[0]?.category : r.apps?.category) ?? 'lifestyle', brandScore: scores.get(r.brand_id) ?? null, cpmCents: r.cpm_cents,
    spotsLeft: spotsLeft(r.remaining_cents, r.per_video_cap_cents, r.take_rate), publishedAt: r.published_at ?? now.toISOString(), daysSinceLastDrop: recent.get(r.id) ?? null,
  }));
  stats.candidates = candidates.length;
  const items = pickItems(candidates, now, DEFAULT_CONFIG);
  if (items.length === 0) {
    stats.skipped = 'no bounty has enough room today';
    return stats;
  }
  const release = releaseAt(date);
  unwrap(
    await db.from('daily_drops').insert({ id, date, release_at: release, claim_window_ends_at: new Date(Date.parse(release) + 86_400_000).toISOString(), status: 'upcoming', headline: headline(items) }).select('id'),
  );
  unwrap(await db.from('drop_items').insert(items.map((i) => ({ drop_id: id, bounty_id: i.bountyId, spots_total: i.spotsTotal, position: i.position }))).select('bounty_id'));
  stats.drop_id = id;
  stats.items = items.length;
  stats.spots = items.reduce((a, i) => a + i.spotsTotal, 0);
  return stats;
}

interface ItemRow {
  drop_id: string;
  bounty_id: string;
  spots_total: number;
}

async function poolSpots(db: Db, bountyId: string): Promise<number> {
  const b = unwrapMaybe(await db.from('bounties').select('status,funded,remaining_cents,per_video_cap_cents,take_rate,ends_at').eq('id', bountyId).maybeSingle()) as
    | { status: string; funded: boolean; remaining_cents: number; per_video_cap_cents: number; take_rate: number; ends_at: string }
    | null;
  if (!b || b.status !== 'live' || !b.funded) return 0;
  return spotsLeft(b.remaining_cents, b.per_video_cap_cents, b.take_rate);
}

/** Make every item of a drop honest right now. Returns [kept, dropped]. */
async function syncItems(db: Db, dropId: string): Promise<[number, number]> {
  const items = unwrap(await db.from('drop_items').select('drop_id,bounty_id,spots_total').eq('drop_id', dropId)) as ItemRow[];
  let kept = 0;
  let dropped = 0;
  for (const it of items) {
    const claims = (unwrap(await db.from('drop_claims').select('creator_id').eq('drop_id', dropId).eq('bounty_id', it.bounty_id)) as Array<{ creator_id: string }>).length;
    const total = syncedSpotsTotal(it.spots_total, claims, await poolSpots(db, it.bounty_id));
    if (total === 0) {
      unwrap(await db.from('drop_items').delete().eq('drop_id', dropId).eq('bounty_id', it.bounty_id).select('bounty_id'));
      dropped++;
    } else {
      if (total !== it.spots_total) unwrap(await db.from('drop_items').update({ spots_total: total }).eq('drop_id', dropId).eq('bounty_id', it.bounty_id).select('bounty_id'));
      kept++;
    }
  }
  return [kept, dropped];
}

export async function runRelease(db: Db, adapters: Adapters, now: Date): Promise<ReleaseStats> {
  const date = ymd(now);
  const stats: ReleaseStats = { drop_id: null, items_kept: 0, items_dropped: 0, notified: 0, status: null };
  const drop = unwrapMaybe(await db.from('daily_drops').select('id,status,release_at').eq('date', date).maybeSingle()) as { id: string; status: string; release_at: string } | null;
  if (!drop) return stats;
  stats.drop_id = drop.id;
  stats.status = drop.status;
  if (drop.status !== 'upcoming' || now.getTime() < Date.parse(drop.release_at)) return stats;

  const [kept, dropped] = await syncItems(db, drop.id);
  stats.items_kept = kept;
  stats.items_dropped = dropped;
  unwrap(await db.from('daily_drops').update({ status: 'live' }).eq('id', drop.id).eq('status', 'upcoming').select('id'));
  stats.status = 'live';
  if (kept === 0) {
    // Every item filled or paused between 14:00 and 16:00. An honest empty drop: live, then closed, with the reason in the headline.
    unwrap(await db.from('daily_drops').update({ status: 'closed', headline: 'No drop today: every bounty filled before 16:00. Tomorrow at 16:00 UTC.' }).eq('id', drop.id).select('id'));
    stats.status = 'closed';
    return stats;
  }

  const current = unwrap(await db.from('daily_drops').select('spots_total').eq('id', drop.id).maybeSingle()) as unknown as { spots_total: number } | null;
  const optedIn = unwrap(await db.from('notification_prefs').select('user_id').eq('drop_reminder', true).eq('push', true).limit(20000)) as Array<{ user_id: string }>;
  const results = await mapLimit(optedIn, 10, (p) =>
    notify(db, adapters.push, { recipientUserId: p.user_id, audience: 'creator', kind: 'drop_live', priority: 'normal', title: "Today's Daily Drop is live", body: `${kept} bounties, ${current?.spots_total ?? 0} real spots. Claim one and you have 24 hours to submit.`, deepLink: 'flowd://drop', refKind: 'daily_drop', refId: drop.id }, now),
  );
  stats.notified = results.filter((r) => r.ok).length;
  return stats;
}

export async function runClose(db: Db, now: Date): Promise<CloseStats> {
  const stats: CloseStats = { synced_items: 0, closed_drops: 0 };
  const live = unwrap(await db.from('daily_drops').select('id,status,claim_window_ends_at').in('status', ['live', 'sold_out'])) as Array<{ id: string; status: string; claim_window_ends_at: string }>;
  for (const d of live) {
    if (now.getTime() >= Date.parse(d.claim_window_ends_at)) {
      unwrap(await db.from('daily_drops').update({ status: 'closed' }).eq('id', d.id).eq('status', d.status).select('id'));
      stats.closed_drops++;
    } else if (d.status === 'live') {
      const [kept, dropped] = await syncItems(db, d.id);
      stats.synced_items += kept + dropped;
    }
  }
  return stats;
}

export const handler = handle('daily-drop', async (req) => {
  requireMethod(req, 'POST');
  const env = loadEnv(['cron', 'push']);
  requireCaller(req, env);
  const body = await readJson<Body>(req);
  const phase = body.phase;
  if (phase !== 'prepare' && phase !== 'release' && phase !== 'close') throw new FlowdError('validation_failed', 'phase must be "prepare", "release" or "close".', 422);
  const now = clock(env);
  const db = serviceClient(env);
  const adapters = buildAdapters(env);
  if (phase === 'prepare') {
    const outcome = await runJob<PrepareStats>(db, 'daily-drop:prepare', body.scheduled_for ?? daySlot(now, 14), now, () => runPrepare(db, now, body.for_date));
    return { ...outcome };
  }
  if (phase === 'release') {
    const outcome = await runJob<ReleaseStats>(db, 'daily-drop:release', body.scheduled_for ?? daySlot(now, 16), now, () => runRelease(db, adapters, now));
    return { ...outcome };
  }
  const outcome = await runJob<CloseStats>(db, 'daily-drop:close', body.scheduled_for ?? hourSlot(now), now, () => runClose(db, now));
  return { ...outcome };
});
