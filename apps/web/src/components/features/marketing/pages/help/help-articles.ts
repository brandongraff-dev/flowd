import { CONSTANTS } from "@/lib/engine";
import { formatMoney } from "@/lib/format";

export type HelpCategory = "money" | "reviews" | "rights" | "taxes" | "safety" | "attribution";
export type HelpAudience = "creators" | "brands" | "everyone";

/** One block of an article: a paragraph, a list or a link out. Plain data, so the same article renders on the page and in search. */
export type HelpBlock = { p: string } | { ul: readonly string[] } | { link: { href: string; label: string } };

export interface HelpArticle {
  id: string;
  category: HelpCategory;
  title: string;
  audience: HelpAudience;
  /** Shown first when no category or search is chosen. */
  top?: boolean;
  /** Extra words the search should match. */
  keywords?: string;
  blocks: readonly HelpBlock[];
}

export const HELP_CATEGORIES: ReadonlyArray<{ id: HelpCategory; label: string; blurb: string }> = [
  { id: "money", label: "Money", blurb: "Payouts, fees and the Money Clock" },
  { id: "reviews", label: "Reviews", blurb: "Decisions, feedback and appeals" },
  { id: "rights", label: "Rights", blurb: "What a brand may do with a video" },
  { id: "taxes", label: "Taxes", blurb: "Forms, totals and set-aside" },
  { id: "safety", label: "Safety", blurb: "Scams, burner accounts and reports" },
  { id: "attribution", label: "Attribution", blurb: "Links, codes and Tracked vs Estimated" },
];

const usd = (cents: number): string => formatMoney(cents, { cents: "auto" });
/** A ratio as a clean percentage number (0.12 gives 12), free of float noise. */
const pc = (ratio: number): number => Math.round(ratio * 1000) / 10;
const { fees, windows, review, rights, pay } = CONSTANTS;

/** The help articles, written against the product's own constants so a fee or a window quoted here is the one the engine uses. */
export const HELP_ARTICLES: readonly HelpArticle[] = [
  // ── money ──
  {
    id: "money-when-paid",
    category: "money",
    title: "When do I get paid?",
    audience: "creators",
    top: true,
    keywords: "payout weekly friday instant cash out clear",
    blocks: [
      { p: `Every earning moves through three states: pending, cleared, then paid. A post's views count for ${windows.view_window_hours} hours. Then the fraud check runs, which takes at most ${windows.fraud_check_max_hours} hours. After that the money clears.` },
      { p: "Cleared money is paid out every Friday at 18:00 UTC, and the weekly payout is free. You can also cash out the moment it clears." },
      { ul: [`Instant cash-out costs ${pc(fees.instant_payout_rate)}% (at least ${usd(fees.instant_payout_min_cents)}, at most ${usd(fees.instant_payout_max_cents)}). The fee is shown before you confirm.`, "Gold creators get one free instant cash-out a week. Platinum and Elite creators get unlimited free instant cash-outs.", `The smallest instant cash-out is ${usd(fees.instant_min_amount_cents)}.`] },
      { link: { href: "/creators", label: "See the Money Clock on the creators page" } },
    ],
  },
  {
    id: "money-pending",
    category: "money",
    title: "Why does my money say pending, and for how long?",
    audience: "creators",
    top: true,
    keywords: "pending hold held eta delay reason",
    blocks: [
      { p: "Pending is never bare. Every row shows a dated ETA, such as clears Sat 2:00 PM, and a named reason for any delay." },
      { ul: ["Fraud review: a person is looking at the views. It decides within 24 hours.", "Identity check or tax info missing: the payout waits for your ID or W-9. Finish it in Settings and the hold lifts.", "Dispute open: only the disputed amount is held. The rest keeps its date.", "No payout method: add a bank or card so cleared money can leave."] },
      { p: "If a row misses its ETA, we count it against ourselves on the Trust Center." },
      { link: { href: "/trust", label: "Open the Trust Center" } },
    ],
  },
  {
    id: "money-fees",
    category: "money",
    title: "What does flowd cost?",
    audience: "brands",
    top: true,
    keywords: "fee price plan free pro scale take rate processing install-only",
    blocks: [
      { p: `Creators never pay. Brands pay a take rate on bounty spend: Free is ${pc(CONSTANTS.plans.free.take_rate)}% with no monthly fee, Pro is ${pc(CONSTANTS.plans.pro.take_rate)}% at ${usd(CONSTANTS.plans.pro.price_cents_month)} a month, and Scale is ${pc(CONSTANTS.plans.scale.take_rate)}% at ${usd(CONSTANTS.plans.scale.price_cents_month)} a month.` },
      { ul: [`Install-only and other outcome-only bounties pay a flat ${pc(fees.cpa_only_take_rate)}%, charged only on cleared conversions.`, `Your first bounty has the platform fee waived, and flowd matches up to ${usd(fees.matched_first_bounty_cap_cents)} of the pool.`, `Card funding adds ${pc(fees.card_processing_rate)}% plus ${usd(fees.card_processing_fixed_cents)}.`, `Winner promotion to a Spark or partnership ad costs ${pc(fees.ad_spend_fee_rate)}% of ad spend.`] },
      { p: "Every price you see includes an all-in figure: creator pay plus fee plus processing." },
      { link: { href: "/pricing", label: "See the plans and the all-in calculator" } },
    ],
  },
  {
    id: "money-reserved-slot",
    category: "money",
    title: "What is a Reserved Slot?",
    audience: "everyone",
    keywords: "escrow funded reserve pool empty",
    blocks: [
      { p: "When a creator submits a video, up to one video's cap is set aside from the escrowed pool for that submission. That is the Reserved Slot." },
      { p: "If the video is approved, the creator is paid even if the pool has since run dry. If it is rejected or withdrawn, the slot goes back into the pool." },
      { link: { href: "/security", label: "How escrow and the ledger work" } },
    ],
  },
  // ── reviews ──
  {
    id: "reviews-deadline",
    category: "reviews",
    title: "How long does a brand have to decide?",
    audience: "everyone",
    top: true,
    keywords: "72 hours sla escalate approve if clean stale",
    blocks: [
      { p: `${review.sla_hours} hours from submission. The countdown turns amber at ${review.stale_after_hours} hours and the video is escalated to Ops at ${review.sla_hours}.` },
      { ul: ["A brand can choose approve-if-clean: a video with no flags is approved if the deadline passes.", "Every miss counts against the brand's public Scorecard, so slow brands are visible before you film.", "Rejections always carry a reason code and evidence."] },
      { link: { href: "/trust#scorecards", label: "See how brands are scored" } },
    ],
  },
  {
    id: "reviews-rejected",
    category: "reviews",
    title: "My video was not approved. What now?",
    audience: "creators",
    top: true,
    keywords: "reject revision appeal feedback reason",
    blocks: [
      { p: `You get a reason, evidence and timecoded feedback you can tick off. ${review.revision_rounds_included} revision rounds are included, and later rounds are paid by the brand.` },
      { p: `If you think the decision is wrong, you can appeal once per rejection within ${review.appeal_window_days} days. A person replies within ${review.appeal_decision_sla_hours} hours.` },
      { p: "Once a video is approved it cannot be rejected later unless fraud is proven. Views already delivered are always paid." },
    ],
  },
  {
    id: "reviews-score",
    category: "reviews",
    title: "What is a Hook Score or Flow Score?",
    audience: "creators",
    keywords: "checklist score hook flow band studio",
    blocks: [
      { p: `${CONSTANTS.scores.checklist_label} A Hook Score checks the first three seconds: whether the hook lands, whether the app is visible early, captions, pacing and disclosure.` },
      { p: "It is a checklist, not a prediction. It explains itself with timecoded reasons and a one-tap fix, and it never promises a video will perform." },
      { link: { href: "/tools/hook-score", label: "Try the free Hook Score" } },
    ],
  },
  // ── rights ──
  {
    id: "rights-card",
    category: "rights",
    title: "What is a Rights Card?",
    audience: "everyone",
    top: true,
    keywords: "licence license usage ads 90 days renewal ai likeness",
    blocks: [
      { p: "Every bounty carries a plain-language Rights Card before you submit, so nothing is buried in a contract." },
      { ul: ["Organic posting is always included.", `Paid-ad use is a priced, dated term. The default is ${rights.paid_ads_default_days} days.`, `Renewal costs ${pc(rights.renewal_fee_pct_of_base_per_30d)}% of the base fee for each extra 30 days.`, "AI likeness use is off by default.", `Brands get alerts at ${rights.expiry_alert_days.join(", ")} days before a licence ends.`] },
      { link: { href: "/legal/usage-rights", label: "Read the usage-rights terms" } },
    ],
  },
  {
    id: "rights-ads",
    category: "rights",
    title: "Can a brand run my video as an ad?",
    audience: "creators",
    keywords: "spark partnership winner promotion",
    blocks: [
      { p: "Only inside the term on the Rights Card, and only with your consent for a Spark or partnership ad. The code you grant lasts 7, 30, 60 or 365 days, and ads end automatically when the licence expires." },
      { p: `If the post is promoted, you earn ${pc(pay.ad_commission_rate)}% commission on ad-attributed results for ${pay.ad_commission_days} days.` },
    ],
  },
  {
    id: "rights-vault",
    category: "rights",
    title: "What is the Rights Vault?",
    audience: "brands",
    keywords: "expiry renewal licence track",
    blocks: [
      { p: "Every licence you hold, sorted by expiry, with alerts at 30, 14 and 7 days and the renewal price up front." },
      { p: "Ads that depend on a licence are listed beside it, so you never run a creator's video after the term ends." },
    ],
  },
  // ── taxes ──
  {
    id: "taxes-form",
    category: "taxes",
    title: "Do I need a tax form to get paid?",
    audience: "creators",
    top: true,
    keywords: "w-9 w-8ben 1099 tin set aside",
    blocks: [
      { p: "Yes, but only once you are about to be paid. We ask for a W-9 (or W-8BEN outside the US) at your first approval, never at sign-up. A payout waits for it, and the Money Clock names that as the reason." },
      { ul: ["We keep only the last four digits of your tax ID.", "The Tax Desk shows year-to-date earnings, progress to the 1099-NEC threshold and a set-aside estimate.", "You can export a CSV for your accountant."] },
      { p: "This is not tax advice. Thresholds change, so check the current rules or ask an accountant." },
    ],
  },
  {
    id: "taxes-gifts",
    category: "taxes",
    title: "Is free product or a gift taxable?",
    audience: "creators",
    keywords: "gifting free product income",
    blocks: [{ p: "In the US, products or perks you receive in exchange for creating content can count as income, even when no money changes hands. Keep a record of what you received and what it was worth. This is not tax advice." }],
  },
  // ── safety ──
  {
    id: "safety-scam",
    category: "safety",
    title: "How do I spot a scam?",
    audience: "creators",
    top: true,
    keywords: "scam red flags pay to join burner chat",
    blocks: [
      { ul: ["Anyone who asks you to pay, buy or send a deposit to take part.", "A request to move the chat to another app.", "A demand for a new account or a set number of posts a day.", "A bounty with no Funded badge that says it is funded."] },
      { p: "Real work on flowd is paid from escrow, and chat stays in the app." },
      { link: { href: "/trust#scam-shield", label: "The Scam Shield guide" } },
    ],
  },
  {
    id: "safety-report",
    category: "safety",
    title: "How do I report a scam or a burner-account demand?",
    audience: "everyone",
    top: true,
    keywords: "report abuse harassment fake brand",
    blocks: [
      { p: "Use Report on any bounty, message or offer in the app, or the report form if you are not signed in. A person reads every report and triages it within 24 hours, and you get a case ID." },
      { link: { href: "/trust/report", label: "Report a scam or abuse" } },
    ],
  },
  {
    id: "safety-health",
    category: "safety",
    title: "What is Account Health?",
    audience: "creators",
    keywords: "originality duplicate watermark subtitle repost strike",
    blocks: [
      { p: "Before you post, Account Health checks a video for duplicates, watermarks and subtitle-only reposts, which platforms treat as unoriginal. It tells you what to fix, in plain words, and you can appeal a flag." },
      { link: { href: "/legal/community-rules", label: "The community rules" } },
    ],
  },
  // ── attribution ──
  {
    id: "attr-tracked",
    category: "attribution",
    title: "What do Tracked and Estimated mean?",
    audience: "brands",
    top: true,
    keywords: "link code mmp survey modelled cpa conversion confidence",
    blocks: [
      { p: "Tracked means a conversion came through a creator's link or promo code, which is deterministic. Estimated means it came from an attribution partner, a survey or a model." },
      { p: "Outcome pay (cost per install, trial or paid) is only ever paid on Tracked conversions. Estimated figures help you judge, but they never trigger a payout, and we never style one like the other." },
    ],
  },
  {
    id: "attr-codes",
    category: "attribution",
    title: "How do offer codes work with Apple's limit?",
    audience: "brands",
    keywords: "offer code pool apple 10 subscription",
    blocks: [
      { p: "Apple allows 10 active offer codes per subscription product. Instead of one code per creator, flowd rotates a pool of codes and always falls back to the creator's deterministic link, so attribution never breaks when the pool is full." },
    ],
  },
  {
    id: "attr-revenuecat",
    category: "attribution",
    title: "How do I connect RevenueCat?",
    audience: "brands",
    keywords: "webhook secret sdk integration setup",
    blocks: [
      { p: "Add your app, then copy the webhook URL and secret from the Connect wizard into RevenueCat and send a test event. An SDK snippet is optional and improves link matching." },
      { link: { href: "/developers", label: "The API and webhooks" } },
    ],
  },
];

export const topArticles: readonly HelpArticle[] = HELP_ARTICLES.filter((article) => article.top);

/** Case- and accent-insensitive match of every word in `query` against an article's title, keywords and text. */
export function matchesArticle(article: HelpArticle, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [article.title, article.keywords ?? "", ...article.blocks.flatMap((block) => ("p" in block ? [block.p] : "ul" in block ? [...block.ul] : [block.link.label]))].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}
