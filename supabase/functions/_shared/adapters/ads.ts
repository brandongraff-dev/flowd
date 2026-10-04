// Ads adapter: Winner promotion (Spark ads on TikTok, partnership ads on Meta). The platform permission flow (the creator authorises a
// Spark code or a partnership permission) lives in the API and the Rights Vault; the edge functions need exactly two things from the ad
// platform: read an ad's delivery numbers, and stop an ad. "Ads stop automatically when the Spark code or the rights term ends"
// (DECISIONS section 3) is enforced by expiry-alerts through stopAd().
//
// Credentials are the brand's ad-account tokens: decrypted by the caller from encrypted_secrets (integrations of kind tiktok_ads /
// meta_ads) and passed in, never stored here.

export type AdPlatform = 'tiktok' | 'meta';

export interface AdAccount {
  platform: AdPlatform;
  accessToken: string;
  /** TikTok advertiser id or Meta ad account id. */
  accountId: string;
}

export interface AdDelivery {
  spendCents: number;
  impressions: number;
  clicks: number;
  installs: number;
  fetchedAt: string;
}

export interface AdsAdapter {
  readonly mode: 'mock' | 'live';
  /** Stop delivery for good (status DISABLE / PAUSED). Idempotent: stopping a stopped ad succeeds. */
  stopAd(account: AdAccount, externalAdId: string): Promise<{ stopped: boolean }>;
  getDelivery(account: AdAccount, externalAdId: string): Promise<AdDelivery>;
}

async function ok(provider: string, res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${text.slice(0, 300)}`);
  return text === '' ? {} : JSON.parse(text);
}

export class LiveAdsAdapter implements AdsAdapter {
  readonly mode = 'live' as const;

  async stopAd(account: AdAccount, externalAdId: string): Promise<{ stopped: boolean }> {
    if (account.platform === 'tiktok') {
      // TikTok Marketing API: ad/status/update with operation_status DISABLE.
      const body = (await ok('tiktok-ads', await fetch('https://business-api.tiktok.com/open_api/v1.3/ad/status/update/', {
        method: 'POST',
        headers: { 'access-token': account.accessToken, 'content-type': 'application/json' },
        body: JSON.stringify({ advertiser_id: account.accountId, ad_ids: [externalAdId], operation_status: 'DISABLE' }),
      }))) as { code?: number; message?: string };
      if (body.code !== undefined && body.code !== 0) throw new Error(`tiktok-ads: ${body.code} ${body.message ?? ''}`);
      return { stopped: true };
    }
    // Meta Marketing API: POST /{ad-id} status=PAUSED.
    await ok('meta-ads', await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(externalAdId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${account.accessToken}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: 'PAUSED' }),
    }));
    return { stopped: true };
  }

  async getDelivery(account: AdAccount, externalAdId: string): Promise<AdDelivery> {
    const fetchedAt = new Date().toISOString();
    if (account.platform === 'meta') {
      const j = (await ok('meta-ads', await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(externalAdId)}/insights?fields=spend,impressions,inline_link_clicks,actions&date_preset=maximum`, {
        headers: { authorization: `Bearer ${account.accessToken}` },
      }))) as { data?: Array<{ spend?: string; impressions?: string; inline_link_clicks?: string; actions?: Array<{ action_type: string; value: string }> }> };
      const row = j.data?.[0];
      const installs = Number(row?.actions?.find((a) => a.action_type === 'mobile_app_install')?.value ?? 0);
      return { spendCents: Math.round(Number(row?.spend ?? 0) * 100), impressions: Number(row?.impressions ?? 0), clicks: Number(row?.inline_link_clicks ?? 0), installs, fetchedAt };
    }
    const qs = new URLSearchParams({
      advertiser_id: account.accountId,
      report_type: 'BASIC',
      data_level: 'AUCTION_AD',
      dimensions: JSON.stringify(['ad_id']),
      metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'conversion']),
      filtering: JSON.stringify([{ field_name: 'ad_ids', filter_type: 'IN', filter_value: JSON.stringify([externalAdId]) }]),
    });
    const j = (await ok('tiktok-ads', await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${qs.toString()}`, { headers: { 'access-token': account.accessToken } }))) as {
      data?: { list?: Array<{ metrics: { spend: string; impressions: string; clicks: string; conversion: string } }> };
    };
    const m = j.data?.list?.[0]?.metrics;
    return { spendCents: Math.round(Number(m?.spend ?? 0) * 100), impressions: Number(m?.impressions ?? 0), clicks: Number(m?.clicks ?? 0), installs: Number(m?.conversion ?? 0), fetchedAt };
  }
}

/** Mock: nothing leaves the process. Stopping always succeeds, delivery is a stable function of the ad id. */
export class MockAdsAdapter implements AdsAdapter {
  readonly mode = 'mock' as const;
  readonly stopped = new Set<string>();

  stopAd(_account: AdAccount, externalAdId: string): Promise<{ stopped: boolean }> {
    this.stopped.add(externalAdId);
    return Promise.resolve({ stopped: true });
  }

  getDelivery(_account: AdAccount, externalAdId: string): Promise<AdDelivery> {
    let h = 7;
    for (let i = 0; i < externalAdId.length; i++) h = (h * 31 + externalAdId.charCodeAt(i)) >>> 0;
    const impressions = 20_000 + (h % 400_000);
    return Promise.resolve({ spendCents: Math.round(impressions * 0.0045), impressions, clicks: Math.round(impressions * 0.011), installs: Math.round(impressions * 0.0016), fetchedAt: new Date().toISOString() });
  }
}
