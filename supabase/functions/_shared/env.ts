// Typed environment. Every secret an edge function can read is declared here with the function(s) that need it, and a missing required
// value fails fast with the full list instead of a 500 in the middle of a payout run. The same names are documented in
// supabase/functions/.env.example and docs/ARCHITECTURE.md ("Environment variables").
//
// Adapter modes: FLOWD_ADAPTERS = mock | live sets the default for every provider; FLOWD_ADAPTER_<NAME> overrides one
// (PLATFORM, PAYMENTS, ADS, ML, PUSH). `mock` is the default: nothing here ever talks to a real provider unless a deployment says so.
//
// Erasable TypeScript only (runs under Deno and under Node's type stripping).

import { ConfigError } from './errors.ts';

export type AdapterMode = 'mock' | 'live';
export type AdapterName = 'platform' | 'payments' | 'ads' | 'ml' | 'push';

export interface Env {
  /** Supabase project URL and service-role key (injected by the Edge runtime). */
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Shared secret pg_cron sends as x-cron-secret (same value as the Vault secret `cron_secret`). */
  cronSecret: string;
  /** "Now" override for the demo world and tests (ISO-8601). Never set in production. */
  fixedNow: string | undefined;
  adapters: Record<AdapterName, AdapterMode>;
  /** AES-256-GCM key ring for social tokens and secrets: { "1": base64(32 bytes) }; the active version encrypts, all versions decrypt. */
  tokenKeys: Record<string, string>;
  tokenKeyActive: number;
  stripe: { secretKey: string | undefined; webhookSecret: string | undefined; connectWebhookSecret: string | undefined };
  revenuecat: { webhookSecret: string | undefined };
  ml: { baseUrl: string | undefined; apiKey: string | undefined };
  platforms: {
    tiktok: { clientKey: string | undefined; clientSecret: string | undefined };
    instagram: { appId: string | undefined; appSecret: string | undefined };
    google: { clientId: string | undefined; clientSecret: string | undefined };
  };
  apns: { keyP8: string | undefined; keyId: string | undefined; teamId: string | undefined; topic: string; sandbox: boolean };
  webhooksOutbound: { userAgent: string };
}

type Source = (name: string) => string | undefined;

function parseMode(value: string | undefined, fallback: AdapterMode, name: string): AdapterMode {
  if (value === undefined || value === '') return fallback;
  if (value === 'mock' || value === 'live') return value;
  throw new ConfigError(`${name} must be "mock" or "live", got "${value}"`);
}

/**
 * Read and validate the environment. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are always required; `required` lists the groups a function
 * needs on top ('cron' for scheduled jobs, 'stripe', 'tokens', ...) so a webhook function does not demand APNs keys. Pass `source` in tests.
 */
export function loadEnv(required: ReadonlyArray<'cron' | 'stripe' | 'revenuecat' | 'ml' | 'push' | 'tokens'> = [], source: Source = (n) => Deno.env.get(n)): Env {
  const missing: string[] = [];
  const need = (name: string): string => {
    const v = source(name);
    if (v === undefined || v === '') {
      missing.push(name);
      return '';
    }
    return v;
  };
  const opt = (name: string): string | undefined => {
    const v = source(name);
    return v === undefined || v === '' ? undefined : v;
  };

  const defaultMode = parseMode(opt('FLOWD_ADAPTERS'), 'mock', 'FLOWD_ADAPTERS');
  const modeFor = (n: AdapterName): AdapterMode => parseMode(opt(`FLOWD_ADAPTER_${n.toUpperCase()}`), defaultMode, `FLOWD_ADAPTER_${n.toUpperCase()}`);
  const adapters: Record<AdapterName, AdapterMode> = {
    platform: modeFor('platform'),
    payments: modeFor('payments'),
    ads: modeFor('ads'),
    ml: modeFor('ml'),
    push: modeFor('push'),
  };

  const env: Env = {
    supabaseUrl: need('SUPABASE_URL'),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    cronSecret: opt('CRON_SECRET') ?? '',
    fixedNow: opt('FLOWD_FIXED_NOW'),
    adapters,
    tokenKeys: {},
    tokenKeyActive: Number(opt('TOKEN_ENCRYPTION_ACTIVE_VERSION') ?? '1'),
    stripe: { secretKey: opt('STRIPE_SECRET_KEY'), webhookSecret: opt('STRIPE_WEBHOOK_SECRET'), connectWebhookSecret: opt('STRIPE_CONNECT_WEBHOOK_SECRET') },
    revenuecat: { webhookSecret: opt('REVENUECAT_WEBHOOK_SECRET') },
    ml: { baseUrl: opt('ML_BASE_URL'), apiKey: opt('ML_API_KEY') },
    platforms: {
      tiktok: { clientKey: opt('TIKTOK_CLIENT_KEY'), clientSecret: opt('TIKTOK_CLIENT_SECRET') },
      instagram: { appId: opt('INSTAGRAM_APP_ID'), appSecret: opt('INSTAGRAM_APP_SECRET') },
      google: { clientId: opt('GOOGLE_CLIENT_ID'), clientSecret: opt('GOOGLE_CLIENT_SECRET') },
    },
    apns: { keyP8: opt('APNS_KEY_P8'), keyId: opt('APNS_KEY_ID'), teamId: opt('APNS_TEAM_ID'), topic: opt('APNS_TOPIC') ?? 'app.flowd.creator', sandbox: opt('APNS_SANDBOX') === 'true' },
    webhooksOutbound: { userAgent: opt('WEBHOOK_USER_AGENT') ?? 'flowd-webhooks/1.0 (+https://joinflowd.io/docs/webhooks)' },
  };

  const keysJson = opt('TOKEN_ENCRYPTION_KEYS');
  if (keysJson !== undefined) {
    try {
      const parsed: unknown = JSON.parse(keysJson);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      for (const [version, key] of Object.entries(parsed)) {
        if (typeof key !== 'string') throw new Error(`key ${version} is not a string`);
        env.tokenKeys[version] = key;
      }
    } catch (err) {
      throw new ConfigError(`TOKEN_ENCRYPTION_KEYS must be JSON like {"1":"<base64 of 32 random bytes>"}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const group of required) {
    if (group === 'cron' && env.cronSecret === '') missing.push('CRON_SECRET');
    if (group === 'tokens' && Object.keys(env.tokenKeys).length === 0) missing.push('TOKEN_ENCRYPTION_KEYS');
    if (group === 'tokens' && env.tokenKeys[String(env.tokenKeyActive)] === undefined && Object.keys(env.tokenKeys).length > 0) {
      missing.push(`TOKEN_ENCRYPTION_KEYS[${env.tokenKeyActive}] (the active version)`);
    }
    if (group === 'stripe' && adapters.payments === 'live') {
      if (!env.stripe.secretKey) missing.push('STRIPE_SECRET_KEY');
      if (!env.stripe.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    }
    if (group === 'revenuecat' && !env.revenuecat.webhookSecret && adapters.platform === 'live') missing.push('REVENUECAT_WEBHOOK_SECRET');
    if (group === 'ml' && adapters.ml === 'live' && !env.ml.baseUrl) missing.push('ML_BASE_URL');
    if (group === 'push' && adapters.push === 'live') {
      if (!env.apns.keyP8) missing.push('APNS_KEY_P8');
      if (!env.apns.keyId) missing.push('APNS_KEY_ID');
      if (!env.apns.teamId) missing.push('APNS_TEAM_ID');
    }
  }

  if (missing.length > 0) {
    throw new ConfigError(`Missing environment: ${[...new Set(missing)].join(', ')}. See supabase/functions/.env.example.`);
  }
  return env;
}

/** The clock. FLOWD_FIXED_NOW pins it for the demo world; production leaves it unset. */
export function now(env: Pick<Env, 'fixedNow'>): Date {
  return env.fixedNow ? new Date(env.fixedNow) : new Date();
}
