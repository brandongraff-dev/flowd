/**
 * Post-level compliance: re-running the audit when a creator fixes a caption, and lifting the settlement hold when the failure is gone.
 */

import type { ComplianceAudit, ComplianceCheckItem, ComplianceResult } from "@/lib/contract/types";
import { checkCaptionDisclosure } from "@/lib/engine";
import { releasePostHold } from "./holds";
import type { Tx } from "./tx";

/** Re-checks the caption disclosure and the tracking link in the caption, recomputes the overall result and, when a blocking failure is fixed, releases the post. */
export function auditPostComplianceCaption(tx: Tx, postId: string, caption: string): ComplianceAudit {
  const post = tx.must("posts", postId, "Post");
  const audit = tx.all("compliance_checks").find((c) => c.post_id === postId);
  const app = tx.must("apps", post.app_id);
  const link = tx.get("attribution_links", post.tracking_link_id);
  if (!audit) throw new Error(`No compliance audit for ${postId}`);
  const checks: ComplianceCheckItem[] = audit.checks.map((c) => {
    if (c.type === "caption_disclosure") return checkCaptionDisclosure(caption, app.name);
    if (c.type === "tracking_link" && link) {
      const has = caption.toLowerCase().includes(link.short_url.toLowerCase().replace(/^https?:\/\//, "")) || caption.toLowerCase().includes(link.code.toLowerCase());
      return has ? { type: "tracking_link", result: "pass", message: "The tracking link is in the caption.", blocks_settlement: false } : c;
    }
    return c;
  });
  const overall: ComplianceResult = checks.some((c) => c.result === "fail") ? "fail" : checks.some((c) => c.result === "warn") ? "warn" : checks.some((c) => c.result === "pending") ? "pending" : "pass";
  const blocks = checks.some((c) => c.blocks_settlement);
  const next = tx.patch("compliance_checks", audit.id, { checks, overall, blocks_settlement: blocks, checked_at: tx.now, ...(audit.blocks_settlement && !blocks ? { fixed_at: tx.now } : {}) });
  if (audit.blocks_settlement && !blocks && post.status === "held" && post.hold_reason === "compliance_fail") releasePostHold(tx, postId);
  return next;
}
