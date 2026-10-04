// Public proof pages (joinflowd.io/p/<id>) and Wrapped recaps. Every proof carries the tier median beside the creator's number.

import crypto from 'node:crypto';
import { iso, ms, artSeed, sum, quantile, usd, fmtCompact, fmtInt, uniq, isoWeek } from '../lib.mjs';

const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const sha12 = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
const proofIdFor = (key) => `prf_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}`;
const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1), startDate: `${ym}-01`, endDate: iso(Date.UTC(y, m, 1) - DAY).slice(0, 10), label: `${MONTHS[m - 1]} ${y}`, year: y, m };
};
const dayLabel = (isoStr) => { const d = new Date(ms(isoStr)); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const rangeLabel = (a, b) => { const da = new Date(ms(a)); const db = new Date(ms(b)); return `${MON[da.getUTCMonth()]} ${da.getUTCDate()} to ${MON[db.getUTCMonth()]} ${db.getUTCDate()}, ${db.getUTCFullYear()}`; };

/** typical-earnings helpers shared by proofs and Wrapped */
function typicals(W) {
  const weekly = W.payouts.filter((p) => p.kind === 'weekly' && p.status === 'paid');
  const byTier = new Map();
  for (const p of weekly) (byTier.get(p.tier_at_payout) ?? byTier.set(p.tier_at_payout, []).get(p.tier_at_payout)).push(p.gross_cents);
  const allWeekly = weekly.map((p) => p.gross_cents);
  const q = (arr) => ({ p25: Math.round(quantile(arr, 0.25)), median: Math.round(quantile(arr, 0.5)), p75: Math.round(quantile(arr, 0.75)) });
  const payoutTypical = (tier) => q((byTier.get(tier) ?? []).length >= 6 ? byTier.get(tier) : allWeekly.length ? allWeekly : [W.ticker.totals?.typical_creator_30d_cents ?? 6200]);
  const monthCache = new Map();
  const monthTypical = (tier, ym) => {
    const k = `${tier}|${ym}`;
    if (monthCache.has(k)) return monthCache.get(k);
    const { start, end } = monthBounds(ym);
    let vals = W.creators.filter((c) => c.tier === tier).map((c) => W.clearedBetween(c.id, iso(start), iso(end))).filter((v) => v > 0);
    if (vals.length < 5) vals = W.creators.map((c) => W.clearedBetween(c.id, iso(start), iso(end))).filter((v) => v > 0);
    const out = vals.length ? q(vals) : { p25: 2100, median: W.ticker.totals?.typical_creator_30d_cents ?? 6200, p75: 14800 };
    monthCache.set(k, out);
    return out;
  };
  return { payoutTypical, monthTypical };
}

export function genProofsAndWrapped(W, rng, tierHistory) {
  const nowMs = ms(W.now);
  const maya = W.maya;
  const T = typicals(W);
  const proofs = [];
  const seen = new Set();
  const publicHandle = (c) => c.handle;
  const base = (c, kind, extra) => {
    const r = rng.fork(`proof:${extra.id}`);
    return {
      id: extra.id, kind, creator_id: c.id, handle: publicHandle(c), anonymous: false, ...(extra.payout_id ? { payout_id: extra.payout_id } : {}),
      period_label: extra.period_label, period_start: extra.period_start, period_end: extra.period_end, amount_cents: extra.amount_cents, tier: extra.tier, posts_count: extra.posts_count,
      typical_median_cents: extra.typical.median, typical_p25_cents: extra.typical.p25, typical_p75_cents: extra.typical.p75, ledger_hash: extra.hash,
      art: artSeed(r, { pattern: kind === 'tier_up' ? 'spark' : kind === 'wrapped' ? 'orbs' : kind === 'month' ? 'waves' : 'rings', label: extra.art_label }),
      revoked: false, page_views: Math.max(1, Math.round(r.logNormal(34, 1.1))), created_at: extra.created_at,
    };
  };
  const add = (p) => { if (seen.has(p.id)) return; seen.add(p.id); proofs.push(p); };

  // ── payout proofs ──────────────────────────────────────────────────────────────────────────────────
  const payoutProof = (pay) => {
    const c = W.creatorById.get(pay.creator_id);
    if (!c || !pay.proof_id || seen.has(pay.proof_id)) return;
    const rows = W.ledger.filter((l) => l.payout_id === pay.id && l.account?.startsWith('creator:') && l.amount_cents > 0);
    const end = pay.paid_at ?? pay.scheduled_for;
    const weekly = pay.kind === 'weekly';
    const startMs = weekly ? ms(pay.scheduled_for) - 7 * DAY + 3_600_000 : ms(pay.requested_at);
    add(base(c, 'payout', {
      id: pay.proof_id, payout_id: pay.id, period_label: weekly ? rangeLabel(iso(startMs), iso(ms(pay.scheduled_for) - DAY)) : dayLabel(pay.requested_at), period_start: iso(startMs).slice(0, 10), period_end: weekly ? iso(ms(pay.scheduled_for) - DAY).slice(0, 10) : pay.requested_at.slice(0, 10),
      amount_cents: pay.gross_cents, tier: pay.tier_at_payout, posts_count: Math.max(1, uniq(rows.map((r) => r.post_id).filter(Boolean)).length), typical: T.payoutTypical(pay.tier_at_payout), hash: sha12(`${pay.id}|${rows.map((r) => r.id).sort().join(',')}`),
      art_label: usd(pay.gross_cents), created_at: iso(Math.min(nowMs - 60_000, ms(end))),
    }));
  };
  const events = W.ticker.events ?? [];
  for (const ev of events) {
    if (!ev.proof_id) continue;
    const pay = W.payoutById.size ? W.payouts.find((p) => p.proof_id === ev.proof_id) : null;
    if (pay) { payoutProof(pay); continue; }
    const c = ev.creator_id && W.creatorById.get(ev.creator_id);
    if (!c) continue;
    const tier = ev.tier ?? c.tier;
    add(base(c, ev.kind === 'tier_up' ? 'tier_up' : 'payout', {
      id: ev.proof_id, period_label: dayLabel(ev.at), period_start: ev.at.slice(0, 10), period_end: ev.at.slice(0, 10), amount_cents: ev.amount_cents ?? 0, tier, posts_count: 1, typical: T.payoutTypical(tier), hash: sha12(`${ev.id}|${ev.proof_id}`), art_label: ev.amount_cents ? usd(ev.amount_cents) : `Reached ${cap(tier)}`, created_at: ev.at,
    }));
  }
  if (maya) {
    const mine = (W.payoutsByCreator.get(maya.id) ?? []).filter((p) => p.status === 'paid').sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1));
    for (const p of mine.slice(0, 4)) payoutProof(p);
  }
  const rP = rng.fork('proof:payout-sample');
  const sample = rP.shuffle(W.payouts.filter((p) => p.status === 'paid' && p.proof_id && p.gross_cents >= 2000 && p.creator_id !== maya?.id));
  for (const p of sample) { if (proofs.filter((x) => x.kind === 'payout').length >= 74) break; payoutProof(p); }

  // ── month proofs: the biggest creator-months of September and August, plus Maya's September ──────────
  const months = ['2026-09', '2026-08'];
  const monthRows = [];
  for (const ym of months) {
    const { start, end } = monthBounds(ym);
    for (const c of W.creators) {
      const amt = W.clearedBetween(c.id, iso(start), iso(end));
      if (amt >= 8000) monthRows.push({ c, ym, amt });
    }
  }
  monthRows.sort((a, b) => b.amt - a.amt);
  const monthPick = [...monthRows.filter((x) => x.c.id === maya?.id && x.ym === '2026-09'), ...monthRows.filter((x) => x.c.id !== maya?.id).slice(0, 24)];
  for (const { c, ym, amt } of monthPick) {
    const b = monthBounds(ym);
    const rows = (W.earnByCreator.get(c.id) ?? []).filter((x) => (x.status === 'cleared' || x.status === 'paid') && ms(W.earnedAt(x)) >= b.start && ms(W.earnedAt(x)) < b.end);
    const tierEnd = tierAt(W, c, iso(b.end - 1000), tierHistory);
    add(base(c, 'month', {
      id: proofIdFor(`month|${c.id}|${ym}`), period_label: b.label, period_start: b.startDate, period_end: b.endDate, amount_cents: amt, tier: tierEnd, posts_count: Math.max(1, uniq(rows.map((r) => r.post_id).filter(Boolean)).length),
      typical: T.monthTypical(tierEnd, ym), hash: sha12(`${c.id}|${ym}|${rows.map((r) => r.id).sort().join(',')}`), art_label: usd(amt), created_at: iso(Math.min(nowMs - 60_000, b.end + (4 + (c.id.length % 9)) * DAY)),
    }));
  }

  // ── tier-up proofs ──────────────────────────────────────────────────────────────────────────────────
  const ups = tierHistory.filter((e) => (e.kind === 'promoted' || e.kind === 'granted') && e.creator_id !== maya?.id);
  const upsMaya = tierHistory.filter((e) => e.kind === 'promoted' && e.creator_id === maya?.id);
  const rU = rng.fork('proof:tierup');
  for (const e of [...upsMaya, ...rU.shuffle(ups).slice(0, 14)]) {
    const c = W.creatorById.get(e.creator_id);
    add(base(c, 'tier_up', {
      id: proofIdFor(`tier_up|${c.id}|${e.to_tier}`), period_label: `Reached ${cap(e.to_tier)}`, period_start: c.joined_at.slice(0, 10), period_end: e.at.slice(0, 10), amount_cents: e.stats.lifetime_cleared_cents, tier: e.to_tier,
      posts_count: Math.max(1, (W.postsByCreator.get(c.id) ?? []).filter((p) => ms(p.posted_at) <= ms(e.at)).length), typical: T.monthTypical(e.to_tier, e.at.slice(0, 7)), hash: sha12(`${c.id}|${e.id}`), art_label: `Reached ${cap(e.to_tier)}`, created_at: e.at,
    }));
  }

  // ── Wrapped ───────────────────────────────────────────────────────────────────────────────────────────
  const wrapped = [];
  const targets = [];
  if (maya) targets.push({ c: maya, ym: '2026-09' }, { c: maya, ym: '2026-08' });
  const sept = monthBounds('2026-09');
  const topSept = W.creators.filter((c) => c.id !== maya?.id && (W.postsByCreator.get(c.id) ?? []).length >= 3).map((c) => ({ c, amt: W.clearedBetween(c.id, iso(sept.start), iso(sept.end)) })).sort((a, b) => b.amt - a.amt);
  const otherTwo = topSept.slice(1, 3).map((x) => x.c);
  for (const c of otherTwo) targets.push({ c, ym: '2026-09' }, { c, ym: '2026-08' });
  for (const { c, ym } of targets) {
    const b = monthBounds(ym);
    const post = (W.postsByCreator.get(c.id) ?? []).filter((p) => ms(p.posted_at) >= b.start && ms(p.posted_at) < b.end);
    const cleared = W.clearedBetween(c.id, iso(b.start), iso(b.end));
    const views = sum(post, (p) => p.views);
    const trials = sum(post, (p) => p.funnel?.trials ?? 0);
    const best = [...post].sort((a, d) => (d.funnel?.trials ?? 0) - (a.funnel?.trials ?? 0) || d.views - a.views)[0];
    const bestAnalysis = best ? (W.analysesBySub.get(best.submission_id) ?? []).slice(-1)[0] : undefined;
    const earnRows = (W.earnByCreator.get(c.id) ?? []).filter((x) => (x.status === 'cleared' || x.status === 'paid') && ms(W.earnedAt(x)) >= b.start && ms(W.earnedAt(x)) < b.end);
    const byBrand = new Map();
    for (const x of earnRows) if (x.brand_id) byBrand.set(x.brand_id, (byBrand.get(x.brand_id) ?? 0) + x.amount_cents);
    const topBrandId = [...byBrand.entries()].sort((a, d) => d[1] - a[1])[0]?.[0] ?? best?.brand_id;
    const tier = tierAt(W, c, iso(b.end - 1000), tierHistory);
    const typ = T.monthTypical(tier, ym);
    const streak = streakAt(W, c, iso(b.end - 1000));
    const proofId = ym === '2026-09' ? proofIdFor(`wrapped|${c.id}|${ym}`) : undefined;
    const slug = W.slugOf(c.id);
    const mName = MONTHS[b.m - 1];
    const art = (kind, i) => artSeed(rng.fork(`wrap:${c.id}:${ym}:${kind}`), { pattern: ['orbs', 'waves', 'rings', 'spark', 'stripes', 'grid'][i % 6], hue: 200 + (i * 37) % 160, label: undefined });
    const topBrand = topBrandId ? W.brandName(topBrandId) : undefined;
    const hookText = bestAnalysis?.hook?.text ?? best?.tags?.hook_words;
    const cards = [
      { kind: 'earnings', title: `Cleared in ${mName}`, figure: usd(cleared), caption: `Across ${fmtInt(Math.max(1, uniq(earnRows.map((x) => x.post_id).filter(Boolean)).length))} posts. Typical for ${cap(tier)}: ${usd(typ.median)} (middle half: ${usd(typ.p25)} to ${usd(typ.p75)}).` },
      { kind: 'views', title: 'Views counted', figure: fmtCompact(views), caption: `${fmtInt(post.length)} post${post.length === 1 ? '' : 's'} went live in ${mName}. Only verified views count toward pay.` },
      ...(best ? [{ kind: 'best_post', title: 'Your best post', figure: `${fmtCompact(best.views)} views`, caption: `${W.bountyById.get(best.bounty_id)?.title ?? 'Your top video'} for ${W.brandName(best.brand_id)} drove ${fmtInt(best.funnel?.trials ?? 0)} tracked trial${(best.funnel?.trials ?? 0) === 1 ? '' : 's'}.` }] : []),
      ...(hookText ? [{ kind: 'winning_hook', title: 'Your winning hook', figure: `"${hookText.length > 60 ? `${hookText.slice(0, 57).trimEnd()}...` : hookText}"`, caption: `A ${(best?.tags?.hook_type ?? 'confession').replace(/_/g, ' ')} opening. Keep the structure, change the first line.` }] : []),
      { kind: 'trials', title: 'Trials you drove', figure: fmtInt(trials), caption: 'Tracked through your link and code. Estimated conversions are never counted here.' },
      { kind: 'streak', title: 'Your streak', figure: `${streak} week${streak === 1 ? '' : 's'}`, caption: streak >= 4 ? 'One post a week is all it takes, and a freeze covers a bad week.' : 'One post a week keeps it going. Rest weeks never cost you anything.' },
      { kind: 'tier', title: 'Your tier', figure: cap(tier), caption: `${cap(tier)} unlocked ${tier === 'bronze' ? 'the starter bounties and the Daily Drop' : tier === 'silver' ? 'a rate card and one hour of early access' : 'earlier access and better perks'}.` },
      ...(topBrand ? [{ kind: 'top_brand', title: 'Top brand', figure: topBrand, caption: `You earned the most from ${topBrand} in ${mName}.` }] : []),
      { kind: 'typical', title: 'The typical creator', figure: `${usd(typ.median)} median`, caption: `The median ${cap(tier)} creator cleared ${usd(typ.median)} in ${mName}; the top quarter cleared ${usd(typ.p75)} or more. Results vary.` },
      { kind: 'share', title: 'Share your month', caption: 'Your Earnings Card always shows the median beside your number, with a proof link anyone can open.' },
    ].map((cd, i) => ({ ...cd, art: art(cd.kind, i) }));
    wrapped.push({
      id: `wrap_${slug}_${ym}`, creator_id: c.id, period: 'month', label: b.label, period_start: b.startDate, period_end: b.endDate, total_cleared_cents: cleared, views_total: views, posts_count: post.length, trials_total: trials,
      ...(best ? { best_post_id: best.id } : {}), ...(hookText ? { best_hook_text: hookText } : {}), ...(best?.tags?.hook_type ? { best_hook_type: best.tags.hook_type } : {}), ...(topBrandId ? { top_brand_id: topBrandId } : {}),
      streak_weeks: streak, tier, tier_median_cents: typ.median, cards, ...(proofId ? { proof_id: proofId } : {}), created_at: iso(Math.min(nowMs - 3_600_000, b.end + 9 * 3_600_000)),
    });
    if (proofId) {
      add(base(c, 'wrapped', {
        id: proofId, period_label: `${b.label} Wrapped`, period_start: b.startDate, period_end: b.endDate, amount_cents: cleared, tier, posts_count: Math.max(1, post.length), typical: typ, hash: sha12(`wrapped|${c.id}|${ym}|${earnRows.map((x) => x.id).sort().join(',')}`),
        art_label: `${mName} Wrapped`, created_at: iso(Math.min(nowMs - 3_600_000, b.end + 10 * 3_600_000)),
      }));
    }
  }
  // Maya has exactly five public proof pages (catalogue): keep the Wrapped and anything the ticker links to, then the tier-up, the month
  // and the newest payouts, and drop the rest
  if (maya) {
    const tickerIds = new Set(events.map((e) => e.proof_id).filter(Boolean));
    const prio = (p) => (p.kind === 'wrapped' ? 0 : tickerIds.has(p.id) ? 1 : p.kind === 'tier_up' ? 2 : p.kind === 'month' ? 3 : 4);
    const mine = proofs.filter((p) => p.creator_id === maya.id).sort((a, b) => prio(a) - prio(b) || (a.created_at < b.created_at ? 1 : -1));
    const drop = new Set(mine.slice(Math.max(5, mine.filter((p) => prio(p) <= 1).length)).map((p) => p.id));
    for (let i = proofs.length - 1; i >= 0; i--) if (drop.has(proofs[i].id)) proofs.splice(i, 1);
  }
  // revoke 8 and anonymise 12 (never Maya's)
  const rr = rng.fork('proof:flags');
  const candidates = proofs.filter((p) => p.creator_id !== maya?.id);
  const revoked = new Set(rr.sample(candidates, 8).map((p) => p.id));
  const anon = new Set(rr.sample(candidates.filter((p) => !revoked.has(p.id)), 12).map((p) => p.id));
  for (const p of proofs) {
    if (revoked.has(p.id)) { p.revoked = true; p.page_views = Math.min(p.page_views, 9); }
    if (anon.has(p.id)) { p.anonymous = true; p.handle = `A ${cap(p.tier)} creator`; }
  }
  proofs.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  return { proofs, wrapped: wrapped.sort((a, b) => (a.creator_id < b.creator_id ? -1 : a.creator_id > b.creator_id ? 1 : a.period_start < b.period_start ? -1 : 1)) };
}

/** the tier a creator held at a moment, from the history (bronze before the first event) */
function tierAt(W, c, at, history) {
  const t = ms(at);
  let tier = 'bronze';
  for (const e of history) if (e.creator_id === c.id && ms(e.at) <= t && ['promoted', 'granted', 'carry_over_applied'].includes(e.kind)) tier = e.to_tier;
  if (!history.some((e) => e.creator_id === c.id) && W.tierRank(c.tier) > 0 && ms(c.tier_since) <= t) tier = c.tier;
  return tier;
}
/** consecutive ISO weeks with a post up to a moment */
function streakAt(W, c, at) {
  const counts = W.weeklyPosts(c.id);
  let t = ms(at);
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const w = isoWeek(iso(t));
    if ((counts.get(w) ?? 0) > 0) n++;
    else if (i > 0) break;
    t -= 7 * DAY;
  }
  return n;
}
