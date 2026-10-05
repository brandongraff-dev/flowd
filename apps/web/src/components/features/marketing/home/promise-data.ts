/**
 * The 11 flowd Promise commitments (PRODUCT_SPEC 3.1), as page copy. The numbers match the public proof metrics in the ledger
 * (`admin_metrics.promise_metrics`), so a card here and a metric there are the same thing. What happens when a commitment is missed is written
 * in the rules the product enforces (acceptance criteria AC-1 to AC-25), never as a marketing flourish.
 */
export interface PromiseCopy {
  number: number;
  /** Short title: "Money has a date". */
  title: string;
  /** The commitment in one or two sentences. */
  commitment: string;
  /** What the product does when the commitment is missed. */
  ifMissed: string;
  /** The features that keep it (names as shown in the product). */
  features: readonly string[];
  /** Where the feature is explained. */
  href: string;
}

export const PROMISES: readonly PromiseCopy[] = [
  {
    number: 1,
    title: "Money has a date",
    commitment: "Every earning shows pending, cleared or paid, a dated ETA and a named reason for any delay. There is no bare \"pending\".",
    ifMissed: "A row that slips shows its new date and the reason (view check, dispute, missing tax info) with what releases it. A row with no date fails our own render test.",
    features: ["Money Clock"],
    href: "/creators#money-clock",
  },
  {
    number: 2,
    title: "Funded or not live",
    commitment: "No bounty goes live without full escrow, and an approved post is paid even if the pool later empties.",
    ifMissed: "It cannot be missed: the API refuses to publish an unfunded bounty (409 bounty_not_funded), and a Reserved Slot sets money aside the moment a creator submits.",
    features: ["Funded badge", "Reserved Slot"],
    href: "/brands#escrow",
  },
  {
    number: 3,
    title: "A decision in 72 hours, with a reason",
    commitment: "Brands decide within 72 hours. A rejection carries a reason code and evidence, feedback is timecoded, two revisions are included and there is one appeal.",
    ifMissed: "At 72 hours a clean video is approved automatically, or the decision escalates to Ops. The brand's reliability score takes a hit either way.",
    features: ["No-Rug Approvals", "Timecoded feedback", "Appeals"],
    href: "/brands#review",
  },
  {
    number: 4,
    title: "Brands are scored too",
    commitment: "Pay speed, decision time, approval fairness and the share of approved work actually run are public. Creator reputation counts finished work only.",
    ifMissed: "A brand with fewer than 10 decisions shows \"New brand\" instead of a misleading figure, and scorecard metrics cannot be edited. Admin adjustments are logged.",
    features: ["Brand Scorecard", "Fair creator reputation"],
    href: "/trust",
  },
  {
    number: 5,
    title: "See every view",
    commitment: "Each post has hourly view snapshots, a traffic-source split and the named cause of any removed view, with a one-tap dispute.",
    ifMissed: "A dispute never blocks undisputed money. The disputed amount shows as held with its reason, and an overturned flag releases in the next payout run.",
    features: ["View Ledger", "One-tap dispute"],
    href: "/trust",
  },
  {
    number: 6,
    title: "Know what you license",
    commitment: "Every bounty carries a plain-language Rights Card. Paid-ad use is a priced, dated term with alerts at 30, 14 and 7 days.",
    ifMissed: "Brief Lint blocks perpetual or unlimited usage, and the card is snapshotted when you submit, so a later edit never changes your licence.",
    features: ["Rights Card", "Rights Vault"],
    href: "/creators#safety",
  },
  {
    number: 7,
    title: "No traps in the brief",
    commitment: "A brief cannot be published with an unpaid trial, a view-minimum base, a burner-account demand or perpetual rights. Creators see effective pay at the median.",
    ifMissed: "The publish button stays off until each blocker is fixed, and every blocker has a one-line fix.",
    features: ["Brief Lint", "Pay Math"],
    href: "/brands#builder",
  },
  {
    number: 8,
    title: "Taxes without surprises",
    commitment: "The W-9 is requested at your first approval, never at sign-up, with year-to-date earnings, a set-aside estimate and a CSV export. Not tax advice.",
    ifMissed: "If tax info is missing the row says \"awaiting tax info\" and shows the action, never a silent block.",
    features: ["Tax Desk"],
    href: "/creators#safety",
  },
  {
    number: 9,
    title: "No scams, no burners",
    commitment: "In-app chat only, no pay-to-join, verified brands, a report flow that a person reads, and no bounty may demand a burner account.",
    ifMissed: "Every report gets a case id and a human reply inside the service level, and the action taken is logged.",
    features: ["Scam Shield", "Account Health"],
    href: "/creators#safety",
  },
  {
    number: 10,
    title: "Typical beside top",
    commitment: "The typical (median) creator is shown beside any top earner, in the same size, with the method one click away.",
    ifMissed: "An earnings card without the median line fails its render test and cannot be exported.",
    features: ["Earnings Cards", "Proof pages"],
    href: "/legal/earnings-disclosure",
  },
  {
    number: 11,
    title: "Your pace",
    commitment: "Quiet hours, numbers-off mode, weekly streaks with freezes and rest weeks, and no guilt notifications.",
    ifMissed: "There is no inactivity penalty. Pause keeps your tier and your streak.",
    features: ["Wellbeing Mode"],
    href: "/creators#wellbeing",
  },
];
