import type { Verification, VerificationReason, VerificationStatus } from "@/lib/contract/types";
import { defineSelector, valuesOf, type Db } from "@/lib/data/select";

export type VerifySubject = "creator" | "brand";

export interface MyVerification {
  /** Who is looking: a creator (identity and age) or a brand member (business). `null` when nobody the check applies to is signed in. */
  subject: VerifySubject | null;
  /** The state to show: the newest check if there is one, else what the profile says. */
  status: VerificationStatus;
  /** The newest check of the right kind (reason, decide-by time). */
  latest?: Verification;
  reason?: VerificationReason;
}

type VerifyDb = Db<"verifications" | "session" | "creators" | "brands">;

/** The signed-in creator's identity check, or the signed-in brand's business check, with the state `/verify` shows. */
export const selectMyVerification = defineSelector(["verifications", "session", "creators", "brands"] as const, (db: VerifyDb): MyVerification => {
  const { persona, creator_id, brand_id } = db.session;
  const subject: VerifySubject | null = persona === "creator" ? "creator" : persona === "brand" ? "brand" : null;
  if (!subject) return { subject: null, status: "not_started" };
  const rows = valuesOf(db.verifications)
    .filter((v) => (subject === "creator" ? v.creator_id === creator_id && (v.kind === "identity" || v.kind === "age") : v.brand_id === brand_id && v.kind === "business"))
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : a.submitted_at > b.submitted_at ? -1 : 0));
  const latest = rows[0];
  const profile: VerificationStatus = subject === "creator" ? (db.creators[creator_id ?? ""]?.verification_status ?? "not_started") : (db.brands[brand_id ?? ""]?.verification ?? "not_started");
  // A verified profile wins over an older failed attempt; otherwise the newest attempt is the truth.
  const status: VerificationStatus = profile === "verified" ? "verified" : (latest?.status ?? profile);
  return { subject, status, ...(latest ? { latest } : {}), ...(latest?.reason ? { reason: latest.reason } : {}) };
});
