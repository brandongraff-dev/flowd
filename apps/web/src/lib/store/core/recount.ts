/**
 * Denormalised counters, recomputed from the rows they summarise (never incremented), so they cannot drift (DOMAIN M-03).
 */

import type { Bounty, BountyCounts, FunnelCounts } from "@/lib/contract/types";
import { emptyFunnel, sumFunnels } from "@/lib/engine";
import type { Tx } from "./tx";

/** Recomputes a bounty's `counts` and lifetime `funnel` from its submissions and posts. */
export function recountBounty(tx: Tx, bountyId: string): Bounty {
  const subs = tx.all("submissions").filter((s) => s.bounty_id === bountyId);
  const posts = tx.all("posts").filter((p) => p.bounty_id === bountyId);
  const counts: BountyCounts = {
    creators: new Set(subs.map((s) => s.creator_id)).size,
    submissions: subs.length,
    in_review: subs.filter((s) => s.status === "in_review").length,
    approved: subs.filter((s) => s.status === "approved" || s.status === "posted" || s.status === "released").length,
    rejected: subs.filter((s) => s.status === "rejected").length,
    posts: posts.length,
    live_posts: posts.filter((p) => p.status === "live").length,
  };
  const funnel: FunnelCounts = posts.length > 0 ? sumFunnels(posts.map((p) => p.funnel)) : emptyFunnel();
  const first = subs.map((s) => s.submitted_at).sort()[0];
  const b = tx.must("bounties", bountyId, "Bounty");
  return tx.patch("bounties", bountyId, { counts, funnel, ...(first && !b.first_submission_at ? { first_submission_at: first } : {}), updated_at: tx.now });
}
