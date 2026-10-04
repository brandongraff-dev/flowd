// The adapter registry: one place that turns FLOWD_ADAPTERS / FLOWD_ADAPTER_<NAME> into concrete implementations.
// Functions ask for what they need (`adapters.payments`) and never import a live implementation directly, so swapping mock for live is a
// configuration change, and a mock deployment cannot reach a real provider by accident.

import type { Env } from '../env.ts';
import { type AdsAdapter, LiveAdsAdapter, MockAdsAdapter } from './ads.ts';
import { LiveMlAdapter, type MlAdapter, MockMlAdapter } from './ml.ts';
import { MockPaymentsAdapter, type PaymentsAdapter, StripeAdapter } from './payments.ts';
import { InstagramAdapter, MockPlatformAdapter, type PlatformAdapter, type SocialPlatform, TikTokAdapter, YouTubeAdapter } from './platform.ts';
import { ApnsPushAdapter, MockPushAdapter, type PushAdapter } from './push.ts';

export interface Adapters {
  platform(platform: SocialPlatform): PlatformAdapter;
  payments: PaymentsAdapter;
  ads: AdsAdapter;
  ml: MlAdapter;
  push: PushAdapter;
}

export function buildAdapters(env: Env): Adapters {
  const platform = (p: SocialPlatform): PlatformAdapter => {
    if (env.adapters.platform === 'mock') return new MockPlatformAdapter(p);
    switch (p) {
      case 'tiktok': return new TikTokAdapter(env);
      case 'instagram': return new InstagramAdapter();
      case 'youtube': return new YouTubeAdapter(env);
    }
  };
  return {
    platform,
    payments: env.adapters.payments === 'live' ? new StripeAdapter(env) : new MockPaymentsAdapter(),
    ads: env.adapters.ads === 'live' ? new LiveAdsAdapter() : new MockAdsAdapter(),
    ml: env.adapters.ml === 'live' ? new LiveMlAdapter(env) : new MockMlAdapter(),
    push: env.adapters.push === 'live' ? new ApnsPushAdapter(env) : new MockPushAdapter(),
  };
}

export type { AdsAdapter, MlAdapter, PaymentsAdapter, PlatformAdapter, PushAdapter, SocialPlatform };
