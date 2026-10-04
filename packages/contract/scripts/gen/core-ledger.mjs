// CORE stage 6c: the double-entry ledger. Every transaction is a list of legs that net to zero. Wallet balances are simulated in time order so a brand
// tops up just in time; settlement legs follow the Money Clock rules (pending at window close, cleared at the 14:00 run).

import { allocate, slugify } from './lib.mjs';
import { mulRate, funding, cardProcessing } from '../../schema/formulas.mjs';
import { iso, ms, addHours, dateOf, clamp, C, HOUR_MS, DAY_MS, NOW, NOW_EPOCH, money, intFmt, runAtOrAfter, weeklyRunFor } from './core-kit.mjs';

const pct = (r) => `${Math.round(r * 100)}%`;
export const TYPE_EARN = new Set(['cpm', 'cpa', 'flat_fee', 'commission', 'rights_fee', 'bonus', 'prize', 'referral']);

/** a leg */
const leg = (acct, type, amt, o = {}) => ({ acct, type, amt, ...o });

export class Ledger {
  constructor() { this.txns = []; this.seq = 0; }
  add(atMs, legs, tag = '') {
    const t = { at: atMs, seq: this.seq++, legs, tag };
    for (const l of legs) { l.txn = t; l.postedMs = l.postedMs ?? atMs; }
    this.txns.push(t);
    return t;
  }
}

/** wallet event helper */
class Wallet {
  constructor(brand) { this.brand = brand; this.events = []; }
  debit(at, amount, kind, build) { this.events.push({ at, delta: -amount, kind, build }); }
  credit(at, amount, kind, build) { this.events.push({ at, delta: amount, kind, build }); }
}

export function buildLedger(W) {
  const rng = W.rng.fork('ledger');
  const L = new Ledger();
  W.L = L;
  const wallets = new Map(W.brands.map((b) => [b, new Wallet(b)]));
  W.invoicesPlan = [];
  const acct = (c) => `creator:${c.id}`;

  // ── 1. settlement legs of every post ───────────────────────────────────────────────────────────
  const earnRows = []; // creator earning legs
  const settleTxn = (p, kind, pay, fee, atMs, state, extra = {}) => {
    const b = p.bounty;
    const c = p.creator;
    const common = { brand: b.brand, bounty: b, post: p, sub: p.s, creator: c };
    const memoPay = extra.memo;
    const status = state.status;
    const cr = leg(acct(c), kind, pay, { ...common, status, clearedMs: state.clearedMs, memo: memoPay, conv: extra.conv, earning: true });
    const esc = leg(`escrow:${b.id}`, kind, -(pay + fee), { ...common, status: 'cleared', memo: memoPay, conv: extra.conv });
    const legs = [esc, cr];
    if (fee > 0) legs.push(leg('platform:fees', 'fee', fee, { ...common, status: 'cleared', memo: `Platform fee ${pct(b.take_rate)}: ${b.title}`, conv: extra.conv }));
    const t = L.add(atMs, legs, 'settle');
    if (extra.reversible) t.reversible = true;
    earnRows.push(cr);
    return { txn: t, cr, esc };
  };
  for (const p of W.posts) {
    const plan = p.plan;
    if (!plan || p.removedAt) continue;
    const b = p.bounty;
    p.rows = [];
    const stateOf = (x) => (x.held ? { status: 'held', clearedMs: x.runMs <= NOW_EPOCH ? x.runMs : undefined } : x.cleared ? { status: 'cleared', clearedMs: x.runMs } : { status: 'pending' });
    if (plan.flat) {
      const f = plan.flat;
      const memo = b.is_starter ? `Starter bounty: ${b.title.replace(/^Starter: /, '')}` : `Flat fee: ${b.title.replace(/^Direct: /, '')}`;
      const r1 = settleTxn(p, 'flat_fee', f.pay, f.fee, f.postedMs, stateOf(f), { memo });
      p.rows.push(r1.cr);
    }
    if (plan.cpm && plan.cpm.pay > 0) {
      const c1 = plan.cpm;
      if (p.role === 'clawback') {
        const invalid = Math.min(c1.pay, Math.round((c1.views * (p.invalidViewsFrac || 0.5) * b.cpm_cents) / 1000));
        p.invalidPay = invalid;
        const validPay = c1.pay - invalid;
        const memoA = `Views pay: ${b.title} (${intFmt(Math.round(c1.views * (1 - (p.invalidViewsFrac || 0.5))))} verified views)`;
        const memoB = `Views pay: ${b.title} (${intFmt(Math.round(c1.views * (p.invalidViewsFrac || 0.5)))} views later found invalid)`;
        if (validPay > 0) p.rows.push(settleTxn(p, 'cpm', validPay, mulRate(validPay, b.take_rate), c1.postedMs, stateOf(c1), { memo: memoA }).cr);
        if (invalid > 0) { const rb = settleTxn(p, 'cpm', invalid, mulRate(invalid, b.take_rate), c1.postedMs, stateOf(c1), { memo: memoB, reversible: true }); rb.cr.invalidLeg = true; p.rows.push(rb.cr); p.clawLeg = rb; }
      } else {
        const memo = `Views pay: ${b.title} (${intFmt(c1.views)} verified views)`;
        p.rows.push(settleTxn(p, 'cpm', c1.pay, c1.fee, c1.postedMs, stateOf(c1), { memo }).cr);
      }
    }
    for (const bt of plan.cpa) {
      if (!bt.cleared || bt.pay <= 0) continue;
      const kindLabel = bt.kind === 'install' ? 'Install bonus' : bt.kind === 'trial' ? 'Trial bonus' : 'Paid conversion bonus';
      const memo = `${kindLabel} x${bt.qty} (tracked ${bt.source}): ${b.title}`;
      const r1 = settleTxn(p, 'cpa', bt.pay, bt.fee, bt.clearMs, { status: 'cleared', clearedMs: bt.clearMs }, { memo, conv: bt });
      bt.leg = r1.cr;
      bt.txn = r1.txn;
      p.rows.push(r1.cr);
    }
  }

  // ── 2. clawbacks (before the weekly payout, so the reversed leg never reaches a payout)
  for (const p of W.posts) {
    if (p.role !== 'clawback' || !p.clawLeg) continue;
    const { cr, esc, txn } = p.clawLeg;
    const feeLeg = txn.legs.find((l) => l.acct === 'platform:fees');
    const fee = feeLeg?.amt ?? 0;
    const at = Math.min(NOW_EPOCH - 6 * HOUR_MS, (cr.clearedMs ?? txn.at) + rng.int(4, 40) * HOUR_MS);
    const b = p.bounty;
    const memo = 'Clawback: proven view fraud (delivered views still paid)';
    const common = { brand: b.brand, bounty: b, post: p, sub: p.s, creator: p.creator };
    const legs = [leg(acct(p.creator), 'clawback', -cr.amt, { ...common, status: 'reversed', memo, earning: false, reverses: txn }), leg('platform:fees', 'clawback', -fee, { ...common, status: 'cleared', memo, reverses: txn }), leg(b.brand.kind === 'platform' ? 'platform:promo' : `wallet:${b.brand.id}`, 'clawback', cr.amt + fee, { ...common, status: 'cleared', memo, reverses: txn })];
    const tx = L.add(at, legs, 'clawback');
    cr.status = 'reversed';
    cr.reversedBy = tx;
    // wallet credit (no top-up needed)
    p.clawTxn = tx;
  }

  // ── 3. bounty funding, matched budget, refunds (wallet events) ─────────────────────────────────
  const fundedAtOf = (b) => {
    if (b.funding_source === 'platform') return ms(b.createdAt) + HOUR_MS;
    const start = ms(b.startsAt);
    const created = ms(b.createdAt);
    const lead = Math.min(start - HOUR_MS, created + (b.rr ?? 1) * 6 * HOUR_MS);
    return Math.max(created + 40 * 60_000, Math.min(lead, b.status === 'cancelled' ? ms(b.cancelledAt) - 14 * HOUR_MS : lead));
  };
  for (const b of W.bounties) {
    b.rr = rng.float(0.5, 4);
    if (['draft', 'awaiting_funding'].includes(b.status)) { b.fundedAtMs = undefined; continue; }
    const fundedAt = Math.min(fundedAtOf(b), ms(b.startsAt) - 20 * 60_000, NOW_EPOCH - HOUR_MS);
    b.fundedAtMs = fundedAt;
    const T = b.escrowTotal;
    const memoFund = `Funded: ${b.title} (${money(b.budget)} pool + ${money(b.fee_reserve)} fee reserve)`;
    if (b.funding_source === 'platform') {
      // platform-funded: promo account -> escrow
      L.add(fundedAt, [leg('platform:promo', 'escrow_fund', -T, { brand: b.brand, bounty: b, memo: `Funded by flowd: ${b.title} (${money(b.budget)} pool)`, status: 'cleared' }), leg(`escrow:${b.id}`, 'escrow_fund', T, { brand: b.brand, bounty: b, memo: `Funded by flowd: ${b.title} (${money(b.budget)} pool)`, status: 'cleared' })], 'fund');
      b.fundTxnAt = fundedAt;
      continue;
    }
    const X = T - (b.matched ?? 0);
    const w = wallets.get(b.brand);
    w.debit(fundedAt, X, 'fund', (at, ctx) => {
      const t = L.add(at, [leg(`wallet:${b.brand.id}`, 'escrow_fund', -X, { brand: b.brand, bounty: b, memo: memoFund, status: 'cleared' }), leg(`escrow:${b.id}`, 'escrow_fund', X, { brand: b.brand, bounty: b, memo: memoFund, status: 'cleared' })], 'fund');
      b.fundTxn = t;
      b.fundTopup = ctx.topup;
      if (b.matched > 0) L.add(at, [leg('platform:matching', 'matched_budget', -b.matched, { brand: b.brand, bounty: b, memo: 'Matched budget (first bounty)', status: 'cleared' }), leg(`escrow:${b.id}`, 'matched_budget', b.matched, { brand: b.brand, bounty: b, memo: 'Matched budget (first bounty)', status: 'cleared' })], 'match');
    });
  }

  // refunds at settlement and on cancellation
  const lastEventMs = (b) => {
    let t = ms(b.endsAt);
    for (const p of b.posts) {
      t = Math.max(t, ms(p.windowEndsAt) + 2 * HOUR_MS);
      for (const bt of p.plan?.cpa ?? []) if (bt.cleared) t = Math.max(t, bt.clearMs);
      if (p.clawTxn) t = Math.max(t, p.clawTxn.at);
    }
    return t;
  };
  for (const b of W.bounties) {
    if (b.status === 'settled') {
      const cpaWindow = (b.type === 'stacked' || b.type === 'cpa' || b.type === 'install_only') ? 30 * DAY_MS : 0;
      let lastPost = 0;
      for (const p of b.posts) lastPost = Math.max(lastPost, p.postedAtMs);
      let t = Math.max(lastEventMs(b), lastPost + cpaWindow + 3 * DAY_MS);
      if (b.direct) t = Math.max(lastEventMs(b) + 24 * HOUR_MS, lastPost + 5 * DAY_MS);
      const settledAt = ms(runAtOrAfter(iso(t))) + HOUR_MS;
      b.settledAtMs = Math.min(settledAt, NOW_EPOCH - 6 * HOUR_MS);
      b.refundPending = true;
    } else if (b.status === 'cancelled') {
      b.refundAtMs = ms(b.cancelledAt);
      b.refundPending = true;
    }
  }
  W.wallets = wallets;

  // ── 4. subscriptions (card, platform:subscriptions) ───────────────────────────────────────────────
  for (const b of W.brands) {
    if (b.kind === 'platform' || b.plan === 'free' || !b.planSince) continue;
    const price = C.plans[b.plan].price_cents_month;
    let k = 0;
    for (let t = ms(b.planSince); t <= NOW_EPOCH; k++, t = ms(addMonths(b.planSince, k))) {
      const end = addMonths(b.planSince, k + 1);
      const t0 = ms(addMonths(b.planSince, k));
      if (t0 > NOW_EPOCH) break;
      const memo = `flowd ${C.plans[b.plan].label} plan, ${fmtShort(iso(t0))} to ${fmtShort(iso(ms(end) - DAY_MS))}`;
      const tx = L.add(t0, [leg('external:card', 'subscription_fee', -price, { brand: b, memo, status: 'cleared' }), leg('platform:subscriptions', 'subscription_fee', price, { brand: b, memo, status: 'cleared' })], 'subscription');
      W.invoicesPlan.push({ kind: 'subscription', brand: b, txn: tx, price, at: t0, memo, period: [iso(t0), end] });
    }
    b.planRenewsAt = addMonths(b.planSince, k);
  }

  // ── 5. ad commission and platform fee (brand wallet) ───────────────────────────────────────────
  const fridayAt = (isoDate, hour = 10) => ms(`${isoDate}T${String(hour).padStart(2, '0')}:00:00Z`);
  for (const ad of W.ads) {
    if (!ad.startedAt) continue;
    const b = ad.bounty;
    ad.commissionTxns = [];
    const startDate = dateOf(iso(ad.startedAt));
    const endTs = Math.min(ad.endedAt ?? ad.pausedAt ?? NOW_EPOCH, NOW_EPOCH);
    // settlement dates: Fridays 10:00 UTC strictly after the start, up to now; the last day of an ended ad settles the remainder
    const dates = [];
    for (let t = ms('2026-07-10T10:00:00Z'); t <= NOW_EPOCH; t += 7 * DAY_MS) if (t > ad.startedAt + 3 * HOUR_MS && t <= endTs + 7 * DAY_MS && t <= NOW_EPOCH - 4 * HOUR_MS) dates.push(t);
    const ended = ad.status === 'ended' || ad.status === 'expired' || ad.status === 'paused';
    let doneRev = 0; let doneSpend = 0; let doneCommission = 0; let doneFee = 0;
    const windowEnd = ad.windowEnds ?? Infinity;
    dates.forEach((t, i) => {
      const upTo = i === dates.length - 1 && ended ? Infinity : t;
      const pre = ad.daily.filter((d) => ms(`${d.date}T00:00:00Z`) < windowEnd && ms(`${d.date}T23:59:59Z`) <= upTo);
      const rev = pre.reduce((a, x) => a + x.revenue_cents, 0);
      const spend = ad.daily.filter((d) => ms(`${d.date}T23:59:59Z`) <= upTo).reduce((a, x) => a + x.spend_cents, 0);
      // proportional commission: the total is round(rate x all revenue); each txn is the difference of the running rounded totals
      const totalCommission = mulRate(rev, C.pay.ad_commission_rate);
      const commission = totalCommission - doneCommission;
      const totalFee = mulRate(spend, C.fees.ad_spend_fee_rate);
      const fee = totalFee - doneFee;
      doneCommission = totalCommission; doneFee = totalFee;
      const w = wallets.get(b.brand);
      if (commission > 0) {
        const memo = `Ad commission: 10% of ad-attributed revenue (${b.title})`;
        w.debit(t, commission, 'commission', (at) => {
          const cr = leg(acct(ad.creator), 'commission', commission, { brand: b.brand, bounty: b, post: ad.post, sub: ad.post.s, creator: ad.creator, ad, memo, status: at + 4 * HOUR_MS <= NOW_EPOCH ? 'cleared' : 'pending', clearedMs: at + 4 * HOUR_MS <= NOW_EPOCH ? ms(`${dateOf(iso(at))}T14:00:00Z`) : undefined, earning: true });
          if (cr.status === 'cleared' && cr.clearedMs < at) cr.clearedMs = at;
          const tx = L.add(at, [leg(`wallet:${b.brand.id}`, 'commission', -commission, { brand: b.brand, bounty: b, post: ad.post, creator: ad.creator, ad, memo, status: 'cleared' }), cr], 'commission');
          earnRows.push(cr);
          ad.commissionTxns.push({ tx, cr, amount: commission });
        });
      }
      if (fee > 0) {
        const memo = `Winner promotion fee: 1% of ad spend (${b.title})`;
        w.debit(t, fee, 'adfee', (at) => {
          const tx = L.add(at, [leg(`wallet:${b.brand.id}`, 'ad_fee', -fee, { brand: b.brand, bounty: b, ad, memo, status: 'cleared' }), leg('platform:fees', 'ad_fee', fee, { brand: b.brand, bounty: b, ad, memo, status: 'cleared' })], 'adfee');
          W.invoicesPlan.push({ kind: 'ad_fee', brand: b.brand, txn: tx, fee, ad, at, memo, spend });
        });
      }
    });
    ad.commissionSettled = doneCommission;
    ad.feeSettled = doneFee;
  }

  // ── 6. rights renewals (two) ──────────────────────────────────────────────────────────────────────
  W.renewals = [];
  const renewCands = W.posts.filter((p) => p.rows?.some((r) => r.type === 'cpm' && r.status !== 'reversed') && p.bounty.rights_card.paid_ads_days > 0 && !p.removedAt && p.role == null && (p.s.derived.approvedAt + 60 * DAY_MS) < NOW_EPOCH && p.poolPay > 2500 && !p.creator.persona && p.bounty.brand.kind === 'brand');
  const picked = rng.sample(renewCands.filter((p) => p.bounty.brand.key !== 'lumi'), 1).concat(rng.sample(renewCands.filter((p) => p.bounty.brand.key === 'lumi'), 1));
  picked.forEach((p, i) => {
    if (!p) return;
    const base = p.rows.filter((r) => r.status !== 'reversed' && (r.type === 'cpm' || r.type === 'cpa' || r.type === 'flat_fee')).reduce((a, r) => a + r.amt, 0);
    const price = mulRate(base, p.bounty.rights_card.renewal_pct_per_30d);
    const fee = mulRate(price, p.bounty.take_rate);
    const at = NOW_EPOCH - (6 + i * 5) * DAY_MS;
    const memo = `Rights renewal, 30 days: ${p.bounty.title}`;
    const w = wallets.get(p.bounty.brand);
    w.debit(at, price + fee, 'rights', (tAt) => {
      const cr = leg(acct(p.creator), 'rights_fee', price, { brand: p.bounty.brand, bounty: p.bounty, post: p, sub: p.s, creator: p.creator, memo, status: 'cleared', clearedMs: ms(runAtOrAfter(iso(tAt))), earning: true });
      const legs = [leg(`wallet:${p.bounty.brand.id}`, 'rights_fee', -(price + fee), { brand: p.bounty.brand, bounty: p.bounty, post: p, creator: p.creator, memo, status: 'cleared' }), cr];
      if (fee > 0) legs.push(leg('platform:fees', 'fee', fee, { brand: p.bounty.brand, bounty: p.bounty, post: p, memo: `Platform fee ${pct(p.bounty.take_rate)}: rights renewal`, status: 'cleared' }));
      const tx = L.add(tAt, legs, 'rights');
      earnRows.push(cr);
      W.renewals.push({ post: p, tx, price, fee, at: tAt, basePay: base });
      W.invoicesPlan.push({ kind: 'rights_renewal', brand: p.bounty.brand, txn: tx, price, fee, post: p, at: tAt, memo });
    });
  });
  W.earnRows = earnRows;
}

// ── wallet simulation and wallet-dependent transactions ─────────────────────────────────────────
export function runWallets(W) {
  const L = W.L;
  const rng = W.rng.fork('wallets');
  const lumiTarget = 248_000;
  for (const [brand, w] of W.wallets) {
    // refunds are credits created from the bounty's escrow balance after every settlement leg is in place
    const evs = w.events;
    // add refund events
    for (const b of W.bounties) {
      if (b.brand !== brand) continue;
      if (b.refundPending) {
        const at = b.status === 'settled' ? b.settledAtMs : b.refundAtMs;
        evs.push({ at, delta: 0, kind: 'refund', bounty: b, build: null });
      }
    }
    for (const t of L.txns) if (t.tag === 'clawback') for (const l of t.legs) if (l.acct === `wallet:${brand.id}`) evs.push({ at: t.at, delta: l.amt, kind: 'clawcredit', build: null });
    evs.sort((a, b2) => a.at - b2.at || (a.delta - b2.delta));
    let bal = 0;
    for (const e of evs) {
      if (e.kind === 'clawcredit') { bal += e.delta; continue; }
      if (e.kind === 'refund') {
        const b = e.bounty;
        // unspent escrow = funded - settlement debits (already known: legs on the escrow account up to now)
        let spent = 0;
        for (const t of L.txns) for (const l of t.legs) if (l.acct === `escrow:${b.id}` && l.amt < 0 && l.type !== 'escrow_refund') spent += -l.amt;
        const funded = b.escrowTotal;
        const refund = funded - spent;
        b.refundAmount = refund;
        if (refund > 0) {
          const memo = `Refund of unspent budget: ${b.title}`;
          L.add(e.at, [leg(`escrow:${b.id}`, 'escrow_refund', -refund, { brand, bounty: b, memo, status: 'cleared' }), leg(`wallet:${brand.id}`, 'escrow_refund', refund, { brand, bounty: b, memo, status: 'cleared' })], 'refund');
          bal += refund;
        }
        continue;
      }
      if (e.delta < 0) {
        const need = -e.delta;
        let ctx = {};
        if (bal < need) {
          const short = need - bal;
          const amount = e.kind === 'fund' ? short : Math.max(10_000, Math.ceil(short / 10_000) * 10_000);
          const proc = cardProcessing(amount);
          const at = e.at - rng.int(8, 40) * 60_000;
          const memo = e.kind === 'fund' ? `Wallet top-up by card (${money(amount)})` : `Wallet top-up by card (${money(amount)})`;
          const tx = L.add(at, [leg('external:card', 'wallet_topup', -(amount + proc), { brand, memo, status: 'cleared' }), leg(`wallet:${brand.id}`, 'wallet_topup', amount, { brand, memo, status: 'cleared' }), leg('platform:processing', 'processing', proc, { brand, memo: `Card processing (2.9% + $0.30)`, status: 'cleared' })], 'topup');
          bal += amount;
          ctx.topup = { tx, amount, proc };
          W.invoicesPlan.push({ kind: 'topup', brand, txn: tx, amount, proc, at, bounty: e.kind === 'fund' ? undefined : undefined, forFund: e.kind === 'fund' });
        }
        bal -= need;
        e.build?.(e.at, ctx);
      }
    }
    // credits from clawbacks are in the ledger already; add them to the balance for the final comparison
    let finalBal = 0;
    for (const t of L.txns) for (const l of t.legs) if (l.acct === `wallet:${brand.id}`) finalBal += l.amt;
    brand.walletBal = finalBal;
    if (brand.key === 'lumi') {
      const extra = lumiTarget - finalBal;
      if (extra > 0) {
        const proc = cardProcessing(extra);
        const at = ms('2026-10-01T09:20:00Z');
        const tx = L.add(at, [leg('external:card', 'wallet_topup', -(extra + proc), { brand, memo: `Wallet top-up by card (${money(extra)})`, status: 'cleared' }), leg(`wallet:${brand.id}`, 'wallet_topup', extra, { brand, memo: `Wallet top-up by card (${money(extra)})`, status: 'cleared' }), leg('platform:processing', 'processing', proc, { brand, memo: 'Card processing (2.9% + $0.30)', status: 'cleared' })], 'topup');
        W.invoicesPlan.push({ kind: 'topup', brand, txn: tx, amount: extra, proc, at });
        brand.walletBal = lumiTarget;
      } else brand.walletBal = finalBal;
    }
  }
}

function addMonths(isoStr, n) {
  const d = new Date(ms(isoStr));
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0));
}
function fmtShort(isoStr) {
  const d = new Date(ms(isoStr));
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}
