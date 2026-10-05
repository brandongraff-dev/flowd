/**
 * The public mutations of the demo. Every function returns `Promise<ActionResult<T>>` and never throws:
 *
 *   const r = await actions.approveSubmission({ submission_id });
 *   if (!r.ok) toast.error(r.error.message, { description: r.error.hint });   // plain English, always with what to do next
 *   else r.data.link_url ...
 *
 * An action is a pure function of the demo world (`core/*`): it runs against a copy-on-write transaction, writes the ledger, the Money Clock, the
 * notifications and the activity log together, and either commits as one new state or changes nothing. Money moves only through ledger transactions
 * that net to zero. Heavy tables an action reads (video analyses, view snapshots, metrics) are loaded first.
 *
 * The same functions run in the browser store (`actions`), in tests, and in the server-side mock API (`@/lib/store/server`).
 */

import type { StoreApi } from "zustand/vanilla";
import type { DocName, RowTableName } from "./tables";
import type { StoreState } from "./store";
import { ensureTables } from "./store";
import { fail, runAction, type ActionResult, type Tx } from "./core/tx";

import { addApp, autoApproveRun, claimAudit, connectIntegration, createApiKey, createList, createWebhook, disconnectIntegration, dryRunRule, addToList, changeMemberRole, inviteTeamMember, promoteWinner, removeFromList, removeMember, renewRights, resolveFatigue, respondToAd, revokeApiKey, revokeRights, runAudit, saveRule, setAdStatus, setRuleStatus, testIntegration, testWebhook, updateApp, updateBrandSettings } from "./core/brand-ops";
import { cancelBounty, createBounty, discardDraft, endBounty, extendBounty, featureBounty, fundBounty, pauseBounty, publishBounty, resumeBounty, topUpBounty, updateBounty } from "./core/bounties";
import { advanceClock, advanceClockTo, runPayoutRun } from "./core/clock";
import { claimDrop, completeLesson, connectSocialAccount, createCrew, disconnectSocialAccount, inviteToFlowd, joinCrew, joinTournament, leaveCrew, markAllNotificationsRead, markNotificationRead, saveRateCard, setPayoutMethod, setTaxSetAside, startLesson, submitTaxForm, toggleWellbeing, updateCreatorProfile, updateNotificationPrefs, updateWellbeing } from "./core/creator";
import { adjustBrandPlan, adminHoldBounty, adminReleaseBounty, nudgePayoutHold, overrideBriefLint, reassignBountyOwner, retryFailedPayout, setBrandStanding, setCreatorStanding, slaApproveIfClean, slaNudge } from "./core/admin-ops";
import { adminHoldPost, adminReleasePost, decideFraudFlag, decideScamReport, decideVerification, disputePost, overrideTier, replyToDispute, reportScam, requestDisputeEvidence, resolveDispute, startDisputeReview, submitVerification, withdrawDispute } from "./core/admin";
import { markThreadRead, rateFloSuggestion, saveFloSuggestion, sendThreadMessage, startThread } from "./core/inbox";
import { acceptOffer, counterOffer, declineOffer, sendOffer, sendOfferMessage, withdrawOffer } from "./core/offers";
import { updateOnboarding } from "./core/onboarding";
import { requestPayout } from "./core/payouts";
import { attachPost, fixCaption, removePost, waiveCompliance } from "./core/posts";
import { applyFoundingCreator, joinWaitlist, recordLinkClick, recordProofView, revokeProof, shareProof } from "./core/public";
import { addFeedbackNote, approveSubmission, rejectSubmission, requestChanges, resolveNote } from "./core/review";
import { switchWorkspace } from "./core/session";
import { appealRejection, claimBounty, reviseSubmission, saveBounty, submitVideo, withdrawSubmission } from "./core/submissions";
import { archiveTestPlan, assignTestPlan, createTestPlan, updateTestPlan } from "./core/test-plans";
import { changeBrandPlan, fundWallet, recordExport, recordInvoiceDownload, setPaymentMethod, updateInvoice } from "./core/wallet";
import { cancelAuction, createAuction, licenseSpec, placeBid, uploadSpec, withdrawBid, withdrawSpec } from "./core/marketplace";

/** Actions a signed-out visitor may call: the waitlist, the founding application, tracking-link clicks, proof-page views and the free audit. Everything else needs a persona. */
const PUBLIC_ACTIONS: ReadonlySet<unknown> = new Set<unknown>([joinWaitlist, applyFoundingCreator, recordLinkClick, recordProofView, runAudit]);
const isPublicAction = (fn: unknown): boolean => PUBLIC_ACTIONS.has(fn);

/** What an action host provides: a store to run against, and a promise that says the store may be used. */
export interface ActionHost {
  store: StoreApi<StoreState>;
  /** Resolves when the store holds the core world (boot finished). Tests resolve at once. */
  ready(): Promise<void>;
}

type TableName = RowTableName | DocName;

/** Heavy tables some actions read or write. */
const ANALYSES: readonly TableName[] = ["video_analyses"];
const AUDITS: readonly TableName[] = ["compliance_checks"];
const SNAPSHOTS: readonly TableName[] = ["view_snapshots"];
/** Everything the clock touches: metrics, conversions, snapshots, audits (settlement holds) and analyses (released videos become specs). */
const CLOCK: readonly TableName[] = ["conversions", "post_metrics_daily", "app_metrics_daily", "view_snapshots", "compliance_checks", "video_analyses"];

/** Runs one action against the host's store and commits the result. */
export async function runOnHost<A extends unknown[], O>(host: ActionHost, fn: (tx: Tx, ...args: A) => O, args: A, needs: readonly TableName[] = []): Promise<ActionResult<O>> {
  try {
    await host.ready();
    if (host.store.getState().status !== "ready") return fail("not_ready", "The demo data is still loading.", "Try again in a moment.", 503);
    // A signed-out visitor can only use the public actions. Judged first, so a stranger learns nothing about what exists.
    if (!isPublicAction(fn) && host.store.getState().session.persona === null) return fail("unauthenticated", "Sign in to do that.", "Pick a demo persona on the login page.", 401);
    if (needs.length > 0) await ensureTables(host.store, needs);
  } catch {
    return fail("load_failed", "The demo data could not be loaded.", "Reload the page. If it keeps happening, reset the demo from the account menu.", 500);
  }
  const before = host.store.getState();
  const { state, result } = runAction<undefined, O>(before, (tx) => fn(tx, ...args), undefined);
  if (state !== before) host.store.setState({ ...(state as StoreState), revision: before.revision + 1 }, true);
  return result;
}

/** Every action of the demo, bound to a host. The app uses `actions` (bound to the browser store); tests and the server make their own. */
export function createActions(host: ActionHost) {
  const bind =
    <A extends unknown[], O>(fn: (tx: Tx, ...args: A) => O, needs: readonly TableName[] = []) =>
    (...args: A): Promise<ActionResult<O>> =>
      runOnHost(host, fn, args, needs);

  return {
    // ── brand: bounties ───────────────────────────────────────────────────────────────────────
    /** Saves a draft bounty (linted and priced; nothing is charged). */
    createBounty: bind(createBounty),
    updateBounty: bind(updateBounty),
    discardBountyDraft: bind(discardDraft),
    /** Publishes a draft: Brief Lint blockers stop it (`brief_lint_blockers`); then funds the escrow from the wallet and goes live (Funded badge). */
    publishBounty: bind(publishBounty),
    fundBounty: bind(fundBounty),
    topUpBounty: bind(topUpBounty),
    pauseBounty: bind(pauseBounty),
    resumeBounty: bind(resumeBounty),
    extendBounty: bind(extendBounty),
    endBounty: bind(endBounty),
    cancelBounty: bind(cancelBounty),
    featureBounty: bind(featureBounty),

    // ── brand: wallet and billing ─────────────────────────────────────────────────────────────
    fundWallet: bind(fundWallet),
    changeBrandPlan: bind(changeBrandPlan),
    setPaymentMethod: bind(setPaymentMethod),
    updateInvoice: bind(updateInvoice),
    recordExport: bind(recordExport),
    recordInvoiceDownload: bind(recordInvoiceDownload),
    updateBrandSettings: bind(updateBrandSettings),
    switchWorkspace: bind(switchWorkspace),

    // ── brand: review ─────────────────────────────────────────────────────────────────────────
    approveSubmission: bind(approveSubmission),
    /** Timecoded notes (at least one must-fix); two rounds are included, later rounds are paid by the brand. */
    requestRevision: bind(requestChanges),
    /** A reason code and evidence are mandatory (`reason_required`, `evidence_required`). */
    rejectSubmission: bind(rejectSubmission),
    addFeedbackNote: bind(addFeedbackNote),
    resolveNote: bind(resolveNote),
    saveRule: bind(saveRule, ANALYSES),
    dryRunRule: bind(dryRunRule, ANALYSES),
    setRuleStatus: bind(setRuleStatus),
    autoApproveRun: bind(autoApproveRun, ANALYSES),
    waiveCompliance: bind(waiveCompliance, AUDITS),

    // ── brand: growth and rights ──────────────────────────────────────────────────────────────
    createTestPlan: bind(createTestPlan),
    updateTestPlan: bind(updateTestPlan),
    assignTestPlan: bind(assignTestPlan),
    archiveTestPlan: bind(archiveTestPlan),
    promoteWinner: bind(promoteWinner),
    respondToAd: bind(respondToAd),
    setAdStatus: bind(setAdStatus),
    resolveFatigue: bind(resolveFatigue),
    renewRights: bind(renewRights),
    revokeRights: bind(revokeRights),

    // ── brand: market, offers, setup ──────────────────────────────────────────────────────────
    addToList: bind(addToList),
    removeFromList: bind(removeFromList),
    createList: bind(createList),
    sendOffer: bind(sendOffer),
    counterOffer: bind(counterOffer),
    sendOfferMessage: bind(sendOfferMessage),
    acceptOffer: bind(acceptOffer),
    declineOffer: bind(declineOffer),
    withdrawOffer: bind(withdrawOffer),
    placeBid: bind(placeBid),
    withdrawBid: bind(withdrawBid),
    licenseSpec: bind(licenseSpec),
    addApp: bind(addApp),
    updateApp: bind(updateApp),
    connectIntegration: bind(connectIntegration),
    disconnectIntegration: bind(disconnectIntegration),
    testIntegration: bind(testIntegration),
    createApiKey: bind(createApiKey),
    revokeApiKey: bind(revokeApiKey),
    createWebhook: bind(createWebhook),
    testWebhook: bind(testWebhook),
    inviteTeamMember: bind(inviteTeamMember),
    changeMemberRole: bind(changeMemberRole),
    removeMember: bind(removeMember),
    claimAudit: bind(claimAudit),

    // ── creator: the money path ───────────────────────────────────────────────────────────────
    updateOnboarding: bind(updateOnboarding),
    saveBounty: bind(saveBounty),
    claimBounty: bind(claimBounty),
    /** Takes a Reserved Slot from the pool, runs QA and the checklist scores, then enters review (or auto-approve). */
    submitVideo: bind(submitVideo, ANALYSES),
    reviseSubmission: bind(reviseSubmission, ANALYSES),
    withdrawSubmission: bind(withdrawSubmission),
    appealRejection: bind(appealRejection),
    attachPost: bind(attachPost, [...ANALYSES, ...AUDITS]),
    removePost: bind(removePost),
    fixCaption: bind(fixCaption, AUDITS),
    disputePost: bind(disputePost, SNAPSHOTS),
    withdrawDispute: bind(withdrawDispute),
    /** Instant cash-out: the fee is quoted first; pass `confirm_fee_cents` to refuse a surprise. */
    requestPayout: bind(requestPayout),
    setPayoutMethod: bind(setPayoutMethod),
    submitTaxForm: bind(submitTaxForm),
    setTaxSetAside: bind(setTaxSetAside),
    submitVerification: bind(submitVerification),
    connectSocialAccount: bind(connectSocialAccount),
    disconnectSocialAccount: bind(disconnectSocialAccount),
    updateCreatorProfile: bind(updateCreatorProfile),
    shareProof: bind(shareProof),
    revokeProof: bind(revokeProof),

    // ── creator: growth, social, safety ───────────────────────────────────────────────────────
    saveRateCard: bind(saveRateCard),
    claimDrop: bind(claimDrop),
    joinTournament: bind(joinTournament),
    startLesson: bind(startLesson),
    completeLesson: bind(completeLesson),
    createCrew: bind(createCrew),
    joinCrew: bind(joinCrew),
    leaveCrew: bind(leaveCrew),
    inviteToFlowd: bind(inviteToFlowd),
    toggleWellbeing: bind(toggleWellbeing),
    updateWellbeing: bind(updateWellbeing),
    createAuction: bind(createAuction),
    cancelAuction: bind(cancelAuction),
    uploadSpec: bind(uploadSpec),
    withdrawSpec: bind(withdrawSpec),
    reportScam: bind(reportScam),
    saveFloSuggestion: bind(saveFloSuggestion),
    rateFloSuggestion: bind(rateFloSuggestion),

    // ── everyone ──────────────────────────────────────────────────────────────────────────────
    markNotificationRead: bind(markNotificationRead),
    markAllNotificationsRead: bind(markAllNotificationsRead),
    updateNotificationPrefs: bind(updateNotificationPrefs),
    sendThreadMessage: bind(sendThreadMessage),
    startThread: bind(startThread),
    markThreadRead: bind(markThreadRead),
    replyToDispute: bind(replyToDispute),
    runAudit: bind(runAudit),

    // ── public pages ──────────────────────────────────────────────────────────────────────────
    joinWaitlist: bind(joinWaitlist),
    applyFoundingCreator: bind(applyFoundingCreator),
    recordLinkClick: bind(recordLinkClick),
    recordProofView: bind(recordProofView),

    // ── admin (Ops) ───────────────────────────────────────────────────────────────────────────
    decideFraudFlag: bind(decideFraudFlag),
    adminHoldPost: bind(adminHoldPost),
    adminReleasePost: bind(adminReleasePost),
    requestDisputeEvidence: bind(requestDisputeEvidence),
    startDisputeReview: bind(startDisputeReview),
    resolveDispute: bind(resolveDispute),
    decideVerification: bind(decideVerification),
    decideScamReport: bind(decideScamReport),
    overrideTier: bind(overrideTier),
    nudgePayoutHold: bind(nudgePayoutHold),
    retryFailedPayout: bind(retryFailedPayout),
    adminHoldBounty: bind(adminHoldBounty),
    adminReleaseBounty: bind(adminReleaseBounty),
    overrideBriefLint: bind(overrideBriefLint),
    setCreatorStanding: bind(setCreatorStanding),
    setBrandStanding: bind(setBrandStanding),
    adjustBrandPlan: bind(adjustBrandPlan),
    slaNudge: bind(slaNudge),
    slaApproveIfClean: bind(slaApproveIfClean),
    reassignBountyOwner: bind(reassignBountyOwner),
    /** Moves the demo clock forward and runs every scheduled job on the way (window closes, clearing, the Friday run, SLA timeouts). */
    advanceClock: bind(advanceClock, CLOCK),
    advanceClockTo: bind(advanceClockTo, CLOCK),
    /** Moves the clock to the next Friday 18:00 UTC and pays the weekly run (cleared money is paid free; holds stay held). */
    runPayoutRun: bind(runPayoutRun, CLOCK),
  };
}

export type Actions = ReturnType<typeof createActions>;
export type ActionName = keyof Actions;
