// When is a post due for a sample, and when does a sample become a View Ledger snapshot? Pure functions (tests/schedule.test.ts).
//
//   in the window (and the hour after it, for the closing sample): every hour
//   up to 33 days after posting (3 days window + 30 days of CPA conversions): every 6 hours (UTC hours 0, 6, 12, 18)
//   removed or clawed-back posts: never
//   snapshots: when none exists, every 6 hours, and once more in the last hour before the window ends

import type { PostRow } from '../_shared/db.ts';

export const SNAPSHOT_EVERY_HOURS = 6;
export const FOLLOW_DAYS = 30;

export function isDue(post: Pick<PostRow, 'posted_at' | 'window_ends_at' | 'status'>, now: Date): boolean {
  if (post.status === 'removed' || post.status === 'clawed_back') return false;
  if (now.getTime() <= Date.parse(post.window_ends_at) + 3_600_000) return true;
  const ageDays = (now.getTime() - Date.parse(post.posted_at)) / 86_400_000;
  if (ageDays > 3 + FOLLOW_DAYS) return false;
  return now.getUTCHours() % SNAPSHOT_EVERY_HOURS === 0;
}

export function wantsSnapshot(post: Pick<PostRow, 'posted_at' | 'window_ends_at'>, lastSnapshotAt: string | null, now: Date): boolean {
  if (!lastSnapshotAt) return true;
  const sinceHours = (now.getTime() - Date.parse(lastSnapshotAt)) / 3_600_000;
  const windowEndsInMs = Date.parse(post.window_ends_at) - now.getTime();
  return sinceHours >= SNAPSHOT_EVERY_HOURS || (windowEndsInMs > 0 && windowEndsInMs <= 3_600_000);
}
