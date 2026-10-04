// sync-views cadence, job slots, the payout run clock, expiry thresholds, retry policy and the fraud-gate arithmetic.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertToSend } from '../expiry-alerts/thresholds.ts';
import { expectedEnvelope, curveShape, hourlySeries } from '../_shared/fraud-math.ts';
import { FAILING_AFTER, nextRetryDelaySeconds, RETRY_DELAYS_SECONDS } from '../_shared/retry.ts';
import { daySlot, hourSlot, minuteSlot } from '../_shared/slots.ts';
import { isDue, wantsSnapshot } from '../sync-views/schedule.ts';
import { currentRunAt } from '../weekly-payouts/run-at.ts';

const d = (s: string): Date => new Date(s);

test('slots floor to the boundary so a late retry lands on the same row', () => {
  assert.equal(hourSlot(d('2026-10-03T14:05:41.123Z')), '2026-10-03T14:00:00.000Z');
  assert.equal(minuteSlot(d('2026-10-03T14:47:10Z'), 30), '2026-10-03T14:30:00.000Z');
  assert.equal(minuteSlot(d('2026-10-03T14:14:59Z'), 30), '2026-10-03T14:00:00.000Z');
  assert.equal(minuteSlot(d('2026-10-03T14:07:00Z'), 5), '2026-10-03T14:05:00.000Z');
  assert.equal(daySlot(d('2026-10-03T14:00:05Z'), 14), '2026-10-03T14:00:00.000Z');
  assert.equal(daySlot(d('2026-10-03T13:59:59Z'), 14), '2026-10-02T14:00:00.000Z', 'before today\'s run the slot is yesterday\'s');
  assert.equal(daySlot(d('2026-10-03T09:00:00Z'), 9), '2026-10-03T09:00:00.000Z');
});

test('the payout run is the most recent Friday 18:00Z', () => {
  assert.equal(currentRunAt(d('2026-10-02T18:00:30Z')).toISOString(), '2026-10-02T18:00:00.000Z'); // 2026-10-02 is a Friday
  assert.equal(currentRunAt(d('2026-10-02T17:59:59Z')).toISOString(), '2026-09-25T18:00:00.000Z');
  assert.equal(currentRunAt(d('2026-10-03T14:00:00Z')).toISOString(), '2026-10-02T18:00:00.000Z');
  assert.equal(currentRunAt(d('2026-10-09T18:00:00Z')).toISOString(), '2026-10-09T18:00:00.000Z');
});

test('sync cadence: hourly in the window, every 6 hours after it, never after 33 days or for removed posts', () => {
  const post = { posted_at: '2026-09-29T09:00:00Z', window_ends_at: '2026-10-02T09:00:00Z', status: 'live' as const };
  assert.equal(isDue(post, d('2026-10-01T17:13:00Z')), true, 'in the window: every hour');
  assert.equal(isDue(post, d('2026-10-02T10:00:00Z')), true, 'the hour after the window closes still takes the closing sample');
  assert.equal(isDue({ ...post, status: 'window_closed' }, d('2026-10-03T07:00:00Z')), false, 'after the window at 07:00 UTC');
  assert.equal(isDue({ ...post, status: 'window_closed' }, d('2026-10-03T12:00:00Z')), true, 'after the window at 12:00 UTC');
  assert.equal(isDue({ ...post, status: 'cleared' }, d('2026-11-05T00:00:00Z')), false, 'older than 33 days');
  assert.equal(isDue({ ...post, status: 'removed' }, d('2026-10-01T00:00:00Z')), false);
  assert.equal(isDue({ ...post, status: 'clawed_back' }, d('2026-10-01T00:00:00Z')), false);
});

test('snapshots: the first one, every 6 hours, and the last hour before the window ends', () => {
  const post = { posted_at: '2026-09-29T09:00:00Z', window_ends_at: '2026-10-02T09:00:00Z' };
  assert.equal(wantsSnapshot(post, null, d('2026-09-29T10:00:00Z')), true);
  assert.equal(wantsSnapshot(post, '2026-09-29T10:00:00Z', d('2026-09-29T15:00:00Z')), false);
  assert.equal(wantsSnapshot(post, '2026-09-29T10:00:00Z', d('2026-09-29T16:00:00Z')), true);
  assert.equal(wantsSnapshot(post, '2026-10-02T04:00:00Z', d('2026-10-02T08:30:00Z')), true, 'the closing snapshot just before the window ends');
  assert.equal(wantsSnapshot(post, '2026-10-02T04:00:00Z', d('2026-10-02T06:00:00Z')), false);
});

test('rights expiry alerts: one per threshold, the tightest crossed, catching up without a burst', () => {
  const ends = '2026-11-02T00:00:00Z';
  assert.equal(alertToSend(d('2026-09-20T00:00:00Z'), ends, []), null, 'more than 30 days left');
  assert.deepEqual(alertToSend(d('2026-10-04T00:00:00Z'), ends, []), { threshold: 30, daysLeft: 29, alertsSent: [30] });
  assert.equal(alertToSend(d('2026-10-05T00:00:00Z'), ends, [30]), null, 'nothing new at 28 days');
  assert.deepEqual(alertToSend(d('2026-10-20T00:00:00Z'), ends, [30]), { threshold: 14, daysLeft: 13, alertsSent: [30, 14] });
  assert.deepEqual(alertToSend(d('2026-10-27T12:00:00Z'), ends, [30]), { threshold: 7, daysLeft: 6, alertsSent: [30, 14, 7] }, 'a missed 14-day alert is skipped, not sent late');
  assert.equal(alertToSend(d('2026-10-27T12:00:00Z'), ends, [30, 14, 7]), null);
  assert.deepEqual(alertToSend(d('2026-10-04T00:00:00Z'), ends, [14]), { threshold: 30, daysLeft: 29, alertsSent: [30, 14] }, 'a later threshold already sent does not hide an earlier one');
});

test('outbound webhook retry policy', () => {
  assert.deepEqual([...RETRY_DELAYS_SECONDS], [60, 300, 1800, 7200, 21600, 86400]);
  assert.equal(nextRetryDelaySeconds(1), 60);
  assert.equal(nextRetryDelaySeconds(6), 86400);
  assert.equal(nextRetryDelaySeconds(7), null, 'the seventh failure is final');
  assert.equal(FAILING_AFTER, 20);
});

test('hourly series is zero-filled from the posting hour', () => {
  const rows = [{ ts: '2026-10-01T09:00:00Z', views: 100 }, { ts: '2026-10-01T11:00:00Z', views: 40 }, { ts: '2026-10-01T11:30:00Z', views: 10 }];
  assert.deepEqual(hourlySeries('2026-10-01T09:20:00Z', '2026-10-01T12:00:00Z', rows), [100, 0, 50, 0]);
});

test('curve shape: organic decay, stepped bought views, spike, flat', () => {
  const decay = Array.from({ length: 48 }, (_, h) => Math.round(2000 * Math.exp(-h / 14)) + 20);
  assert.equal(curveShape(decay), 'organic');
  assert.equal(curveShape([5, 5, 5, 6000, 6100, 4, 3, 4, 5, 3, 4, 5]), 'stepped');
  assert.equal(curveShape([9000, 8000, 7000, 10, 8, 9, 7, 6, 8, 7, 9, 8, 6, 7, 8]), 'spiky');
  assert.equal(curveShape(Array.from({ length: 48 }, () => 500)), 'flat');
  assert.equal(curveShape([1, 2]), 'organic', 'too short to judge');
});

test('the expected envelope scales to the post and brackets organic decay', () => {
  const decay = Array.from({ length: 24 }, (_, h) => Math.round(1000 * Math.exp(-h / 22)));
  const { expected_low, expected_high } = expectedEnvelope(decay);
  assert.equal(expected_low.length, 24);
  for (let h = 0; h < 24; h++) {
    assert.ok((expected_low[h] ?? 0) <= (decay[h] ?? 0) + 1 && (decay[h] ?? 0) <= (expected_high[h] ?? 0) + 1, `hour ${h}`);
  }
  assert.deepEqual(expectedEnvelope([0, 0, 0]), { expected_low: [0, 0, 0], expected_high: [0, 0, 0] });
});
