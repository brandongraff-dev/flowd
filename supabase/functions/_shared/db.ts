// Database access for the edge functions: one service-role client and a few helpers that turn { data, error } into values or typed errors.
//
// The service role bypasses RLS (it is the API server's identity), so every function authenticates its caller first (auth.ts) and only
// then talks to the database. Money never moves through plain table writes: it moves through the SECURITY DEFINER functions of
// supabase/migrations/0003_functions.sql (fund_bounty, settle_post, clear_post, ...), which re-check every invariant themselves.
//
// Row types below describe only the columns these functions read. Generate the full set with
//   supabase gen types typescript --local > supabase/functions/_shared/database.types.ts
// and pass it as the client's Database generic if you want exhaustive checking.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Env } from './env.ts';
import { fromDatabaseError, type PostgrestLikeError } from './errors.ts';

export type Db = SupabaseClient;

export function serviceClient(env: Pick<Env, 'supabaseUrl' | 'serviceRoleKey'>): Db {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-flowd-client': 'edge-function' } },
  });
}

interface Result<T> {
  data: T | null;
  error: PostgrestLikeError | null;
}

/** Unwrap a query result: throw a FlowdError for a database error, return the data otherwise (never null for list queries). */
export function unwrap<T>(res: Result<T>): T {
  if (res.error) throw fromDatabaseError(res.error);
  return res.data as T;
}

/** For `.maybeSingle()` queries. */
export function unwrapMaybe<T>(res: Result<T>): T | null {
  if (res.error) throw fromDatabaseError(res.error);
  return res.data;
}

/** Call a SQL function. Business-rule failures (SQLSTATE FDnnn) surface as FlowdError with their API code. */
export async function rpc<T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await db.rpc(fn, args);
  return unwrap<T>(res as Result<T>);
}

/** Run `fn` and report whether it failed with the given business error code (used for "already done" cases that are not failures). */
export async function tolerate<T>(code: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code: unknown }).code === code) return undefined;
    throw err;
  }
}

// ── Row shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PostRow {
  id: string;
  submission_id: string;
  creator_id: string;
  brand_id: string;
  app_id: string;
  bounty_id: string;
  social_account_id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  platform_post_id: string;
  posted_at: string;
  window_ends_at: string;
  status: 'live' | 'window_closed' | 'held' | 'cleared' | 'paid' | 'removed' | 'clawed_back';
  views: number;
  window_views: number;
  views_invalid: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  fraud_score: number;
  fraud: { score: number; band: string; signals: unknown[] };
}

export interface SocialAccountRow {
  id: string;
  creator_id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  handle: string;
  followers: number;
  status: 'connected' | 'needs_reauth' | 'revoked' | 'pending';
  account_created_at: string;
  platform_user_id: string | null;
}

export interface BountyRow {
  id: string;
  brand_id: string;
  app_id: string;
  title: string;
  type: 'cpm' | 'cpa' | 'stacked' | 'direct' | 'install_only';
  status: string;
  visibility: string;
  cpm_cents: number;
  per_video_cap_cents: number;
  take_rate: number;
  remaining_cents: number;
  reserved_cents: number;
  funded: boolean;
  starts_at: string;
  ends_at: string;
  deliverables: { regions?: string[]; platforms?: string[] };
  eligibility: { min_target_audience_ratio?: number; min_tier?: string };
}

export interface PayoutRow {
  id: string;
  creator_id: string;
  kind: 'weekly' | 'instant';
  status: 'scheduled' | 'processing' | 'in_transit' | 'paid' | 'failed' | 'held' | 'cancelled';
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  run_id: string | null;
  payout_method_id: string | null;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  attempts: number;
  free_instant: boolean;
  initiated_at: string | null;
  scheduled_for: string;
}

export interface CreatorRow {
  id: string;
  user_id: string;
  handle: string;
  tier: string;
  stripe_account_id: string | null;
  payout_ready: boolean;
  verification_status: string;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'creator' | 'brand_member' | 'admin';
  locale: string;
  timezone: string;
}
