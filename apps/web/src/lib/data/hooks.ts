"use client";

/**
 * Every data hook the pages use. One hook per selector in `./selectors`, same name without the `select` prefix:
 *
 *   const bounties = useBounties({ status: "live", q: "photo" });   // BountyView[]
 *   const bounty = useBounty(id);                                    // BountyView | undefined
 *
 * Rules every hook follows:
 *   - Arguments are plain JSON (ids, filters). Pass them inline: they are compared by value, not by identity.
 *   - The result is memoised and keeps its identity until a table the selector reads changes: safe in dependency arrays and `React.memo` props.
 *   - Before the demo world is loaded a hook returns the empty world (empty lists, `undefined`, zeroed totals). Gate skeletons on
 *     `useStoreReady()`; after that an empty list is a real empty state.
 *   - "mine" is implicit: a brand persona sees its own workspace and a creator sees their own rows when no id is passed.
 *   - Hooks only read. Every change goes through `actions` (`@/lib/store/app`), which returns an `ActionResult` and never throws.
 */

import { useDemoStore, useSelect } from "./use-store";
import type { Selector } from "./select";
import type { StateKey } from "@/lib/store/state";
import { useShallow } from "zustand/react/shallow";
import type { StoreState } from "@/lib/store/store";

import {
  selectAdminAudit,
  selectAdminMetrics,
  selectAcademy,
  selectAgency,
  selectApp,
  selectApps,
  selectAttributionKit,
  selectAudit,
  selectAudits,
  selectAuction,
  selectAuctions,
  selectBountyCounts,
  selectBountyDetail,
  selectBountyForCreator,
  selectBountyPreview,
  selectBountyRegistry,
  selectBounties,
  selectBounty,
  selectBrandOverview,
  selectBrandRegistry,
  selectBrandScorecard,
  selectBrandScorecards,
  selectBrandSettings,
  selectBrandWallet,
  selectBudgetPlanner,
  selectCanUseTestPlanner,
  selectCaseStudies,
  selectChangelog,
  selectComplianceLog,
  selectCreatorDirectory,
  selectCreatorHome,
  selectCreatorProfile,
  selectCreatorRegistry,
  selectCreatorWallet,
  selectCrews,
  selectDemoClock,
  selectDeveloper,
  selectDispute,
  selectDisputes,
  selectDrop,
  selectDrops,
  selectEarningsCalculator,
  selectEscrowProof,
  selectFeed,
  selectFormat,
  selectFoundingSpots,
  selectFraudCase,
  selectFraudQueue,
  selectFunnel,
  selectHookLibrary,
  selectInbox,
  selectInstantPreview,
  selectIntegrations,
  selectInvoice,
  selectLeaderboard,
  selectLedger,
  selectLesson,
  selectLibrary,
  selectLibraryCompare,
  selectLists,
  selectMarket,
  selectMarketOverview,
  selectMe,
  selectMedianEarnings,
  selectMlModels,
  selectMoneyClock,
  selectMyRights,
  selectNotifications,
  selectOffer,
  selectOffers,
  selectOnboarding,
  selectPayout,
  selectPayoutOps,
  selectPayouts,
  selectPost,
  selectPostLedger,
  selectPosts,
  selectPriceSuggestion,
  selectPromise,
  selectPromotions,
  selectProof,
  selectPublicBounty,
  selectPublicCreator,
  selectRateCard,
  selectRebuyCandidates,
  selectReferrals,
  selectRemix,
  selectRenewalQuote,
  selectReviewQueue,
  selectRightsCard,
  selectRightsVault,
  selectRule,
  selectRules,
  selectSafety,
  selectSafetyQueue,
  selectSavedBounties,
  selectSearchIndex,
  selectSlaDesk,
  selectSpec,
  selectSpecs,
  selectStarterBounties,
  selectStateOfAppUgc,
  selectStreak,
  selectSubmission,
  selectSubmissionAnalysis,
  selectSubmissions,
  selectSubmissionsForBounty,
  selectTaxDesk,
  selectTeam,
  selectTemplates,
  selectTestPlan,
  selectTestPlans,
  selectTestimonials,
  selectThread,
  selectTicker,
  selectTiers,
  selectTournament,
  selectTournaments,
  selectTrackingLanding,
  selectTrends,
  selectTrustMetrics,
  selectVerificationQueue,
  selectWaitlist,
  selectWalletChip,
  selectWellbeing,
  selectWrapped,
  selectActivityLog,
} from "./selectors";

/** Turns a selector into a hook. The inner function is named `use...` so the hooks lint rules apply to it. */
function hookOf<K extends StateKey, A, R>(selector: Selector<K, A, R>): (arg?: A) => R {
  return function useSelected(arg?: A): R {
    return useSelect(selector, arg);
  };
}

// ── session and identity ───────────────────────────────────────────────────────────────────────

/** Who is signed in (persona, user, creator, brand workspace, member and role, active app, app and workspace switchers). Safe before the store is ready. */
export const useMe = hookOf(selectMe);

/**
 * The demo store's session slice: persona and the current ids (user, creator, brand, app, member). Cheap; use `useMe` when you need the rows.
 * Not `useSession` from `@/lib/session`, which is the sign-in cookie (`signIn`, `signOut`); the store follows the cookie.
 */
export function useDemoSession(): StoreState["session"] {
  return useDemoStore(useShallow((s: StoreState) => s.session));
}

/** The current persona: "brand", "creator", "admin" or null (signed out). */
export function usePersona(): StoreState["session"]["persona"] {
  return useDemoStore((s) => s.session.persona);
}

// ── bounties ───────────────────────────────────────────────────────────────────────────────────

/** `useBounties({ brand: "mine", status: "live" | "open" | "active" | "closed" | BountyStatus, app, type, visibility, funded, category, featured, q, sort, limit })`: bounty rows with app, brand, scorecard, fill and spots joined. */
export const useBounties = hookOf(selectBounties);
/** One bounty row by id. */
export const useBounty = hookOf(selectBounty);
/** Counts for the bounty tabs (draft, live, paused, filled, ended...), for a brand or everyone. */
export const useBountyCounts = hookOf(selectBountyCounts);
/** The live preview of a bounty being built: pay math, fee ladder, brief lint blockers, price suggestion and what it will cost. Null with no draft. */
export const useBountyPreview = hookOf(selectBountyPreview);
/** The brand's bounty page: the `bounty` row, `money` (the escrow identity), `submissions`, `posts`, `settlement`, `creators`, `clawbacks`, `funnel`, `cost` and `review`. */
export const useBountyDetail = hookOf(selectBountyDetail);
/** A bounty as the signed-in creator sees it: match score, expected pay, what blocks submitting (in words), their submissions and saved state. */
export const useBountyForCreator = hookOf(selectBountyForCreator);
/** `useFeed({ structure, platform, category, saved, hide_locked, funded_only, q, sort: "match" | "pay" | "new" | "ending" | "spots", limit })`: the creator feed, ranked, with match reasons, locks and tier head starts. */
export const useFeed = hookOf(selectFeed);
/** The funded starter bounties for new creators (flat $5, decision within 24 hours). */
export const useStarterBounties = hookOf(selectStarterBounties);
/** The creator's saved and joined bounties, newest first. */
export const useSavedBounties = hookOf(selectSavedBounties);
/** A bounty on its public page `/b/[id]`; undefined for drafts and unfunded bounties. */
export const usePublicBounty = hookOf(selectPublicBounty);

// ── submissions, review and posts ──────────────────────────────────────────────────────────────

/** `useSubmissions({ creator: "mine", brand: "mine", bounty, app, status: "open" | "decided" | SubmissionStatus, q, sort })`: submissions with bounty, creator, brand and the decision clock joined. */
export const useSubmissions = hookOf(selectSubmissions);
/** One submission by id. */
export const useSubmission = hookOf(selectSubmission);
/** Every submission to one bounty. */
export const useSubmissionsForBounty = hookOf(selectSubmissionsForBounty);
/** The AI analysis of a submission (hook score, fit, compliance checks, fraud signals). Loads the heavy analysis table; `loading` is true until it is there. */
export const useSubmissionAnalysis = hookOf(selectSubmissionAnalysis);
/** The brand's review queue: `items` with SLA timers, QA and fraud flags, auto-approve matches, plus `counts`, `fraud_hold`, `inbox_zero` and `active_rules`. */
export const useReviewQueue = hookOf(selectReviewQueue);
/** The brand's auto-approve rules with match counts and last-run results. */
export const useRules = hookOf(selectRules);
/** One auto-approve rule. */
export const useRule = hookOf(selectRule);
/** `usePosts({ creator: "mine", brand: "mine", bounty, app, status: "open" | "settling" | PostStatus, q, sort })`: posts with creator, bounty, 72-hour window, Money Clock rows and earnings joined. */
export const usePosts = hookOf(selectPosts);
/** One post by id. */
export const usePost = hookOf(selectPost);
/** The Post Ledger: every cent of one post, line by line, with the money state and ETA of each and a proof hash. */
export const usePostLedger = hookOf(selectPostLedger);

// ── money: creator ─────────────────────────────────────────────────────────────────────────────

/** `useMoneyClock({ creator, state, bounty, limit })`: the Money Clock rows (accruing, pending, cleared, paid, held, reversed), each with its dated ETA and a named reason. */
export const useMoneyClock = hookOf(selectMoneyClock);
/** Payout history and the next Friday payout. */
export const usePayouts = hookOf(selectPayouts);
/** One payout with its earnings lines. */
export const usePayout = hookOf(selectPayout);
/** The instant cash-out preview: amount, fee (1.5%, min $0.50, max $15), net, and why it is or is not available. Null with nothing eligible. */
export const useInstantPreview = hookOf(selectInstantPreview);
/** The creator wallet: `summary` (pending, cleared, held, paid), the `ledger` totals it agrees with, Money Clock `rows`, `next_payout`, `payouts`, `hold`, payout `method`, the `instant` cash-out preview, a 30 day `series`, the income `calendar`, `proofs` and the `tax` desk. */
export const useCreatorWallet = hookOf(selectCreatorWallet);
/** The tax desk: year to date earnings, form status, 1099 threshold progress and set-aside. Null for a signed-out visitor. */
export const useTaxDesk = hookOf(selectTaxDesk);
/** The small wallet chip for the creator shell: pending, cleared and held. */
export const useWalletChip = hookOf(selectWalletChip);

// ── money: brand ───────────────────────────────────────────────────────────────────────────────

/** The brand wallet: `wallet` (balance, available, held for bids), `escrow` (held, reserved, available, settled, returned, with the bounties), `plan`, `auto_top_up`, `payment_method`, recent `txns`, `invoices`, the fee ladder (`fees`) and `spend_30d_cents`. */
export const useBrandWallet = hookOf(selectBrandWallet);
/** One invoice with line items. */
export const useInvoice = hookOf(selectInvoice);
/** The ledger explorer: double-entry transactions, filters, totals and the nets-to-zero check. */
export const useLedger = hookOf(selectLedger);
/** The escrow proof for one bounty: funded = reserved + spent + remaining + refunded, with the ledger lines behind each term. Null for an unknown bounty. */
export const useEscrowProof = hookOf(selectEscrowProof);

// ── funnel, overviews and home screens ─────────────────────────────────────────────────────────

/** The attribution funnel for a scope: `steps` (views, visits, installs, trials, paid), `counts`, `tracked` and `estimated` (kept apart), `coverage`, `cost_cents`, breakdowns (`by_source`, `by_hook_type`, `by_format`, `by_platform`, `by_bounty`), `cohorts` and `trend`. `loading` is true until its heavy tables arrive. */
export const useFunnel = hookOf(selectFunnel);
/** The brand overview: `tiles` (spend, views, installs, trials, paid, CAC), `needs` (what needs you now), `pacing`, `funnel`, `live_bounties`, `market`, `activity`, `next_actions`, the setup `checklist` and `is_new`. */
export const useBrandOverview = hookOf(selectBrandOverview);
/** The creator home: `wallet`, today's `drop`, `streak`, `matched` bounties, `what_to_post`, the `first_dollar` tracker, `next_steps`, `activity` and `tier`. */
export const useCreatorHome = hookOf(selectCreatorHome);
/** The First-Dollar Path wizard state: steps done and next, niches, linked accounts, 18+ confirmation and starter bounties. */
export const useOnboarding = hookOf(selectOnboarding);

// ── market ─────────────────────────────────────────────────────────────────────────────────────

/** One category's market: `stats` (clearing CPM and bands), `trend_copy`, `series`, `heat`, `curve`, `thin_market`, `supply`, `open_bounties`, `mine` and `top_hooks`. Undefined for no category. */
export const useMarket = hookOf(selectMarket);
/** Every category's market in one table (the market overview). */
export const useMarketOverview = hookOf(selectMarketOverview);
/** The pricing assistant: suggested CPM, fill-time forecast and where a CPM sits in the market. */
export const usePriceSuggestion = hookOf(selectPriceSuggestion);
/** Trend radar: rising sounds, formats and topics, filterable by niche and status. */
export const useTrends = hookOf(selectTrends);
/** Creator auctions (sealed bids): open, closing soon and resolved, with the bid state of the signed-in persona. */
export const useAuctions = hookOf(selectAuctions);
/** One auction with bids (sealed for others), hold and the price to beat. */
export const useAuction = hookOf(selectAuction);
/** Spec videos: unpaid-until-licensed uploads brands can license. */
export const useSpecs = hookOf(selectSpecs);
/** One spec video. */
export const useSpec = hookOf(selectSpec);

// ── offers, inbox and threads ──────────────────────────────────────────────────────────────────

/** Direct offers (brand to creator and creator to brand) with the whole negotiation, turn and expiry. */
export const useOffers = hookOf(selectOffers);
/** One offer. */
export const useOffer = hookOf(selectOffer);
/** Creators a brand paid before and can rebuy in one click, with their last price. */
export const useRebuyCandidates = hookOf(selectRebuyCandidates);
/** The inbox: `threads`, `unread_total` and `offers_waiting`. */
export const useInbox = hookOf(selectInbox);
/** One thread with its messages. */
export const useThread = hookOf(selectThread);

// ── creators ───────────────────────────────────────────────────────────────────────────────────

/** The creator directory for brands: `items` (reputation, reliability, rate card, match) and `total`. */
export const useCreatorDirectory = hookOf(selectCreatorDirectory);
/** A creator profile as a brand sees it (reputation, work, rate card, lists). */
export const useCreatorProfile = hookOf(selectCreatorProfile);
/** The public creator page `/c/[handle]`. */
export const usePublicCreator = hookOf(selectPublicCreator);
/** The brand's creator lists (shortlists, favourites, blocked). */
export const useLists = hookOf(selectLists);
/** The creator's rate card with a suggested price and the market median. */
export const useRateCard = hookOf(selectRateCard);

// ── community, learning and growth for creators ────────────────────────────────────────────────

/** Leaderboards: peer cohorts of about 30: `board`, `rows`, `me` (your rank and the gap to the next place), `promotion_zone_size`, `hours_to_reset`, `available`, `opted_out` and `typical_cents`. */
export const useLeaderboard = hookOf(selectLeaderboard);
/** Crews: `mine` (your crew, members, weekly goal), `discover` (open crews to join), `can_lead` and `lead_blocked_reason`. */
export const useCrews = hookOf(selectCrews);
/** Tournaments: `live`, `open`, `upcoming`, `past` and `mine` (your entries and standing). */
export const useTournaments = hookOf(selectTournaments);
/** One tournament with rounds, matchups and prizes. */
export const useTournament = hookOf(selectTournament);
/** The Academy: `lessons` with progress, `completed`, `total`, `badges`, `reliability_bonus`, `graduate` and the `next` lesson. */
export const useAcademy = hookOf(selectAcademy);
/** One lesson with the creator's progress. */
export const useLesson = hookOf(selectLesson);
/** The Remix library: formats, hooks and "why it won" cards, with filters. */
export const useRemix = hookOf(selectRemix);
/** One format with its beats, script and shot list. */
export const useFormat = hookOf(selectFormat);
/** The 11 winning format templates, filterable by niche, hook type, category, difficulty and faceless. */
export const useTemplates = hookOf(selectTemplates);
/** The hook library (7 types, 10 or more hooks each), with templates filled for an app: `useHooks({ type, fill: { app } })`. */
export const useHooks = hookOf(selectHookLibrary);
/** Referrals: your `code` and `link`, `referrals`, `totals` and the `rules` (5% for 90 days, capped at $100 per referee). */
export const useReferrals = hookOf(selectReferrals);
/** A Wrapped recap (monthly or yearly), 8 to 10 story cards. */
export const useWrapped = hookOf(selectWrapped);
/** Wellbeing Mode: `settings`, `saved` (whether settings exist yet), whether you are `paused`, `set_aside`, and `resources`. */
export const useWellbeing = hookOf(selectWellbeing);
/** Scam Shield and account health: `reports`, `accounts`, `rules` and the `checklist`. */
export const useSafety = hookOf(selectSafety);

// ── creator home pieces ────────────────────────────────────────────────────────────────────────

/** The Daily Drop: `today` (state, hours left, items with real inventory), `upcoming` and `recent`. */
export const useDrops = hookOf(selectDrops);
/** One drop by id. */
export const useDrop = hookOf(selectDrop);
/** The creator's streak: current, longest, freezes and the week's goal. */
export const useStreak = hookOf(selectStreak);
/** Tier progress: the current tier, `remaining` to the next, `progress`, `unlocks`, the `ladder`, `grace` and the `history`. */
export const useTiers = hookOf(selectTiers);
/** Notifications: `items`, the `unread` count and `needs_you` (the notifications that wait on an action), filterable by kind and unread. */
export const useNotifications = hookOf(selectNotifications);

// ── growth tools for brands ────────────────────────────────────────────────────────────────────

/** The creative library: a brand's winning posts with performance, tags and filters. */
export const useLibrary = hookOf(selectLibrary);
/** Side-by-side compare of up to 4 library items. */
export const useLibraryCompare = hookOf(selectLibraryCompare);
/** Test plans (hook and format experiments) with arms and results. */
export const useTestPlans = hookOf(selectTestPlans);
/** One test plan. */
export const useTestPlan = hookOf(selectTestPlan);
/** Whether the plan includes the test planner (Pro and above). */
export const useCanUseTestPlanner = hookOf(selectCanUseTestPlanner);
/** Promotions: spark-code ads and boosts for approved posts with eligibility, cost and results. */
export const usePromotions = hookOf(selectPromotions);

// ── trust and safety ───────────────────────────────────────────────────────────────────────────

/** The Rights Vault: `rows` (every licence, soonest expiry first), `buckets` (expired, within 7, 14 and 30 days, later, no end) and `counts` (total, active, expiring in 30 days, expired, ads depending on a licence). */
export const useRightsVault = hookOf(selectRightsVault);
/** The quote to extend a licence by N days. Null for an unknown grant. */
export const useRenewalQuote = hookOf(selectRenewalQuote);
/** The creator's own licences: where their videos are licensed, to whom, until when. */
export const useMyRights = hookOf(selectMyRights);
/** The plain-language rights card of a bounty. */
export const useRightsCard = hookOf(selectRightsCard);
/** The compliance log: FTC disclosure and platform-policy checks per post with the fix. */
export const useComplianceLog = hookOf(selectComplianceLog);
/** Disputes filtered by status, side and bounty. */
export const useDisputes = hookOf(selectDisputes);
/** One dispute with evidence, timeline and next step. */
export const useDispute = hookOf(selectDispute);
/** A brand scorecard: `metrics`, `decisions_n`, approval and rejection rates, decision hours (median, p90), pay speed, `badges`, `band`, `trend_30d` and `improvements`. Undefined for an unknown brand. */
export const useBrandScorecard = hookOf(selectBrandScorecard);
/** Brand scorecards, best first. */
export const useBrandScorecards = hookOf(selectBrandScorecards);

// ── workspace and settings ─────────────────────────────────────────────────────────────────────

/** The brand's apps with attribution health and active bounties. */
export const useApps = hookOf(selectApps);
/** One app. */
export const useApp = hookOf(selectApp);
/** Tracking links, promo codes, SDK status and the setup checklist for an app. */
export const useAttributionKit = hookOf(selectAttributionKit);
/** Integrations: `integrations` of this workspace, the `catalog` (each kind with its connected row), `webhooks`, `slack` and recent `deliveries`. */
export const useIntegrations = hookOf(selectIntegrations);
/** The team: `members`, the role `matrix`, `invited`, `can_manage` and `seats_used`. */
export const useTeam = hookOf(selectTeam);
/** The workspace activity log. */
export const useActivityLog = hookOf(selectActivityLog);
/** Developer settings: API `keys` (masked), `webhooks` with deliveries, `mcp`, `openapi_url`, `base_url` and `scopes`. */
export const useDeveloper = hookOf(selectDeveloper);
/** The agency view: `plan_ok`, `clients` (client brands with spend and health) and `totals`. */
export const useAgency = hookOf(selectAgency);
/** Brand settings: profile, defaults, notification and billing preferences. */
export const useBrandSettings = hookOf(selectBrandSettings);

// ── admin ──────────────────────────────────────────────────────────────────────────────────────

/** Ops metrics: `summary`, `targets`, `market_health`, `queues`, `alerts`, `promise_metrics`, `next_payout_run`, `payout_run` and `gaps`. */
export const useAdminMetrics = hookOf(selectAdminMetrics);
/** The demo clock: `now`, `advanced_hours`, `next_clearing_run`, `next_payout_run` and `hours_to_payout`. Advance it with `actions.advanceClock`. */
export const useDemoClock = hookOf(selectDemoClock);
/** The fraud queue with filters and counts. */
export const useFraudQueue = hookOf(selectFraudQueue);
/** One fraud case with signals and the decision options. */
export const useFraudCase = hookOf(selectFraudCase);
/** Identity and tax verification queue. */
export const useVerificationQueue = hookOf(selectVerificationQueue);
/** Payout operations: `next_run`, `held`, `failed`, `runs`, `instant_7d` and `method_issues`. */
export const usePayoutOps = hookOf(selectPayoutOps);
/** The review SLA desk: `stale` and `breached` videos, `by_brand`, and `unused` (approved videos nearing the 30-day release to the Spec Market). */
export const useSlaDesk = hookOf(selectSlaDesk);
/** Scam reports and safety cases. */
export const useSafetyQueue = hookOf(selectSafetyQueue);
/** Every bounty with filters, for ops. */
export const useBountyRegistry = hookOf(selectBountyRegistry);
/** Every creator with filters, for ops. */
export const useCreatorRegistry = hookOf(selectCreatorRegistry);
/** Every brand with filters, for ops. */
export const useBrandRegistry = hookOf(selectBrandRegistry);
/** The ML models behind scoring, with versions, accuracy and drift. */
export const useMlModels = hookOf(selectMlModels);
/** The admin audit trail. */
export const useAdminAudit = hookOf(selectAdminAudit);

// ── public pages and free tools ────────────────────────────────────────────────────────────────

/** The live payout ticker with the typical creator beside the top figure. */
export const useTicker = hookOf(selectTicker);
/** Typical (median) creator earnings in 30 days, the band and the top decile. */
export const useMedianEarnings = hookOf(selectMedianEarnings);
/** The ranked waitlist and the demo visitor's place. */
export const useWaitlist = hookOf(selectWaitlist);
/** The true count of the 200 founding-creator places. */
export const useFoundingSpots = hookOf(selectFoundingSpots);
/** The State of App UGC report. */
export const useStateOfAppUgc = hookOf(selectStateOfAppUgc);
/** A proof page `/p/[id]`; undefined for an unknown id. */
export const useProof = hookOf(selectProof);
/** What a viewer sees at a tracking link `/r/<code>`. */
export const useTrackingLanding = hookOf(selectTrackingLanding);
/** An audit report by slug. */
export const useAudit = hookOf(selectAudit);
/** Example and recent audits. */
export const useAudits = hookOf(selectAudits);
/** Case studies (fictional in the demo, labelled). */
export const useCaseStudies = hookOf(selectCaseStudies);
/** Testimonials, optionally for brands or creators. */
export const useTestimonials = hookOf(selectTestimonials);
/** The changelog, newest first. */
export const useChangelog = hookOf(selectChangelog);
/** The 11 flowd Promise commitments with their live public proof. */
export const usePromise = hookOf(selectPromise);
/** Public market-health numbers for the Trust Center. */
export const useTrustMetrics = hookOf(selectTrustMetrics);
/** The free earnings calculator: an estimate beside what typical creators really cleared. */
export const useEarningsCalculator = hookOf(selectEarningsCalculator);
/** The free budget planner: what a pool buys in views, installs, trials and paid. */
export const useBudgetPlanner = hookOf(selectBudgetPlanner);

// ── search ─────────────────────────────────────────────────────────────────────────────────────

/** The command-palette index for the signed-in persona (their own bounties, submissions, posts, lessons, creators, plus pages and actions). */
export const useSearchIndex = hookOf(selectSearchIndex);
