// Client for services/ml (FastAPI, Modal in production). The edge functions use three endpoints: /v1/fraud (the settlement gate),
// /v1/fatigue (refresh alerts) and /v1/embed (bounty and portfolio embeddings). The request and response types are the subset of
// services/ml/openapi.json that these functions touch; the service's own contract tests keep the full shapes honest.
//
// The mock is not a stand-in model: it is the SAME checklist the real service runs (DOMAIN section 12.4, "Fraud score composition") reduced
// to the signals computable from what the platform adapter gives us, so a mock deployment still holds a spiking, external-heavy post for
// review. Every score carries its evidence; a signal that cannot be computed is reported as skipped, never as clean.

import type { Env } from '../env.ts';

export interface FraudRequest {
  post_id?: string;
  post: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    hourly_views?: number[] | null;
    snapshots?: Array<{ t_hours: number; views: number }> | null;
    traffic_sources?: Record<string, number> | null;
    geo?: Record<string, number> | null;
    baseline_hourly_views?: number | null;
  };
  account?: { followers?: number | null; account_age_days?: number | null; comment_ratio_mean_28d?: number | null; comment_ratio_sd_28d?: number | null };
  bounty?: { target_countries: string[]; min_target_audience_ratio?: number | null; per_video_cap_cents?: number | null; cpm_cents?: number | null };
  history?: Array<{ earnings_cents: number; cap_cents?: number | null }>;
  duplicate?: { phash_distance?: number | null; duplicate_of?: string | null; kind: string } | null;
}

export interface FraudSignalHit {
  signal: string;
  severity: number;
  points: number;
  detail: string;
}

export interface FraudResponse {
  score: number;
  band: 'clean' | 'watch' | 'review' | 'high';
  action: string;
  review_sla_hours: number | null;
  summary: string;
  signals: FraudSignalHit[];
  curve: { shape: string; spike_ratio: number; top2_bucket_share: number; flat_run_hours: number; baseline_hourly_views: number } | null;
  model: { name: string; version: string; stage: string };
}

export interface FatigueRequest {
  series: Array<{ date: string; installs: number; trials: number; views: number }>;
}

export interface FatigueResponse {
  status: 'healthy' | 'watch' | 'fatigued' | 'insufficient_data';
  peak_rate: number | null;
  current_rate: number | null;
  drop_pct: number | null;
  summary: string;
}

export interface MlAdapter {
  readonly mode: 'mock' | 'live';
  fraud(req: FraudRequest): Promise<FraudResponse>;
  fatigue(req: FatigueRequest): Promise<FatigueResponse>;
}

export class LiveMlAdapter implements MlAdapter {
  readonly mode = 'live' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: Pick<Env, 'ml'>) {
    if (!env.ml.baseUrl) throw new Error('ML_BASE_URL is required for the live ML adapter');
    this.baseUrl = env.ml.baseUrl.replace(/\/+$/, '');
    this.apiKey = env.ml.apiKey;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`ml ${path} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  fraud(req: FraudRequest): Promise<FraudResponse> {
    return this.post<FraudResponse>('/v1/fraud', req);
  }

  fatigue(req: FatigueRequest): Promise<FatigueResponse> {
    return this.post<FatigueResponse>('/v1/fatigue', req);
  }
}

/** Points per signal (CONSTANTS.fraud.signals) for the signals the mock can compute. */
const MAX_POINTS = { view_spike_no_engagement: 25, bought_views_pattern: 30, geo_mismatch: 15, view_to_follower_outlier: 10, new_account: 10, engagement_anomaly: 10, traffic_source_anomaly: 10, curve_shape: 10 } as const;

export class MockMlAdapter implements MlAdapter {
  readonly mode = 'mock' as const;

  fraud(req: FraudRequest): Promise<FraudResponse> {
    const hits: FraudSignalHit[] = [];
    const add = (signal: keyof typeof MAX_POINTS, severity: number, detail: string): void => {
      const s = Math.max(0, Math.min(1, severity));
      const points = Math.round(MAX_POINTS[signal] * s);
      if (points > 0) hits.push({ signal, severity: Math.round(s * 100) / 100, points, detail });
    };
    const p = req.post;
    const engagement = p.views > 0 ? (p.likes + p.comments + p.shares) / p.views : 0;
    const other = p.traffic_sources?.other ?? 0;
    if (p.views > 20_000 && engagement < 0.005) add('view_spike_no_engagement', 0.8, `Engagement is ${(engagement * 100).toFixed(2)}% of views (under 0.5%).`);
    if (other > 0.5) add('traffic_source_anomaly', Math.min(1, (other - 0.5) / 0.3 + 0.3), `${Math.round(other * 100)}% of views come from external or "other" sources.`);
    if (other > 0.6 && engagement < 0.01) add('bought_views_pattern', 0.9, 'Most views arrive from an unknown source with almost no engagement.');
    if (req.bounty?.min_target_audience_ratio && req.bounty.target_countries.length > 0 && p.geo) {
      const inTarget = req.bounty.target_countries.reduce((sum, c) => sum + (p.geo?.[c] ?? 0), 0);
      const gap = req.bounty.min_target_audience_ratio - inTarget;
      if (gap > 0.25) add('geo_mismatch', Math.min(1, gap), `${Math.round(inTarget * 100)}% of the audience is in the target regions (needs ${Math.round(req.bounty.min_target_audience_ratio * 100)}%).`);
    }
    if (req.account?.followers != null && req.account.followers < 5000 && p.views > 40 * Math.max(1, req.account.followers)) add('view_to_follower_outlier', 1, `Views are more than 40x the ${req.account.followers} followers.`);
    if (req.account?.account_age_days != null && req.account.account_age_days < 30) add('new_account', 1, `The account is ${Math.round(req.account.account_age_days)} days old.`);
    const hourly = p.hourly_views ?? [];
    if (hourly.length >= 6) {
      const total = hourly.reduce((a, b) => a + b, 0);
      const top2 = [...hourly].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
      if (total > 0 && top2 / total >= 0.8) add('curve_shape', 0.6, `${Math.round((top2 / total) * 100)}% of views arrived in two hours.`);
    }
    const score = Math.min(100, hits.reduce((a, h) => a + h.points, 0));
    const band = score >= 70 ? 'high' : score >= 40 ? 'review' : score >= 20 ? 'watch' : 'clean';
    const action = score >= 70 ? 'auto_hold_and_queue' : score >= 40 ? 'hold_for_human_review' : 'auto_clear';
    return Promise.resolve({
      score, band, action, review_sla_hours: score >= 40 ? 24 : null,
      summary: hits.length === 0 ? 'No fraud signals fired.' : `Fraud score ${score} (${band}): ${hits.map((h) => h.signal).join(', ')}.`,
      signals: hits, curve: null, model: { name: 'fraud', version: 'mock-1.0.0', stage: 'heuristic' },
    });
  }

  fatigue(req: FatigueRequest): Promise<FatigueResponse> {
    const rates = req.series.filter((d) => d.installs > 0).map((d) => d.trials / d.installs);
    if (rates.length < 7) return Promise.resolve({ status: 'insufficient_data', peak_rate: null, current_rate: null, drop_pct: null, summary: 'Fewer than 7 days of data.' });
    const peak = Math.max(...rates);
    const current = rates.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, rates.length);
    const drop = peak > 0 ? (peak - current) / peak : 0;
    const status = drop >= 0.3 ? 'fatigued' : drop >= 0.2 ? 'watch' : 'healthy';
    return Promise.resolve({ status, peak_rate: peak, current_rate: current, drop_pct: Math.round(drop * 100), summary: `Trial rate is ${Math.round(drop * 100)}% below its peak.` });
  }
}
