// Social platform adapter: verified views are the basis of payment, so reading them is an interface with a mock and a live implementation
// per platform behind it (FLOWD_ADAPTER_PLATFORM = mock | live). Nothing outside this folder knows which one is running.
//
// What an adapter must do
//   * fetchPostStats(): the post's current counts and, when the platform exposes them, the traffic-source and audience-country mix
//   * refreshAccessToken(): exchange a refresh token for a new access token (the caller re-seals and stores it)
//   * throw RateLimitedError / ReauthRequiredError / PostGoneError so the caller can react (stop the batch / ask the creator to reconnect /
//     mark the post removed) instead of guessing from a status code
//
// What an adapter must never do: invent a number. When a platform does not expose a signal (TikTok's Display API has no traffic sources,
// for example) the field is null and the fraud model reports the signal as "skipped", never as clean.

import { PostGoneError, RateLimitedError, ReauthRequiredError } from '../errors.ts';
import type { Env } from '../env.ts';

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube';
export type TrafficSource = 'fyp' | 'following' | 'profile' | 'search' | 'sound' | 'share' | 'other';

export interface PostStatsRequest {
  platform: SocialPlatform;
  platformPostId: string;
  accessToken: string;
  /** For the mock's curve. Live adapters ignore these. */
  postedAt: string;
  now: string;
}

export interface ViewExclusionDraft {
  cause: 'bot_pattern' | 'cap_clustering' | 'duplicate' | 'geo_outlier' | 'removed_post' | 'platform_adjustment';
  views: number;
  detail: string;
}

export interface PostStats {
  /** Cumulative views the platform reports. */
  viewsReported: number;
  /** Views that count for pay: reported minus the exclusions the platform itself declares (for example views bought through a paid promotion). */
  viewsVerified: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** Traffic-source mix summing to 1, or null when the platform does not expose it. */
  sources: Partial<Record<TrafficSource, number>> | null;
  /** Audience country mix summing to 1 (ISO 3166-1 alpha-2), or null. */
  geo: Record<string, number> | null;
  exclusions: ViewExclusionDraft[];
  fetchedAt: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  refreshExpiresAt: string | null;
  scopes: string[];
}

export interface PlatformAdapter {
  readonly platform: SocialPlatform;
  readonly mode: 'mock' | 'live';
  fetchPostStats(req: PostStatsRequest): Promise<PostStats>;
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}

// ── shared helpers for the live adapters ─────────────────────────────────────────────────────────────────────────────────

export async function fetchJson<T>(provider: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 429) throw new RateLimitedError(provider, Number(res.headers.get('retry-after') ?? '60'));
  if (res.status === 401 || res.status === 403) throw new ReauthRequiredError(provider, `HTTP ${res.status}`);
  if (res.status === 404 || res.status === 410) throw new PostGoneError(provider, url);
  if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ── TikTok (Display API v2: video.query) ─────────────────────────────────────────────────────────────────────────────────

interface TikTokVideoQuery {
  data?: { videos?: Array<{ id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }> };
  error?: { code: string; message: string };
}

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = 'tiktok' as const;
  readonly mode = 'live' as const;
  private readonly env: Pick<Env, 'platforms'>;
  constructor(env: Pick<Env, 'platforms'>) {
    this.env = env;
  }

  async fetchPostStats(req: PostStatsRequest): Promise<PostStats> {
    const out = await fetchJson<TikTokVideoQuery>('tiktok', 'https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count', {
      method: 'POST',
      headers: { authorization: `Bearer ${req.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { video_ids: [req.platformPostId] } }),
    });
    if (out.error && out.error.code !== 'ok') {
      if (out.error.code.includes('access_token')) throw new ReauthRequiredError('tiktok', out.error.message);
      throw new Error(`tiktok: ${out.error.code}: ${out.error.message}`);
    }
    const v = out.data?.videos?.find((x) => x.id === req.platformPostId);
    if (!v) throw new PostGoneError('tiktok', req.platformPostId);
    const views = v.view_count ?? 0;
    // The Display API has no traffic-source or geography breakdown and no way to tell paid-promotion views apart: they stay null/empty,
    // and the fraud model treats those signals as "skipped" rather than clean.
    return { viewsReported: views, viewsVerified: views, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0, saves: 0, sources: null, geo: null, exclusions: [], fetchedAt: req.now };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const { clientKey, clientSecret } = this.env.platforms.tiktok;
    if (!clientKey || !clientSecret) throw new Error('TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are required for live TikTok');
    const body = new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
    const t = await fetchJson<{ access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; scope: string }>('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const nowMs = Date.now();
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(nowMs + t.expires_in * 1000).toISOString(),
      refreshExpiresAt: new Date(nowMs + t.refresh_expires_in * 1000).toISOString(),
      scopes: t.scope.split(','),
    };
  }
}

// ── Instagram (Graph API: media insights of a professional account) ──────────────────────────────────────────────────────

interface IgInsights {
  data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
}

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = 'instagram' as const;
  readonly mode = 'live' as const;

  async fetchPostStats(req: PostStatsRequest): Promise<PostStats> {
    const metrics = 'views,likes,comments,shares,saved';
    const out = await fetchJson<IgInsights>('instagram', `https://graph.facebook.com/v21.0/${encodeURIComponent(req.platformPostId)}/insights?metric=${metrics}`, {
      headers: { authorization: `Bearer ${req.accessToken}` },
    });
    const read = (name: string): number => {
      const m = out.data?.find((x) => x.name === name);
      return m?.total_value?.value ?? m?.values?.[0]?.value ?? 0;
    };
    const views = read('views');
    return { viewsReported: views, viewsVerified: views, likes: read('likes'), comments: read('comments'), shares: read('shares'), saves: read('saved'), sources: null, geo: null, exclusions: [], fetchedAt: req.now };
  }

  /** Instagram long-lived tokens (60 days) are refreshed with themselves: the "refresh token" is the current access token. */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const t = await fetchJson<{ access_token: string; expires_in: number }>('instagram', `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(refreshToken)}`, {});
    return { accessToken: t.access_token, refreshToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(), refreshExpiresAt: null, scopes: ['instagram_basic', 'instagram_manage_insights'] };
  }
}

// ── YouTube (Data API v3: videos.list statistics) ────────────────────────────────────────────────────────────────────────

interface YtVideos {
  items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
}

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;
  readonly mode = 'live' as const;
  private readonly env: Pick<Env, 'platforms'>;
  constructor(env: Pick<Env, 'platforms'>) {
    this.env = env;
  }

  async fetchPostStats(req: PostStatsRequest): Promise<PostStats> {
    const out = await fetchJson<YtVideos>('youtube', `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(req.platformPostId)}`, {
      headers: { authorization: `Bearer ${req.accessToken}` },
    });
    const s = out.items?.find((x) => x.id === req.platformPostId)?.statistics;
    if (!s) throw new PostGoneError('youtube', req.platformPostId);
    const views = Number(s.viewCount ?? 0);
    return { viewsReported: views, viewsVerified: views, likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0), shares: 0, saves: 0, sources: null, geo: null, exclusions: [], fetchedAt: req.now };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const { clientId, clientSecret } = this.env.platforms.google;
    if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for live YouTube');
    const t = await fetchJson<{ access_token: string; expires_in: number; scope: string }>('youtube', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    return { accessToken: t.access_token, refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(), refreshExpiresAt: null, scopes: t.scope.split(' ') };
  }
}

// ── Mock ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic organic-looking stats: a saturating curve (most views in the first day, a long tail), engagement ratios and a source mix
 * that depend only on the post id, so the same post gives the same numbers on every run and in every environment. A post whose id ends in
 * "-bot" gets a stepped, external-heavy curve: it is how the demo world shows the fraud gate working.
 */
export class MockPlatformAdapter implements PlatformAdapter {
  readonly mode = 'mock' as const;
  readonly platform: SocialPlatform;
  constructor(platform: SocialPlatform) {
    this.platform = platform;
  }

  fetchPostStats(req: PostStatsRequest): Promise<PostStats> {
    const h = hash32(req.platformPostId);
    const hours = Math.max(0, (Date.parse(req.now) - Date.parse(req.postedAt)) / 3_600_000);
    const eventual = 4000 + (h % 90_000);
    const bot = req.platformPostId.endsWith('-bot');
    const share = bot ? (hours < 6 ? 0.02 : 0.97) : 1 - Math.exp(-hours / 22);
    const views = Math.round(eventual * share);
    const like = 0.035 + ((h >>> 8) % 40) / 1000;
    const engagement = bot ? 0.002 : 1;
    const sources: Partial<Record<TrafficSource, number>> = bot
      ? { fyp: 0.18, following: 0.02, profile: 0.01, search: 0.01, sound: 0.0, share: 0.0, other: 0.78 }
      : { fyp: 0.62, following: 0.14, profile: 0.08, search: 0.06, sound: 0.04, share: 0.04, other: 0.02 };
    const geo: Record<string, number> = bot ? { US: 0.12, IN: 0.52, PH: 0.2, BR: 0.16 } : { US: 0.71, CA: 0.06, GB: 0.08, AU: 0.04, DE: 0.04, MX: 0.03, BR: 0.04 };
    const stats: PostStats = {
      viewsReported: views,
      viewsVerified: views,
      likes: Math.round(views * like * engagement),
      comments: Math.round(views * (like / 14) * engagement),
      shares: Math.round(views * (like / 6) * engagement),
      saves: Math.round(views * (like / 4) * engagement),
      sources,
      geo,
      exclusions: [],
      fetchedAt: req.now,
    };
    return Promise.resolve(stats);
  }

  refreshAccessToken(_refreshToken: string): Promise<TokenSet> {
    const expires = new Date(Date.now() + 3600_000).toISOString();
    return Promise.resolve({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresAt: expires, refreshExpiresAt: null, scopes: ['video.list'] });
  }
}
