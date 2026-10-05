/**
 * Creator referrals, kept honest on the ledger. A creator earns 5% of a referee's cleared earnings for 90 days after the referee's first dollar, capped
 * at $100 per referee. The reward is paid by flowd from its promo treasury (ledger type `referral`); the referee's own earnings are never touched and
 * the referee is never charged. Single level, no chance-based rewards.
 */

import type { Referral } from "@/lib/contract/types";
import { CONSTANTS, addDays, formatMoney, mulRate, referralStatus, toMs } from "@/lib/engine";
import { addPlatformEarning } from "./earnings";
import { notifyCreator } from "./notify";
import type { Tx } from "./tx";

/** Earning types a referee gets from brands (the only ones a referral reward is computed on; platform-funded rows would loop). */
const REWARDABLE = new Set(["cpm", "cpa", "flat_fee", "commission", "rights_fee"]);

/**
 * Pays the referrer(s) of a creator whose earnings just cleared at `runAt`: 5% of what cleared in this run, inside the 90-day window and under the
 * $100 cap. Updates each referral's status (joined, first_dollar, earning, complete) from its dates. Returns the reward paid in cents.
 */
export function applyReferralRewards(tx: Tx, refereeId: string, runAt: string): number {
  const referee = tx.get("creators", refereeId);
  if (!referee) return 0;
  const referrals = tx.all("referrals").filter((r) => r.kind === "creator" && r.referee_creator_id === refereeId && r.referrer_creator_id && r.joined_at);
  if (referrals.length === 0) return 0;
  const clearedNow = tx
    .all("ledger")
    .filter((e) => e.account === `creator:${refereeId}` && e.amount_cents > 0 && REWARDABLE.has(e.entry_type) && e.cleared_at === runAt)
    .reduce((sum, e) => sum + e.amount_cents, 0);
  let paid = 0;
  for (const ref of referrals) {
    const firstDollar = ref.first_dollar_at ?? referee.first_dollar_at;
    if (!firstDollar) continue;
    const windowEnds = ref.reward_window_ends_at ?? addDays(firstDollar, CONSTANTS.referrals.creator_share_days);
    let reward = 0;
    if (clearedNow > 0 && toMs(runAt) >= toMs(firstDollar) && toMs(runAt) <= toMs(windowEnds)) {
      reward = Math.max(0, Math.min(mulRate(clearedNow, ref.reward_rate), ref.reward_cap_cents - ref.reward_earned_cents));
    }
    if (reward > 0 && ref.referrer_creator_id) {
      addPlatformEarning(tx, {
        creator_id: ref.referrer_creator_id,
        type: "referral",
        amount_cents: reward,
        memo: `Referral reward: ${Math.round(ref.reward_rate * 100)}% of @${referee.handle}'s cleared earnings`,
        label: `Referral reward: @${referee.handle}`,
      });
      notifyCreator(tx, ref.referrer_creator_id, {
        kind: "cash_event",
        title: `Referral reward +${formatMoney(reward)}`,
        body: `@${referee.handle}'s earnings cleared. Funded by flowd: nobody you invited is ever charged.`,
        amount_cents: reward,
        path: "referrals",
        ref_kind: "referral",
        ref_id: ref.id,
      });
      paid += reward;
    }
    const earned = ref.reward_earned_cents + reward;
    const status = referralStatus({ invited_at: ref.invited_at, joined_at: ref.joined_at, first_dollar_at: firstDollar, reward_window_ends_at: windowEnds, reward_earned_cents: earned, now: runAt });
    const next: Referral = { ...ref, first_dollar_at: firstDollar, reward_window_ends_at: windowEnds, reward_earned_cents: earned, status, updated_at: tx.now };
    if (next.status !== ref.status || earned !== ref.reward_earned_cents || ref.first_dollar_at === undefined) tx.put("referrals", next);
  }
  return paid;
}
