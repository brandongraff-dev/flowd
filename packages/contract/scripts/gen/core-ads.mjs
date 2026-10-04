// CORE stage 6b: Winner promotion ads (Spark / partnership). Nine ads covering every AdStatus; Lumi's two live ads follow the scenario seeds.

import { allocate, slugify } from './lib.mjs';
import { mulRate, adCommission, adPlatformFee, adCommissionWindowEnds } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, alnum } from './core-kit.mjs';

const D = (md, hh = 10, mm = 0) => ms(`2026-${md}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);

/** [ad number, bounty, status, platform, started, ended/paused, code days, requested, granted, extra] */
const AD_PLAN = [
  { n: 1, bounty: 'lumi_headshots', maya: true, status: 'live', platform: 'tiktok', started: D('09-19', 10), codeDays: 60, requested: D('08-16', 11, 40), granted: D('08-18', 14), spend: 120_000, paidConv: 31, daily: [1, 2, 3, 2, 3, 2, 2, 3, 2, 2, 2, 2, 2, 2, 1], dailyBudget: 9_000 },
  { n: 2, bounty: 'lumi_headshots', status: 'fatigued', platform: 'tiktok', started: D('09-07', 13), codeDays: 60, requested: D('09-03', 9), granted: D('09-05', 15, 30), spend: 252_000, paidConv: 58, fatigue: 0.34, dailyBudget: 14_000 },
  { n: 3, bounty: 'dozely_asleep', status: 'paused', platform: 'tiktok', started: D('09-01', 14), pausedAt: D('09-24', 9), codeDays: 60, requested: D('08-28', 10), granted: D('08-30', 16), spend: 148_500, paidConv: 36, dailyBudget: 7_500 },
  { n: 4, bounty: 'budgetbee_paycheck', status: 'ended', platform: 'meta', started: D('09-02', 12), ended: D('09-16', 12), codeDays: 30, requested: D('08-29', 9), granted: D('08-31', 11), spend: 98_000, paidConv: 21, dailyBudget: 7_000 },
  { n: 5, bounty: 'stridely_firstweek', status: 'ended', platform: 'tiktok', started: D('08-27', 15), ended: D('09-10', 15), codeDays: 30, requested: D('08-24', 10), granted: D('08-26', 9), spend: 84_000, paidConv: 17, dailyBudget: 6_000 },
  { n: 6, bounty: 'parlo_day1', status: 'expired', platform: 'tiktok', started: D('08-29', 11), ended: D('09-12', 11), codeDays: 30, requested: D('08-25', 11), granted: D('08-28', 10), spend: 66_000, paidConv: 13, dailyBudget: 5_000 },
  { n: 7, bounty: 'tasklane_plan60', status: 'requested', platform: 'meta', requested: D('10-01', 15) },
  { n: 8, bounty: 'glowkit_nostudio', status: 'authorised', platform: 'tiktok', requested: D('09-29', 10), granted: D('10-02', 11), codeDays: 30 },
  { n: 9, bounty: 'scoutly_research', status: 'declined', platform: 'tiktok', requested: D('09-26', 12) },
];

/** pick the best settled winner for a bounty: highest trial rate with enough installs, older than 12 days, not removed or clawed back */
function bestPost(W, bounty, excluded) {
  const cands = bounty.posts.filter((p) => !p.removedAt && p.role !== 'clawback' && !p.isLive && !excluded.has(p) && (NOW_EPOCH - p.postedAtMs) / DAY_MS > 12 && p.fn && p.fn.views > 3000);
  cands.sort((a, b) => (b.fn.trials + b.fn.paid * 2) / Math.max(1, b.fn.views) - (a.fn.trials + a.fn.paid * 2) / Math.max(1, a.fn.views));
  return cands[0] ?? null;
}

export function buildAds(W) {
  const rng = W.rng.fork('ads');
  const ads = [];
  const used = new Set();
  // Maya's winner is her Headshots post
  const mayaWinner = W.maya.subs.find((s) => s.bounty.key === 'lumi_headshots' && s.post)?.post;
  for (const plan of AD_PLAN) {
    const b = W.bountyBy.get(plan.bounty);
    let post = plan.maya ? mayaWinner : bestPost(W, b, used);
    if (!post) continue;
    used.add(post);
    post.isWinnerAd = true;
    const ad = {
      n: plan.n, post, bounty: b, brand: b.brand, app: b.app, creator: post.creator, status: plan.status, platform: plan.platform, kind: plan.platform === 'meta' ? 'partnership_ad' : 'spark_ad', plan,
      requestedAt: plan.requested, grantedAt: plan.granted, startedAt: plan.started, endedAt: plan.ended, pausedAt: plan.pausedAt, codeDays: plan.codeDays,
      daily: [], spend: 0, impressions: 0, clicks: 0, installs: 0, trials: 0, paid: 0, revenue: 0, commission: 0, fee: 0, id: `ad_${String(plan.n).padStart(3, '0')}`,
    };
    ad.sparkCode = ad.kind === 'spark_ad' && plan.granted ? `${alnum(rng, 4).toUpperCase()}${rng.int(100, 999)}${alnum(rng, 5).toUpperCase()}` : undefined;
    ad.externalId = plan.started ? `${ad.platform === 'tiktok' ? 'tt' : 'fb'}_${rng.int(10_000_000, 99_999_999)}${rng.int(100, 999)}` : undefined;
    ad.codeExpires = plan.granted && plan.codeDays ? plan.granted + plan.codeDays * DAY_MS : undefined;
    // rights end: Maya's Spark code ends exactly 14 days from now
    if (plan.maya) { ad.codeExpires = ms('2026-10-17T14:00:00Z'); ad.grantedAt = ad.codeExpires - 60 * DAY_MS; }
    ad.rightsEnds = ad.codeExpires;
    if (plan.started) {
      const end = plan.ended ?? plan.pausedAt ?? NOW_EPOCH;
      const days = [];
      for (let t = ms(`${dateOf(iso(plan.started))}T00:00:00Z`); t <= ms(`${dateOf(iso(Math.min(end, NOW_EPOCH)))}T00:00:00Z`); t += DAY_MS) days.push(iso(t).slice(0, 10));
      const spendW = days.map((d, i) => (i === 0 ? 0.55 : i === days.length - 1 && end >= NOW_EPOCH - DAY_MS ? 0.7 : 1) * rng.float(0.85, 1.15));
      const spendParts = allocate(plan.spend, spendW);
      const paidParts = plan.daily && plan.daily.length === days.length ? plan.daily : allocate(plan.paidConv, days.map((d, i) => Math.pow(0.97, i) * rng.float(0.5, 1.5)));
      const adCpm = rng.float(640, 980); // cents per 1,000 impressions
      const ctr = rng.float(0.011, 0.019);
      const ci = rng.float(0.2, 0.3); // click to install
      const it = plan.n === 2 ? 0.06 : rng.float(0.05, 0.075); // install to trial
      days.forEach((d, i) => {
        const imps = Math.round((spendParts[i] * 1000) / adCpm);
        const clicks = Math.round(imps * ctr);
        const installs = Math.max(Math.round(clicks * ci), paidParts[i] * 3);
        const trials = Math.max(Math.round(installs * it), paidParts[i]);
        ad.daily.push({ date: d, spend_cents: spendParts[i], impressions: imps, clicks, installs, trials, paid: paidParts[i], revenue_cents: paidParts[i] * b.app.avgFirstPayment });
      });
      for (const k of ['spend_cents', 'impressions', 'clicks', 'installs', 'trials', 'paid', 'revenue_cents']) { const key = { spend_cents: 'spend', impressions: 'impressions', clicks: 'clicks', installs: 'installs', trials: 'trials', paid: 'paid', revenue_cents: 'revenue' }[k]; ad[key] = ad.daily.reduce((a, x) => a + x[k], 0); }
      // exact figures for Lumi's live ad (scenario seed): $1,200.00 spend, 31 paid conversions at $34.99
      if (plan.maya) { ad.spend = 120_000; ad.revenue = 31 * 3499; }
      ad.windowEnds = plan.started + C.pay.ad_commission_days * DAY_MS;
      const inWin = ad.daily.filter((x) => ms(`${x.date}T00:00:00Z`) < ad.windowEnds).reduce((a, x) => a + x.revenue_cents, 0);
      ad.commission = mulRate(inWin, C.pay.ad_commission_rate);
      ad.fee = mulRate(ad.spend, C.fees.ad_spend_fee_rate);
      ad.dailyBudget = plan.dailyBudget ?? Math.round(plan.spend / Math.max(1, days.length));
    } else {
      ad.dailyBudget = 6_000;
    }
    if (plan.fatigue) {
      const peak = 0.074;
      ad.fatigue = { peak, current: Math.round(peak * (1 - plan.fatigue) * 10000) / 10000, drop: plan.fatigue, flaggedAt: iso(D('10-01', 9, 30)) };
    }
    ads.push(ad);
    post.ad = ad;
  }
  W.ads = ads;
  return ads;
}
