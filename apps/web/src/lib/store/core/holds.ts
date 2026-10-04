/**
 * Holds on a post's money: a fraud review, a dispute, a failed disclosure or an Ops hold. Only the affected post's earnings are held; undisputed money
 * on other posts keeps moving. Every hold names its reason and the next step (never a bare "held").
 */

import type { HoldReason, MoneyClockRow, Post } from "@/lib/contract/types";
import { HOLD_TO_REASON, nextClearingRun, postClearingRun, reasonText, toMs } from "@/lib/engine";
import { clearPostEarnings, holdNextStep, scheduleWeekly } from "./earnings";
import type { Tx } from "./tx";

const SETTLED_TYPES = new Set(["cpm", "flat_fee", "cpa"]);

/** The creator's earning ledger rows on a post that a hold may freeze (not yet in a payout). */
function holdableRows(tx: Tx, post: Post) {
  return tx.all("ledger").filter((e) => e.post_id === post.id && e.account === `creator:${post.creator_id}` && SETTLED_TYPES.has(e.entry_type) && (e.status === "pending" || e.status === "cleared") && !e.payout_id);
}

/** Puts a post's money on hold with a named reason. The post's ledger rows and Money Clock rows are held with it. */
export function holdPost(tx: Tx, postId: string, reason: HoldReason): Post {
  const post = tx.must("posts", postId, "Post");
  if (post.status === "paid" || post.status === "removed" || post.status === "clawed_back") return post;
  for (const e of holdableRows(tx, post)) tx.put("ledger", { ...e, status: "held" });
  for (const m of tx.all("money_clock")) {
    if (m.post_id !== postId || (m.state !== "pending" && m.state !== "cleared" && m.state !== "accruing")) continue;
    const next: MoneyClockRow = { ...m, state: "held", reason: HOLD_TO_REASON[reason], reason_text: holdNextStep(reason) };
    delete (next as Partial<MoneyClockRow>).eta_at;
    tx.put("money_clock", next);
  }
  const held = tx.patch("posts", postId, { status: post.status === "live" ? "live" : "held", hold_reason: reason });
  scheduleWeekly(tx, post.creator_id);
  return held;
}

/**
 * Releases a hold: the ledger rows go back to pending (or cleared, when the clearing run has already passed), the Money Clock row gets a dated ETA
 * again, and the creator's weekly payout is rebuilt. Returns the post.
 */
export function releasePostHold(tx: Tx, postId: string): Post {
  const post = tx.must("posts", postId, "Post");
  if (post.status !== "held" && post.hold_reason === undefined) return post;
  const run = postClearingRun(post.window_ends_at);
  const runPassed = toMs(run) <= toMs(tx.now);
  for (const e of tx.all("ledger")) {
    if (e.post_id !== postId || e.account !== `creator:${post.creator_id}` || e.status !== "held") continue;
    tx.put("ledger", { ...e, status: "pending" });
  }
  const eta = runPassed ? nextClearingRun(tx.now) : run;
  for (const m of tx.all("money_clock")) {
    if (m.post_id !== postId || m.state !== "held") continue;
    const next: MoneyClockRow = { ...m, state: "pending", reason: "awaiting_clearing_run", eta_at: eta, reason_text: "" };
    next.reason_text = reasonText({ reason: next.reason, eta_at: eta });
    tx.put("money_clock", next);
  }
  tx.patch("posts", postId, { status: "window_closed" });
  tx.unset("posts", postId, "hold_reason");
  if (runPassed) clearPostEarnings(tx, postId, tx.now);
  scheduleWeekly(tx, post.creator_id);
  return tx.must("posts", postId);
}
