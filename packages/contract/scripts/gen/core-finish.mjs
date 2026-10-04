// CORE stage 8: Money Clock rows, invoices, market series, ticker, app daily metrics.

import { allocate } from './lib.mjs';
import { CATEGORIES } from './pools.mjs';
import { mulRate, postClearingRun, cardProcessing, typicalEarnings } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, med, quant, money, clockLabel, weeklyRunFor, runAtOrAfter, dayStart, hoursOf } from './core-kit.mjs';
import { conversionClearingRun } from '../../schema/formulas.mjs';

const LABEL = (b, suffix = '') => `${b.brand.name}: ${b.title.replace(/^(Starter|Direct): /, '')}${suffix}`;

// ── Money Clock ────────────────────────────────────────────────────────────────────────────────
const SRC_OF = { cpm: 'cpm', flat_fee: 'flat_fee', commission: 'ad_commission', rights_fee: 'rights_fee', prize: 'prize', bonus: 'bonus', referral: 'referral' };
const HOLD_REASON = { tax_info_missing: 'held_tax_info', identity_check: 'held_identity_check', dispute_open: 'held_dispute', fraud_review: 'held_fraud_review', payout_method_missing: 'held_payout_method', admin_hold: 'held_identity_check' };
const HOLD_TEXT = {
  held_tax_info: 'Held: your W-9 is missing. Add it in Tax Desk (two minutes, not tax advice) and the next run pays this out.',
  held_identity_check: 'Held: identity check in progress. Upload the ID shown in Settings; a reviewer replies within 24 hours.',
  held_dispute: 'Held: an open dispute covers these earnings. Add evidence to the dispute and a reviewer replies within 24 hours.',
  held_fraud_review: 'Held for a fraud review. A reviewer decides within 24 hours; legitimate views are always paid.',
  held_payout_method: 'Held: no payout method on file. Add a bank account or debit card and this pays on the next run.',
  held_compliance: 'Held: the disclosure check failed. Edit the caption to add #ad and the hold lifts automatically.',
};
/** where a tracked conversion came from, in the creator's words */
const via = (bt) => (bt.source === 'code' ? 'with your promo code' : 'through your link');
export function buildMoneyClock(W) {
  const rows = [];
  const mk = (o) => { rows.push(o); return o; };
  const since = NOW_EPOCH - 21 * DAY_MS;
  const stateOf = { pending: 'pending', cleared: 'cleared', paid: 'paid', held: 'held', reversed: 'reversed' };
  for (const r of W.earnRows) {
    if (!r.earning || r.amt <= 0) continue;
    const st = r.status;
    if (st === 'paid' && (r.paidMs ?? 0) < since) continue;
    if (st === 'reversed') { if (!r.reversedBy || r.reversedBy.at < since) continue; }
    const post = r.post;
    const b = r.bounty;
    let source = SRC_OF[r.type];
    if (r.type === 'cpa') source = r.conv?.kind === 'install' ? 'cpa_install' : r.conv?.kind === 'trial' ? 'cpa_trial' : 'cpa_paid';
    const state = stateOf[st];
    let earnedAt = r.type === 'cpa' ? r.conv.firstAtMs : post ? post.postedAtMs : r.postedMs;
    if (r.type === 'cpm' || r.type === 'flat_fee') earnedAt = post ? post.postedAtMs : r.postedMs;
    if (r.type === 'commission') earnedAt = r.ad?.startedAt ?? r.postedMs;
    let eta; let reason; let text;
    const clearedAt = r.clearedMs;
    if (state === 'pending') {
      const run = post ? ms(postClearingRun(post.windowEndsAt)) : ms(runAtOrAfter(iso(r.postedMs)));
      eta = run;
      const windowEnd = post ? ms(post.windowEndsAt) : r.postedMs;
      reason = NOW_EPOCH < windowEnd + 12 * HOUR_MS ? 'fraud_check' : 'awaiting_clearing_run';
      text = reason === 'fraud_check' ? `Views counted. The automated view and disclosure check finishes within 12 hours; clears ${clockLabel(iso(eta))} UTC.` : `Passed the check. Clears at the next run, ${clockLabel(iso(eta))} UTC.`;
    } else if (state === 'cleared') {
      eta = ms(weeklyRunFor(iso(clearedAt)));
      reason = 'awaiting_weekly_payout';
      text = `Cleared ${clockLabel(iso(clearedAt))} UTC. Pays out in the weekly run, ${clockLabel(iso(eta))} UTC.`;
    } else if (state === 'held') {
      const code = post?.role === 'held_compliance' ? 'held_compliance' : post?.role === 'held_fraud' ? 'held_fraud_review' : HOLD_REASON[r.creator.holdReason] ?? 'held_fraud_review';
      reason = code;
      text = HOLD_TEXT[code];
    } else if (state === 'paid') {
      const processing = r.payout?.status === 'processing';
      const inTransit = processing || r.payout?.status === 'in_transit';
      reason = inTransit ? 'payout_in_transit' : 'paid_out';
      text = processing ? 'Instant cash-out started. The transfer is being created and usually reaches your bank within minutes.'
        : inTransit ? `On its way: payout ${r.payout.runId ?? 'cash-out'} arrives ${clockLabel(iso(ms(`${dateOf(iso(r.payout.initiatedMs))}T00:00:00Z`) + 3 * DAY_MS + 15 * HOUR_MS))} UTC.` : `Paid on ${dateOf(iso(r.paidMs))} in ${r.payout?.runId ?? 'an instant cash-out'}.`;
    } else {
      reason = 'reversed_clawback';
      text = 'Reversed after proven view fraud. Views that were legitimately delivered are still paid.';
    }
    mk({
      creator: r.creator, bounty: b ?? null, app: (b ?? r.post?.bounty)?.app ?? null, post: post ?? null, conv: r.conv?.row ?? null, source, state, amount: r.amt, estimated: false, earnedAt, eta, reason, text,
      label: r.type === 'commission' ? LABEL(b, ' (ad commission)') : r.type === 'bonus' ? 'flowd: founding creator bonus' : r.type === 'prize' ? `flowd: ${r.memo.replace(/^Prize: /, '').replace(/, \d.* place$/, '')}` : r.type === 'referral' ? 'flowd: referral reward' : r.type === 'rights_fee' ? LABEL(b, ' (rights renewal)') : LABEL(b),
      leg: r, clearedMs: ['cleared', 'paid', 'reversed'].includes(state) ? (clearedAt ?? r.postedMs) : undefined, payout: r.payout ?? null, paidMs: state === 'paid' ? r.paidMs : undefined,
    });
  }
  // accruing / pending money with no ledger row yet
  for (const p of W.posts) {
    const plan = p.plan;
    if (!plan || p.removedAt) continue;
    const b = p.bounty;
    const run = ms(postClearingRun(p.windowEndsAt));
    const held = p.role === 'held_fraud' || p.role === 'held_compliance';
    if (p.isLive) {
      const est = plan.estimate;
      if (est && ((est.cpm ?? 0) > 0 || (est.flat ?? 0) > 0)) mk({ creator: p.creator, bounty: b, app: b.app, post: p, source: est.flat ? 'flat_fee' : 'cpm', state: 'accruing', amount: est.flat ?? est.cpm, estimated: true, earnedAt: p.postedAtMs, eta: run, reason: 'window_open', text: `Views are counting for 72 hours (window closes ${clockLabel(p.windowEndsAt)} UTC). Estimate clears ${clockLabel(iso(run))} UTC.`, label: LABEL(b) });
    }
    for (const bt of plan.cpa) {
      if (bt.cleared || bt.pay <= 0) continue;
      const kind = bt.kind === 'install' ? 'cpa_install' : bt.kind === 'trial' ? 'cpa_trial' : 'cpa_paid';
      const eta = bt.clearMs;
      const base = { creator: p.creator, bounty: b, app: b.app, post: p, conv: bt.row ?? null, source: kind, amount: bt.pay, earnedAt: bt.firstAtMs, eta, label: LABEL(b) };
      if (p.isLive) mk({ ...base, state: 'accruing', estimated: true, reason: 'window_open', text: `${bt.qty} ${bt.kind}${bt.qty > 1 ? 's' : ''} ${via(bt)} counted. Settles after the view window and a ${bt.kind === 'install' ? '24 h' : bt.kind === 'trial' ? '72 h' : '7-day'} check: ${clockLabel(iso(eta))} UTC.` });
      else if (held) mk({ ...base, state: 'held', estimated: false, eta: undefined, reason: p.role === 'held_compliance' ? 'held_compliance' : 'held_fraud_review', text: HOLD_TEXT[p.role === 'held_compliance' ? 'held_compliance' : 'held_fraud_review'] });
      else mk({ ...base, state: 'pending', estimated: false, reason: 'conversion_clearing', text: `${bt.qty} ${bt.kind}${bt.qty > 1 ? 's' : ''} ${via(bt)} still inside the ${bt.kind === 'install' ? '24 h' : bt.kind === 'trial' ? '72 h' : '7-day'} check. Clears ${clockLabel(iso(eta))} UTC.` });
    }
  }
  // ad commission accruing
  for (const ad of W.ads) {
    if (!['live', 'fatigued'].includes(ad.status) || !ad.startedAt) continue;
    const accr = ad.commission - (ad.commissionSettled ?? 0);
    if (accr <= 0) continue;
    const eta = ms('2026-10-09T14:00:00Z');
    mk({ creator: ad.creator, bounty: ad.bounty, app: ad.app, post: ad.post, source: 'ad_commission', state: 'accruing', amount: accr, estimated: true, earnedAt: ad.startedAt, eta, reason: 'conversion_clearing', text: `Ad-attributed revenue is still being matched. 10% settles weekly: next ${clockLabel(iso(eta))} UTC.`, label: LABEL(ad.bounty, ' (ad commission)') });
  }
  rows.sort((a, b) => (a.creator.id < b.creator.id ? -1 : a.creator.id > b.creator.id ? 1 : 0) || a.earnedAt - b.earnedAt || (a.amount - b.amount));
  rows.forEach((r, i) => { r.id = `mc_${String(i + 1).padStart(4, '0')}`; });
  W.clock = rows;
  return rows;
}

// ── invoices ───────────────────────────────────────────────────────────────────────────────────
export function buildInvoices(W) {
  const inv = [];
  const country = (b) => b.country;
  const eu = (b) => ['DE', 'IE', 'GB', 'NL', 'FR', 'ES'].includes(b.country);
  const base = (b) => ({ brand: b, po: b.plan === 'scale' || b.kind === 'agency' ? `PO-${b.slug.slice(0, 3).toUpperCase()}-${String(2600 + (b.index ?? 7) * 3)}` : undefined, cost: b.plan === 'scale' || b.kind === 'agency' ? (b.kind === 'agency' ? 'CLIENT-GROWTH' : 'GROWTH-UGC') : undefined, vat: eu(b) ? b.vat : undefined, rc: eu(b) && !!b.vat });
  // funding invoices per bounty
  for (const b of W.bounties) {
    if (b.funding_source === 'platform') continue;
    const bb = base(b.brand);
    if (['draft'].includes(b.status)) continue;
    if (b.status === 'awaiting_funding') {
      const X = b.escrowTotal - (b.matched ?? 0);
      inv.push({ ...bb, kind: 'funding', status: 'open', bounty: b, lines: [{ description: `Escrow: ${b.title} pool`, quantity: 1, unit_cents: b.budget, amount_cents: b.budget, bounty: b }, ...(b.fee_reserve > 0 ? [{ description: `Fee reserve (${Math.round(b.take_rate * 100)}%)`, quantity: 1, unit_cents: b.fee_reserve, amount_cents: b.fee_reserve, bounty: b }] : [])], subtotal: X, processing: 0, tax: 0, issuedAt: ms(b.createdAt) + 30 * 60_000, dueAt: ms(b.createdAt) + 7 * DAY_MS + 30 * 60_000, txn: null });
      continue;
    }
    const X = b.escrowTotal - (b.matched ?? 0);
    const lines = [];
    const pool = b.budget - (b.matched ?? 0);
    lines.push({ description: b.matched > 0 ? `Escrow: ${b.title} pool (your funding; flowd matched ${money(b.matched)})` : `Escrow: ${b.title} pool`, quantity: 1, unit_cents: pool, amount_cents: pool, bounty: b });
    if (b.fee_reserve > 0) lines.push({ description: `Fee reserve (${Math.round(b.take_rate * 100)}% of pool, unused part refunded)`, quantity: 1, unit_cents: b.fee_reserve, amount_cents: b.fee_reserve, bounty: b });
    // a just-in-time top-up that covered the whole funding is charged on this invoice; when the wallet already held part of it the card top-up has its own invoice
    const topup = b.fundTopup;
    const partial = !!topup && topup.amount < X;
    const proc = topup && !partial ? topup.proc : 0;
    const txn = topup && !partial ? topup.tx : b.fundTxn;
    const status = b.status === 'cancelled' ? 'refunded' : 'paid';
    inv.push({ ...bb, kind: 'funding', status, bounty: b, lines, subtotal: lines.reduce((a, l) => a + l.amount_cents, 0), processing: proc, tax: 0, issuedAt: txn.at - 30 * 60_000, dueAt: txn.at + 7 * DAY_MS, paidAt: txn.at + 2 * 60_000, txn });
    if (partial) inv.push({ ...bb, kind: 'funding', status: 'paid', bounty: null, lines: [{ description: `Wallet top-up to fund ${b.title}`, quantity: 1, unit_cents: topup.amount, amount_cents: topup.amount }], subtotal: topup.amount, processing: topup.proc, tax: 0, issuedAt: topup.tx.at - 5 * 60_000, dueAt: topup.tx.at + 7 * DAY_MS, paidAt: topup.tx.at, txn: topup.tx });
  }
  for (const p of W.invoicesPlan) {
    const bb = base(p.brand);
    if (p.kind === 'subscription') inv.push({ ...bb, kind: 'subscription', status: 'paid', bounty: null, lines: [{ description: `${p.memo}`, quantity: 1, unit_cents: p.price, amount_cents: p.price }], subtotal: p.price, processing: 0, tax: 0, issuedAt: p.at - 5 * 60_000, dueAt: p.at + 14 * DAY_MS, paidAt: p.at, txn: p.txn });
    else if (p.kind === 'topup' && !p.forFund) inv.push({ ...bb, kind: 'funding', status: 'paid', bounty: null, lines: [{ description: 'Wallet top-up (commissions, ad fees and renewals)', quantity: 1, unit_cents: p.amount, amount_cents: p.amount }], subtotal: p.amount, processing: p.proc, tax: 0, issuedAt: p.at - 5 * 60_000, dueAt: p.at + 7 * DAY_MS, paidAt: p.at, txn: p.txn });
    else if (p.kind === 'ad_fee') inv.push({ ...bb, kind: 'ad_fee', status: 'paid', bounty: p.ad.bounty, ad: p.ad, lines: [{ description: `Winner promotion fee: 1% of ad spend (${money(p.spend)}), ${p.ad.bounty.title}`, quantity: 1, unit_cents: p.fee, amount_cents: p.fee, ad: p.ad }], subtotal: p.fee, processing: 0, tax: 0, issuedAt: p.at, dueAt: p.at + 14 * DAY_MS, paidAt: p.at, txn: p.txn });
    else if (p.kind === 'rights_renewal') inv.push({ ...bb, kind: 'rights_renewal', status: 'paid', bounty: p.post.bounty, lines: [{ description: `Rights renewal, 30 days: ${p.post.bounty.title}`, quantity: 1, unit_cents: p.price, amount_cents: p.price, bounty: p.post.bounty }, ...(p.fee > 0 ? [{ description: `Platform fee ${Math.round(p.post.bounty.take_rate * 100)}%`, quantity: 1, unit_cents: p.fee, amount_cents: p.fee }] : [])], subtotal: p.price + p.fee, processing: 0, tax: 0, issuedAt: p.at - 60_000, dueAt: p.at + 14 * DAY_MS, paidAt: p.at, txn: p.txn });
  }
  inv.sort((a, b) => a.issuedAt - b.issuedAt);
  inv.forEach((x, i) => { x.n = i + 1; x.id = `inv_${String(i + 1).padStart(4, '0')}`; x.number = `FD-2026-${String(i + 1).padStart(4, '0')}`; });
  W.invoices = inv;
  return inv;
}

// ── market series ──────────────────────────────────────────────────────────────────────────────
export function clearingCpmModel(cat, dateStr) {
  const d = Math.max(0, Math.min(90, (ms(`${dateStr}T00:00:00Z`) - ms('2026-07-05T00:00:00Z')) / DAY_MS));
  const total = 2.2 * cat.drift;
  const wd = new Date(ms(`${dateStr}T00:00:00Z`)).getUTCDay();
  const weekly = Math.sin((d / 7) * 2 * Math.PI + cat.base_cpm_cents) * 0.012 + (wd >= 2 && wd <= 4 ? 0.004 : -0.002);
  return cat.base_cpm_cents * (1 - total * (1 - d / 90)) * (1 + weekly);
}
export function buildMarket(W) {
  const rng = W.rng.fork('market');
  const dates = [];
  for (let t = ms('2026-07-05T00:00:00Z'); t <= NOW_EPOCH; t += DAY_MS) dates.push(iso(t).slice(0, 10));
  const rows = [];
  const subsByCat = new Map();
  for (const s of W.subs) { const k = s.bounty.category; if (!subsByCat.has(k)) subsByCat.set(k, []); subsByCat.get(k).push(s); }
  for (const cat of CATEGORIES) {
    const bs = W.bounties.filter((b) => b.category === cat.key && b.cpm_cents > 0 && !['draft', 'awaiting_funding', 'cancelled'].includes(b.status) && b.funding_source !== 'platform');
    const posts = W.posts.filter((p) => p.bounty.category === cat.key && !p.removedAt);
    let noise = 0;
    for (const d of dates) {
      const dMs = ms(`${d}T00:00:00Z`);
      noise = noise * 0.7 + rng.normal(0, 0.008);
      const model = clearingCpmModel(cat, d) * (1 + noise);
      const live = bs.filter((b) => ms(b.startsAt) <= dMs + DAY_MS && ms(b.endsAt) >= dMs);
      const cum = bs.filter((b) => ms(b.startsAt) <= dMs + DAY_MS);
      const actualMed = cum.length ? med(cum.map((b) => b.cpm_cents)) : null;
      const w = Math.min(0.55, cum.length / 12);
      const clearing = Math.round(actualMed ? model * (1 - w) + actualMed * w : model);
      const p25 = Math.round(Math.min(clearing - 1, clearing * rng.float(0.8, 0.9)));
      const p75 = Math.round(Math.max(clearing + 1, clearing * rng.float(1.12, 1.25)));
      const openB = W.bounties.filter((b) => b.category === cat.key && ms(b.startsAt) <= dMs + DAY_MS && ms(b.endsAt) >= dMs && !['draft', 'awaiting_funding', 'cancelled', 'scheduled'].includes(b.status));
      let openBudget = 0;
      for (const b of openB) { const life = Math.max(1, ms(b.endsAt) - ms(b.startsAt)); const frac = clamp((dMs - ms(b.startsAt)) / Math.min(life, 40 * DAY_MS), 0, 1); openBudget += Math.round((b.budget * (1 - 0.8 * frac)) / 100) * 100; }
      const newB = W.bounties.filter((b) => b.category === cat.key && dateOf(b.publishedAt ?? b.startsAt) === d && !['draft', 'awaiting_funding', 'cancelled'].includes(b.status)).length;
      const subsToday = (subsByCat.get(cat.key) ?? []).filter((s) => dateOf(iso(s.derived.versions[0].at)) === d).length;
      const win = posts.filter((p) => p.postedAtMs <= dMs + DAY_MS && p.postedAtMs > dMs + DAY_MS - 8 * DAY_MS && !p.isLive);
      const mv = win.length >= 3 ? Math.round(med(win.map((p) => p.windowViews))) : Math.round(cat.median_views * rng.float(0.82, 1.12) * (0.88 + 0.12 * Math.min(1, (dMs - ms('2026-07-05T00:00:00Z')) / (40 * DAY_MS))));
      const inst = win.reduce((a, p) => a + p.fn.installs, 0);
      const tri = win.reduce((a, p) => a + p.fn.trials, 0);
      const tr = inst >= 25 ? tri / inst : cat.install_to_trial * rng.float(0.9, 1.12);
      const trailing = win.length;
      rows.push({
        cat: cat.key, date: d, clearing, p25, p75, open: openB.length, openBudget, newB, subs: subsToday, fill: Math.round(cat.median_fill_hours * (1.25 - 0.3 * (dMs - ms('2026-07-05T00:00:00Z')) / (90 * DAY_MS)) * rng.float(0.92, 1.08) * 10) / 10,
        views: mv, trialRate: Math.round(clamp(tr, 0.02, 0.12) * 10000) / 10000, sample: Math.max(1, Math.round(cum.length * 2.4 + trailing / 3)),
      });
    }
  }
  W.market = rows;
  return rows;
}

// ── ticker ───────────────────────────────────────────────────────────────────────────────────
export function buildTicker(W) {
  const rng = W.rng.fork('ticker');
  // totals count every payout whose money has left creator balances (a cash-out still processing included); the feed shows completed ones
  const paid = W.payouts.filter((p) => ['paid', 'in_transit', 'processing'].includes(p.status));
  const total = paid.reduce((a, p) => a + p.net, 0);
  const day = dateOf(NOW);
  const today = paid.filter((p) => dateOf(iso(p.initiatedMs)) === day).reduce((a, p) => a + p.net, 0);
  const d7 = paid.filter((p) => p.initiatedMs > NOW_EPOCH - 7 * DAY_MS).reduce((a, p) => a + p.net, 0);
  const cleared30 = new Map();
  for (const r of W.earnRows) if (['cleared', 'paid'].includes(r.status) && ['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral'].includes(r.type) && r.clearedMs > NOW_EPOCH - 30 * DAY_MS && r.amt > 0) cleared30.set(r.creator, (cleared30.get(r.creator) ?? 0) + r.amt);
  const active = new Set([...cleared30.keys()]);
  for (const p of W.posts) if (p.postedAtMs > NOW_EPOCH - 30 * DAY_MS) active.add(p.creator);
  const vals = [...active].map((c) => cleared30.get(c) ?? 0);
  const t = typicalEarnings(vals);
  const events = [];
  const add = (e) => events.push(e);
  // the Friday run creates all its transfers within about 20 minutes; the public feed shows a sample of them (every instant cash-out, about half of weekly ones)
  for (const p of W.payouts) if (['paid', 'in_transit'].includes(p.status) && p.initiatedMs > NOW_EPOCH - 5 * DAY_MS && (p.kind === 'instant' || p.net >= 10_000 || rng.chance(0.5))) add({ at: p.kind === 'weekly' ? Math.min(NOW_EPOCH, p.initiatedMs + rng.int(0, 19 * 60) * 1000) : p.initiatedMs, kind: 'payout', text: `@${p.creator.handle} was paid ${money(p.net)}`, amount: p.net, creator: p.creator, tier: p.tier, proof: p.proof, handle: p.creator.handle });
  for (const c of W.creators) if (c.firstDollarMs && c.firstDollarMs > NOW_EPOCH - 8 * DAY_MS) add({ at: c.firstDollarMs, kind: 'first_dollar', text: `@${c.handle} earned a first dollar`, creator: c, handle: c.handle, tier: c.tier });
  for (const b of W.bounties) if (b.filledAtMs && b.filledAtMs > NOW_EPOCH - 10 * DAY_MS && b.funding_source !== 'platform' && !b.direct) add({ at: b.filledAtMs, kind: 'bounty_filled', text: `${b.title} by ${b.brand.name} is filled`, bounty: b, app: b.app.name });
  for (const ad of W.ads) if (ad.startedAt && ad.startedAt > NOW_EPOCH - 14 * DAY_MS) add({ at: ad.startedAt, kind: 'promoted', text: `${ad.brand.name} promoted a winner by @${ad.creator.handle}`, creator: ad.creator, handle: ad.creator.handle, bounty: ad.bounty, app: ad.app.name });
  // milestones: running total of paid-out money crossing round thousands
  let run = 0;
  const byTime = [...paid].sort((a, b) => a.initiatedMs - b.initiatedMs);
  let nextMark = 500_000;
  for (const p of byTime) { run += p.net; while (run >= nextMark) { if (p.initiatedMs > NOW_EPOCH - 21 * DAY_MS) add({ at: p.initiatedMs + 1000, kind: 'milestone', text: `flowd has paid out ${money(nextMark)} to creators`, amount: nextMark }); nextMark += 500_000; } }
  for (const c of W.creators) if (c.tierSinceMs && c.tierSinceMs > NOW_EPOCH - 14 * DAY_MS && c.tier !== 'bronze' && !c.founding) add({ at: c.tierSinceMs, kind: 'tier_up', text: `@${c.handle} reached ${c.tier.charAt(0).toUpperCase()}${c.tier.slice(1)}`, creator: c, handle: c.handle, tier: c.tier });
  events.sort((a, b) => b.at - a.at);
  const top = events.slice(0, 64);
  top.forEach((e, i) => { e.id = `tick_${i + 1}`; });
  W.ticker = { totals: { total, today, d7, creatorsPaid: new Set(paid.map((p) => p.creator)).size, payoutsCount: paid.length, postsCleared: W.posts.filter((p) => ['cleared', 'paid'].includes(p.status)).length, typical: t.median, p25: t.p25, p75: t.p75, p90: t.p90, active: vals.length }, events: top };
}

// ── app daily metrics ───────────────────────────────────────────────────────────────────────────
export function buildAppMetrics(W) {
  const rows = [];
  const L = W.L;
  const byAppDay = new Map();
  const bump = (app, d, k, v) => { const key = `${app.id}|${d}`; const e = byAppDay.get(key) ?? { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0, revenue: 0, live: 0, newPosts: 0, newSubs: 0, approvals: 0, pay: 0, fee: 0 }; e[k] += v; byAppDay.set(key, e); };
  for (const p of W.posts) {
    for (const d of p.daily) { for (const k of ['views', 'clicks', 'installs', 'trials', 'paid', 'est_installs', 'est_trials', 'est_paid']) bump(p.app, d.date, k, d[k]); }
    bump(p.app, dateOf(p.postedAt), 'newPosts', 1);
    // posts in their window that day
    for (let t = ms(`${dateOf(p.postedAt)}T00:00:00Z`); t <= Math.min(NOW_EPOCH, ms(p.windowEndsAt)); t += DAY_MS) bump(p.app, iso(t).slice(0, 10), 'live', 1);
  }
  for (const c of W.convs) if (c.kind === 'paid' && c.payable && c.status !== 'rejected') bump(c.app, c.occurredOn, 'revenue', c.revenue);
  for (const s of W.subs) { bump(s.app, dateOf(iso(s.derived.versions[0].at)), 'newSubs', 1); if (s.derived.approvedAt) bump(s.app, dateOf(iso(s.derived.approvedAt)), 'approvals', 1); }
  for (const t of L.txns) for (const l of t.legs) {
    if (l.acct.startsWith('escrow:') && ['cpm', 'cpa', 'flat_fee'].includes(l.type) && l.amt < 0 && l.bounty) {
      const fee = t.legs.find((x) => x.acct === 'platform:fees' && x.amt > 0)?.amt ?? 0;
      const d = dateOf(iso(t.at));
      bump(l.bounty.app, d, 'pay', -l.amt - fee); bump(l.bounty.app, d, 'fee', fee);
    }
  }
  for (const app of W.apps) {
    for (let t = ms(`${dateOf(app.connectedAt)}T00:00:00Z`); t <= NOW_EPOCH; t += DAY_MS) {
      const d = iso(t).slice(0, 10);
      const e = byAppDay.get(`${app.id}|${d}`) ?? { views: 0, clicks: 0, installs: 0, trials: 0, paid: 0, est_installs: 0, est_trials: 0, est_paid: 0, revenue: 0, live: 0, newPosts: 0, newSubs: 0, approvals: 0, pay: 0, fee: 0 };
      rows.push({ app, date: d, ...e });
    }
  }
  W.appDaily = rows;
  return rows;
}
