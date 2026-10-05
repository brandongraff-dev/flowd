/**
 * The First-Dollar Path wizard (`/onboarding/creator`): niches, linked accounts, 18+ and the creator agreement. Verification and the tax form are just
 * in time, at the first approval, so they are not part of this step. Progress is saved after every step, so the wizard is resumable.
 */

import type { Creator, Niche } from "@/lib/contract/types";
import { clearedFromLedger, ONBOARDING_STAGES, onboardingStageFor } from "./creator-stats";
import { requireCreator } from "./guards";
import { ensure, type Tx } from "./tx";

export interface OnboardingInput {
  /** 1 to 3 niches. */
  niches?: Niche[];
  /** The creator confirms they are 18 or older. */
  confirm_18?: boolean;
  /** The creator accepts the creator agreement. Needs `confirm_18`. */
  accept_agreement?: boolean;
}

export interface OnboardingResult {
  creator: Creator;
  /** What is done and what is next, for the progress bar ("First dollar in 72 hours"). */
  steps: { id: "niches" | "accounts" | "agreement"; done: boolean }[];
}

/** Saves one or more onboarding steps and moves the stage forward (never back). */
export function updateOnboarding(tx: Tx, input: OnboardingInput): OnboardingResult {
  const { creator } = requireCreator(tx);
  if (input.niches) {
    ensure(input.niches.length >= 1 && input.niches.length <= 3, "niches_invalid", "Pick 1 to 3 niches so the feed can match you.", undefined, 422);
    tx.patch("creators", creator.id, { niches: [...new Set(input.niches)] });
  }
  if (input.accept_agreement) {
    ensure(input.confirm_18 === true || tx.get("users", creator.user_id)?.age_verified === true, "age_required", "flowd creators are 18 or older. Confirm your age to continue.", undefined, 422);
    tx.patch("users", creator.user_id, { age_verified: true });
  } else if (input.confirm_18) {
    tx.patch("users", creator.user_id, { age_verified: true });
  }
  const fresh = tx.must("creators", creator.id);
  const linked = tx.all("social_accounts").some((a) => a.creator_id === creator.id && a.status === "connected");
  let stage = fresh.onboarding_stage;
  const rank = (s: Creator["onboarding_stage"]): number => ONBOARDING_STAGES.indexOf(s);
  const lift = (to: Creator["onboarding_stage"]): void => {
    if (rank(to) > rank(stage)) stage = to;
  };
  if (input.niches || fresh.niches.length > 0) lift("niches_picked");
  if (linked) lift("accounts_linked");
  stage = onboardingStageFor({ onboarding_stage: stage, verification_status: fresh.verification_status }, { submissions: tx.all("submissions").filter((s) => s.creator_id === creator.id).length, approved: fresh.approved_count, cleared_cents: clearedFromLedger(tx, creator.id) });
  const next = stage === fresh.onboarding_stage ? fresh : tx.patch("creators", creator.id, { onboarding_stage: stage });
  const user = tx.get("users", creator.user_id);
  return {
    creator: next,
    steps: [
      { id: "niches", done: next.niches.length > 0 && rank(next.onboarding_stage) >= rank("niches_picked") },
      { id: "accounts", done: linked },
      { id: "agreement", done: user?.age_verified === true },
    ],
  };
}
