// Daily Drop selection, notification rules, review SLA, error mapping and the mock adapters.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MockMlAdapter } from '../_shared/adapters/ml.ts';
import { encodeForm, MockPaymentsAdapter } from '../_shared/adapters/payments.ts';
import { MockPlatformAdapter } from '../_shared/adapters/platform.ts';
import { fromDatabaseError, SQLSTATE_ERRORS } from '../_shared/errors.ts';
import { categoryOf, inQuietHours, numbersHidden, redactMoney } from '../_shared/notify-rules.ts';
import { DEFAULT_CONFIG, type DropCandidate, headline, pickItems, spotsLeft, syncedSpotsTotal } from '../daily-drop/select.ts';
import { canListAsSpec, hoursInReview, isClean, releasedSpecPriceCents, slaState } from '../housekeeping/rules.ts';

const NOW = new Date('2026-10-03T14:00:00Z');

// ── Daily Drop ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function cand(id: string, over: Partial<DropCandidate> = {}): DropCandidate {
  return { bountyId: id, brandId: `br_${id}`, category: 'ai_photo', brandScore: 90, cpmCents: 240, spotsLeft: 30, publishedAt: '2026-10-01T10:00:00Z', daysSinceLastDrop: null, ...over };
}

test('spots left uses the database arithmetic: floor(remaining / (cap + fee on cap))', () => {
  assert.equal(spotsLeft(159000, 25000, 0.1), 5); // DOMAIN worked example
  assert.equal(spotsLeft(27499, 25000, 0.1), 0);
  assert.equal(spotsLeft(27500, 25000, 0.1), 1);
  assert.equal(spotsLeft(100000, 5000, 0.06), 18);
  assert.equal(spotsLeft(100000, 0, 0.1), 0);
});

test('a bounty without real room is never in the drop, and spots never exceed the pool', () => {
  const items = pickItems([cand('a', { spotsLeft: 7 }), cand('b', { spotsLeft: 8 }), cand('c', { spotsLeft: 100 })], NOW);
  assert.deepEqual(items.map((i) => i.bountyId).sort(), ['b', 'c']);
  assert.equal(items.find((i) => i.bountyId === 'b')?.spotsTotal, 8);
  assert.equal(items.find((i) => i.bountyId === 'c')?.spotsTotal, 40, 'capped at 40 per item');
});

test('at most two per category and six per drop, best first, positions are 1..n', () => {
  const many = Array.from({ length: 10 }, (_, i) => cand(`p${i}`, { category: 'ai_photo', brandScore: 95 - i }));
  const other = ['fitness', 'language', 'finance', 'sleep_mind', 'music_audio'].map((c, i) => cand(`o${i}`, { category: c, brandScore: 60 }));
  const items = pickItems([...many, ...other], NOW);
  assert.equal(items.length, DEFAULT_CONFIG.itemsPerDrop);
  assert.equal(items.filter((i) => i.bountyId.startsWith('p')).length, 2);
  assert.deepEqual(items.map((i) => i.position), [1, 2, 3, 4, 5, 6]);
  assert.equal(items[0]?.bountyId, 'p0');
});

test('a new brand ranks as neutral and a bounty shown yesterday ranks lower than one never shown', () => {
  const [first] = pickItems([cand('shown', { daysSinceLastDrop: 1 }), cand('fresh', { daysSinceLastDrop: null })], NOW);
  assert.equal(first?.bountyId, 'fresh');
  const withNew = pickItems([cand('new', { brandScore: null, category: 'fitness' }), cand('poor', { brandScore: 40, category: 'language' })], NOW);
  assert.equal(withNew[0]?.bountyId, 'new');
});

test('no qualifying bounty means no items (an honest empty day)', () => {
  assert.deepEqual(pickItems([cand('a', { spotsLeft: 2 })], NOW), []);
  assert.deepEqual(pickItems([], NOW), []);
});

test('inventory sync: claims are never taken away and the total never grows', () => {
  assert.equal(syncedSpotsTotal(40, 12, 100), 40);
  assert.equal(syncedSpotsTotal(40, 12, 10), 22);
  assert.equal(syncedSpotsTotal(40, 12, 0), 12);
  assert.equal(syncedSpotsTotal(40, 0, 0), 0);
});

test('headline states real numbers', () => {
  assert.equal(headline([{ bountyId: 'a', spotsTotal: 30, position: 1 }, { bountyId: 'b', spotsTotal: 12, position: 2 }]), '2 bounties, 42 real spots. Claim one and you have 24 hours to submit.');
  assert.match(headline([{ bountyId: 'a', spotsTotal: 8, position: 1 }]), /^1 bounty, 8 real spots/);
});

// ── notification rules ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('notification kinds map to the preference categories', () => {
  assert.equal(categoryOf('payout_paid'), 'money');
  assert.equal(categoryOf('changes_requested'), 'reviews');
  assert.equal(categoryOf('drop_live'), 'drop');
  assert.equal(categoryOf('offer_received'), 'offers');
  assert.equal(categoryOf('tier_up'), 'tips');
  assert.equal(categoryOf('scam_warning'), 'safety');
  assert.equal(categoryOf('something_new'), 'tips');
});

test('quiet hours wrap midnight and follow the person\'s timezone', () => {
  const quiet = { enabled: true, start: '22:00', end: '08:00', timezone: 'America/Los_Angeles' };
  assert.equal(inQuietHours(quiet, 'UTC', new Date('2026-10-03T14:00:00Z')), true); // 07:00 in Los Angeles (PDT) is before 08:00: still quiet
  assert.equal(inQuietHours(quiet, 'UTC', new Date('2026-10-03T16:00:00Z')), false); // 09:00 PDT
  assert.equal(inQuietHours(quiet, 'UTC', new Date('2026-10-03T08:00:00Z')), true); // 01:00 PDT
  assert.equal(inQuietHours({ ...quiet, enabled: false }, 'UTC', new Date('2026-10-03T08:00:00Z')), false);
  assert.equal(inQuietHours({ enabled: true, start: '12:00', end: '14:00', timezone: 'UTC' }, 'UTC', new Date('2026-10-03T13:00:00Z')), true);
  assert.equal(inQuietHours({ enabled: true, start: '12:00', end: '14:00', timezone: 'UTC' }, 'UTC', new Date('2026-10-03T14:00:00Z')), false);
  assert.equal(inQuietHours(null, 'UTC', NOW), false);
  assert.equal(inQuietHours({ enabled: true, start: '08:00', end: '08:00', timezone: 'UTC' }, 'UTC', NOW), false);
});

test('numbers-off hides amounts only while it is on and inside its dates', () => {
  assert.equal(numbersHidden({ enabled: true, numbers_off: { enabled: true } }, NOW), true);
  assert.equal(numbersHidden({ enabled: false, numbers_off: { enabled: true } }, NOW), false);
  assert.equal(numbersHidden({ enabled: true, numbers_off: { enabled: false } }, NOW), false);
  assert.equal(numbersHidden({ enabled: true, numbers_off: { enabled: true, from: '2026-10-10' } }, NOW), false);
  assert.equal(numbersHidden({ enabled: true, numbers_off: { enabled: true, from: '2026-10-01', to: '2026-10-03' } }, NOW), true);
  assert.equal(numbersHidden(null, NOW), false);
  assert.equal(redactMoney('$1,240.50 cleared and $5 on its way'), 'an amount cleared and an amount on its way');
});

// ── review SLA (parity with the SQL vectors) ─────────────────────────────────────────────────────────────────────────────────

test('review SLA states match packages/contract/formula-vectors.json', () => {
  const file = fileURLToPath(new URL('../../../packages/contract/formula-vectors.json', import.meta.url));
  const vectors = JSON.parse(fs.readFileSync(file, 'utf8')) as { sla: Array<{ in: { hours: number }; out: string }> };
  assert.ok(vectors.sla.length >= 5);
  for (const v of vectors.sla) assert.equal(slaState(v.in.hours), v.out, `${v.in.hours} h`);
  assert.equal(hoursInReview('2026-10-03T14:00:00Z', new Date('2026-10-01T14:00:00Z')), 24, 'sla_due_at is entered review + 72 h');
});

test('timeout policy and Spec Market rules', () => {
  assert.equal(isClean({ qa_pass: 14, qa_warn: 0, qa_fail: 0 }), true);
  assert.equal(isClean({ qa_pass: 13, qa_warn: 1, qa_fail: 0 }), false);
  assert.equal(isClean({ qa_pass: 0, qa_warn: 0, qa_fail: 0 }), false, 'no check ran is not clean');
  assert.equal(canListAsSpec(55, { qa_pass: 12, qa_warn: 2, qa_fail: 0 }), true);
  assert.equal(canListAsSpec(54, { qa_pass: 12, qa_warn: 0, qa_fail: 0 }), false);
  assert.equal(canListAsSpec(80, { qa_pass: 12, qa_warn: 0, qa_fail: 1 }), false);
  assert.equal(releasedSpecPriceCents(4389), 4389);
  assert.equal(releasedSpecPriceCents(800), 1500);
  assert.equal(releasedSpecPriceCents(90000), 50000);
  assert.equal(releasedSpecPriceCents(undefined), 4000);
});

// ── errors ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('every business SQLSTATE FD001..FD022 has an API code and status', () => {
  for (let i = 1; i <= 22; i++) {
    const code = `FD${String(i).padStart(3, '0')}`;
    const spec = SQLSTATE_ERRORS[code];
    assert.ok(spec, code);
    assert.match(spec.code, /^[a-z_]+$/);
  }
  const e = fromDatabaseError({ code: 'FD001', message: 'pool_exhausted', details: 'the pool has 100 cents left', hint: null });
  assert.equal(e.code, 'pool_exhausted');
  assert.equal(e.status, 409);
  assert.equal(e.message, 'the pool has 100 cents left');
  assert.deepEqual(e.toBody(), { code: 'pool_exhausted', message: 'the pool has 100 cents left' });
  const internal = fromDatabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' });
  assert.equal(internal.code, 'internal');
  assert.equal(internal.status, 500);
  assert.ok(!internal.message.includes('duplicate key'), 'database internals are not leaked');
});

// ── adapters ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('Stripe form encoding uses bracket notation for nested objects', () => {
  assert.equal(encodeForm({ amount: 5000, currency: 'usd', metadata: { flowd_payout_id: 'pay_1', flowd_creator_id: 'cr_x' }, skip: undefined }), 'amount=5000&currency=usd&metadata%5Bflowd_payout_id%5D=pay_1&metadata%5Bflowd_creator_id%5D=cr_x');
});

test('mock payments are deterministic and can fail a payout on demand', async () => {
  const p = new MockPaymentsAdapter();
  assert.deepEqual(await p.createTransfer({ payoutId: 'pay_1', creatorId: 'cr_x', destinationAccount: 'acct_1', amountCents: 1000, attempt: 1 }), { transferId: 'tr_mock_pay_1_1' });
  assert.equal((await p.createBankPayout({ payoutId: 'pay_1', accountId: 'a', amountCents: 1000, method: 'instant', attempt: 1 })).status, 'paid');
  assert.equal((await p.createBankPayout({ payoutId: 'pay_1', accountId: 'a', amountCents: 1000, method: 'standard', attempt: 1 })).status, 'in_transit');
  assert.equal((await p.createBankPayout({ payoutId: 'pay_fail_1', accountId: 'a', amountCents: 1000, method: 'standard', attempt: 1 })).status, 'failed');
  await assert.rejects(p.verifyWebhook('{"id":"evt","type":"x","data":{"object":{}}}', 'bogus', 0), /invalid_signature|Mock payments/);
  assert.equal((await p.verifyWebhook('{"id":"evt","type":"x","data":{"object":{}}}', 'mock', 0)).id, 'evt');
});

test('mock platform stats are deterministic, grow over time and a "-bot" post looks like bought views', async () => {
  const a = new MockPlatformAdapter('tiktok');
  const req = (id: string, now: string) => ({ platform: 'tiktok' as const, platformPostId: id, accessToken: 't', postedAt: '2026-10-01T09:00:00Z', now });
  const early = await a.fetchPostStats(req('7001', '2026-10-01T21:00:00Z'));
  const later = await a.fetchPostStats(req('7001', '2026-10-04T09:00:00Z'));
  assert.deepEqual(await a.fetchPostStats(req('7001', '2026-10-01T21:00:00Z')), early);
  assert.ok(later.viewsReported > early.viewsReported);
  assert.ok(Math.abs(Object.values(later.sources ?? {}).reduce((x, y) => x + y, 0) - 1) < 1e-9);
  const bot = await a.fetchPostStats(req('7002-bot', '2026-10-04T09:00:00Z'));
  assert.ok((bot.sources?.other ?? 0) > 0.5);
  assert.ok(bot.likes < bot.viewsReported * 0.01);
});

test('mock fraud model: a clean post stays clean, an external-heavy no-engagement post is held for review', async () => {
  const ml = new MockMlAdapter();
  const clean = await ml.fraud({ post: { views: 48200, likes: 2100, comments: 90, shares: 310, saves: 400, traffic_sources: { fyp: 0.62, other: 0.02 }, hourly_views: [3000, 2500, 2100, 1800, 1500, 1300, 1100, 900] } });
  assert.equal(clean.band, 'clean');
  assert.equal(clean.action, 'auto_clear');
  const bad = await ml.fraud({
    post: { views: 90000, likes: 80, comments: 2, shares: 1, saves: 0, traffic_sources: { other: 0.78, fyp: 0.18 }, hourly_views: [10, 10, 10, 40000, 41000, 8, 5, 4], geo: { IN: 0.9, US: 0.1 } },
    account: { followers: 900, account_age_days: 12 }, bounty: { target_countries: ['US'], min_target_audience_ratio: 0.5 },
  });
  assert.ok(bad.score >= 40, `score ${bad.score}`);
  assert.ok(['review', 'high'].includes(bad.band));
  assert.ok(bad.signals.every((s) => s.points > 0 && s.detail.length > 10), 'every signal carries its evidence');
  assert.equal(bad.score, Math.min(100, bad.signals.reduce((a, s) => a + s.points, 0)));
});
