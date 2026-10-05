/**
 * The honest comparison. Every claim about another product comes from `docs/research/trybe.md` and `docs/research/marketplaces.md` (researched
 * 2026-10-03), is worded as a description of a public fact, and carries how well we know it:
 *
 *   verified        seen on the company's own pages, terms, docs or store listings
 *   reported        from a third party, a reviewer or a competitor's write-up, or the company's own unaudited claim; may be biased or stale
 *   not documented  we looked and did not find it. That is not proof it does not exist.
 *
 * Where a competitor is better, we say so. Nothing here is disparagement, and a row that is not like-for-like says so.
 */

export type Confidence = "verified" | "reported" | "not_documented";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  verified: "Verified",
  reported: "Reported",
  not_documented: "Not documented",
};

export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  verified: "Seen on the company's own pages, terms, docs or store listings.",
  reported: "From a third party or the company's own unaudited claim. May be biased or out of date.",
  not_documented: "We looked and did not find it. That is not proof it does not exist.",
};

export interface Fact {
  text: string;
  tag: Confidence;
}

export const LAST_VERIFIED = "Oct 3, 2026";

export type TopicId = "fees" | "pays" | "escrow" | "review" | "fraud" | "attribution" | "platforms";

export interface Topic {
  id: TopicId;
  label: string;
  /** Shown under the label when the row is not like-for-like. */
  caution?: string;
}

export const TOPICS: readonly Topic[] = [
  { id: "fees", label: "What a brand pays", caution: "Not like-for-like: fees apply to different things (sales, ad spend, creator spend)." },
  { id: "pays", label: "What creators are paid for" },
  { id: "escrow", label: "Pay guarantee" },
  { id: "review", label: "Review deadline and reasons" },
  { id: "fraud", label: "Fraud checks before pay" },
  { id: "attribution", label: "App installs and trials" },
  { id: "platforms", label: "Where creators use it" },
];

export const FLOWD_CELLS: Record<TopicId, readonly Fact[]> = {
  fees: [
    { text: "12% of creator spend on Free, 10% on Pro ($299 a month), 8% on Scale ($999 a month). Install-only and trial-only bounties are a flat 6%, charged only on cleared conversions. Card processing is passed through at cost. The first bounty has the fee waived and flowd matches up to $500.", tag: "verified" },
  ],
  pays: [{ text: "Verified views at a CPM floor, plus tracked installs, trials and paid subscriptions, plus a 10% commission on ad-attributed revenue for 60 days. Creators are never charged a fee.", tag: "verified" }],
  escrow: [{ text: "A bounty goes live only when escrow is full, a slot is reserved for each submission, and an approved post is paid even if the pool later empties.", tag: "verified" }],
  review: [{ text: "A decision in 72 hours with a reason code and evidence, two free revisions and one appeal. If a brand goes quiet, clean work is approved or the decision escalates to Ops. Brands carry a public scorecard.", tag: "verified" }],
  fraud: [{ text: "A fraud score with the named rules that fired, the view-curve shape and cap-clustering detection, shown to the brand before approval and checked again before pay.", tag: "verified" }],
  attribution: [{ text: "A deferred tracking link, a promo-code pool and a RevenueCat webhook. Every conversion is labelled Tracked or Estimated, and only tracked ones pay.", tag: "verified" }],
  platforms: [{ text: "An iOS app (iOS 17 and up) with Studio and a Live Activity, plus a creator web portal. Android is next, not shipped.", tag: "verified" }],
};

export interface Competitor {
  id: "trybe" | "whop" | "sideshift" | "agencies";
  name: string;
  /** One neutral line: what it is. */
  summary: string;
  cells: Record<TopicId, readonly Fact[]>;
  /** Where they are better, in plain words. */
  better: readonly string[];
  /** Where the facts come from. */
  sources: string;
}

export const COMPETITORS: readonly Competitor[] = [
  {
    id: "trybe",
    name: "Trybe",
    summary: "A performance-paid creator program tool built for Shopify and direct-to-consumer brands.",
    cells: {
      fees: [
        { text: "Headline fee of never more than 1.5%: 1.5% of attributed sales, 1.25% of ad spend and 1.5% of creator earnings on flat fees and retainers. Free to start, no seats or contracts.", tag: "verified" },
      ],
      pays: [{ text: "Whatever each brand sets: commission on attributed store sales, flat fees, retainers or hybrids, paid through Stripe.", tag: "verified" }],
      escrow: [
        { text: "Flat fees charge the brand's card at acceptance, and the terms say there is no pre-funding or deposit. Commissions accrue and bill monthly.", tag: "verified" },
        { text: "Creators report approved videos that never ran.", tag: "reported" },
      ],
      review: [
        { text: "Approve, request a revision or deny, with the brand's comment. No review deadline appears in the public terms.", tag: "not_documented" },
        { text: "Creators report silent brands and rejection reasons that are not surfaced.", tag: "reported" },
      ],
      fraud: [{ text: "No fraud or duplicate-check process is described.", tag: "not_documented" }],
      attribution: [{ text: "Order-level, server-side attribution for Shopify, with Meta ad launching. The only integrations listed are Meta Ads and Shopify; no App Store, RevenueCat or attribution-partner link and no install or trial pay.", tag: "verified" }],
      platforms: [{ text: "iOS (iOS 18 and up) and Android apps, both rated 4.9 on their store listings. The website's FAQ still says Android is coming soon.", tag: "verified" }],
    },
    better: [
      "A lower headline fee, and a free start.",
      "Deep tooling for store brands: Shopify sync, samples, one-click Meta whitelisting, AI tagging and leaderboards.",
      "An Android app that is live today.",
      "If you sell physical products on Shopify, it is built for you.",
    ],
    sources: "Trybe's homepage, terms of service and store listings, plus reviews, read on Oct 3, 2026.",
  },
  {
    id: "whop",
    name: "Whop Content Rewards",
    summary: "An open pay-per-view rail: brands set a rate per 1,000 views and creators post to their own accounts.",
    cells: {
      fees: [
        { text: "Creator-side fee of about 10% on CPM payouts. The brand-side fee is reported as about 10% plus card processing, partner-disclosed and not published.", tag: "reported" },
      ],
      pays: [{ text: "Views only: a rate per 1,000 views with a minimum payout and a per-video cap set by the brand, plus an optional flat bonus.", tag: "verified" }],
      escrow: [
        { text: "Brands fund a budget by balance, card or Cash App in about a minute.", tag: "verified" },
        { text: "Creators report pools draining before approved clips are paid.", tag: "reported" },
      ],
      review: [
        { text: "Rejections are limited to stated rules, with one appeal.", tag: "verified" },
        { text: "Creators report rejections after a clip already had views, with no reason.", tag: "reported" },
      ],
      fraud: [
        { text: "No per-post bot score is documented for brands. A 2025 write-up reported near-total bot views clustering at the payout cap, after which detection, a payout delay and bans were added.", tag: "reported" },
      ],
      attribution: [{ text: "It pays on views. No install or trial attribution is documented, and the bounty API has no approve or deny endpoint and no webhooks.", tag: "verified" }],
      platforms: [{ text: "Creators post to their own TikTok, Instagram Reels, YouTube Shorts and X accounts.", tag: "verified" }],
    },
    better: [
      "Scale: a large audience of clippers, reported at about 95,000 members.",
      "Fast funding, and creators join for free and post to their own accounts.",
      "Recurring bounties and country limits through its API.",
      "If you want broad reach for clips and a rate per view is all you need, it is built for that.",
    ],
    sources: "Whop's content rewards and bounties documentation, plus third-party guides and creator reports from 2025 and 2026.",
  },
  {
    id: "sideshift",
    name: "SideShift",
    summary: "A subscription UGC marketplace where brands hire creators for jobs, with contracts, usage rights and analytics.",
    cells: {
      fees: [
        { text: "Monthly plans of $299, $499 and $999 with caps on jobs, hires and invites, according to its own comparison pages.", tag: "verified" },
        { text: "It claims 700,000+ creators and $100M+ paid out. We have not audited either figure.", tag: "reported" },
      ],
      pays: [{ text: "A retainer plus bonus, or a CPM, agreed per job. Contracts and usage rights are part of the flow.", tag: "verified" }],
      escrow: [{ text: "Payment insurance and dispute help are advertised to creators. How funds are held is not documented.", tag: "reported" }],
      review: [{ text: "Briefs, applications and a revision flow. No review deadline is published, and no creator rating was found.", tag: "not_documented" }],
      fraud: [{ text: "No view-fraud checks are described.", tag: "not_documented" }],
      attribution: [{ text: "Analytics for ROAS, click-through and hook rate, and cross-platform tracking on its top plan. No install or trial pay is described.", tag: "verified" }],
      platforms: [{ text: "Creators are limited to the US, Canada, the UK and Australia. Tax forms and contractor agreements are handled for them.", tag: "verified" }],
    },
    better: [
      "Contracts, usage rights and 1099 paperwork are already handled.",
      "Team roles and analytics for brands that hire for specific jobs.",
      "A marketplace model that suits a one-off brief with a named creator.",
    ],
    sources: "SideShift's own site and comparison pages, plus a search listing for the creator count, read on Oct 3, 2026.",
  },
  {
    id: "agencies",
    name: "Agencies and managed UGC",
    summary: "Done-for-you services that find, brief, contract and manage creators on your behalf.",
    cells: {
      fees: [
        { text: "Quote-based or a monthly retainer, so there is no single price. The managed marketplace TRIBE is reported to charge 20% in the US and UK and 30% in Australia, plus card fees.", tag: "reported" },
        { text: "Enterprise creator CRMs such as Aspire and Upfluence do not publish prices; third-party ranges start around $2,000 a month.", tag: "reported" },
      ],
      pays: [{ text: "Usually a flat fee per video or a retainer. It varies by agency.", tag: "reported" }],
      escrow: [{ text: "Varies by agency. Ask who holds the money, and when the creator is paid.", tag: "not_documented" }],
      review: [{ text: "A named person manages approvals and revisions. Turnaround and revision limits vary, so ask for them in writing.", tag: "not_documented" }],
      fraud: [{ text: "Varies. Ask how views are verified before anything is paid.", tag: "not_documented" }],
      attribution: [{ text: "Varies. Most report on views, clicks or store orders. Ask whether installs, trials and paid subscriptions are tracked.", tag: "not_documented" }],
      platforms: [{ text: "Whatever the agency has built, usually a creator network and a brand portal.", tag: "not_documented" }],
    },
    better: [
      "A person who runs it for you: briefing, casting, chasing and brand-safety judgment.",
      "A good fit when you have budget and no time, or need custom production.",
      "Relationships with larger creators that an open market may not reach.",
    ],
    sources: "Public pricing guides and competitor write-ups from 2026. Agencies differ widely: treat this column as questions to ask, not as a quote.",
  },
];

/** The two columns shown beside flowd on the landing page. */
export const GLANCE_IDS: readonly Competitor["id"][] = ["trybe", "whop"];

/** What each product publishes about price, for the pricing page. The "applies to" column is the point: these fees are charged on different things. */
export interface PriceRow {
  name: string;
  /** What the fee is charged on. */
  appliesTo: string;
  fee: string;
  tag: Confidence;
}

export const PRICE_ROWS: readonly PriceRow[] = [
  { name: "flowd", appliesTo: "Creator spend on bounties, offers and specs", fee: "12% on Free, 10% on Pro ($299 a month), 8% on Scale ($999 a month); 6% flat on installs and trials only; card processing at cost; first bounty fee waived and matched up to $500.", tag: "verified" },
  { name: "Trybe", appliesTo: "Attributed store sales and ad spend", fee: "Never more than 1.5%: 1.5% of attributed sales, 1.25% of ad spend, 1.5% of creator earnings on flat fees and retainers. Free to start.", tag: "verified" },
  { name: "Whop Content Rewards", appliesTo: "Creator payouts, and the brand's budget", fee: "About 10% creator-side on CPM payouts. A brand-side fee of about 10% plus card processing is reported but not published.", tag: "reported" },
  { name: "JoinBrands", appliesTo: "Creator spend", fee: "A pay-as-you-go fee of 8% to 15%, or monthly plans of $99, $299 and $499 (a 2026 review). An older 2023 review listed 12%, 10% and 8% by plan.", tag: "reported" },
  { name: "TRIBE", appliesTo: "Managed campaigns", fee: "Reported at 20% in the US and UK and 30% in Australia, plus card fees (a competitor-authored write-up, February 2026).", tag: "reported" },
  { name: "SideShift", appliesTo: "A subscription that caps jobs, hires and invites", fee: "$299, $499 or $999 a month, according to its own comparison pages.", tag: "verified" },
  { name: "Agencies and managed UGC", appliesTo: "A retainer or a quote", fee: "No single price. Enterprise creator CRMs such as Aspire and Upfluence do not publish prices; third-party ranges start near $2,000 a month.", tag: "reported" },
];
