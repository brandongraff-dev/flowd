import Link from "next/link";
import { ArrowDown, ArrowRight, BadgeDollarSign, Banknote, Bug, Eye, FileCheck2, Landmark, Lock, ScanEye, ScrollText, ShieldCheck, Timer, Vault, Wallet } from "lucide-react";
import { CONSTANTS } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { ArrowLink, FactCard, Footnote, IconTile, PageSection, Prose } from "../kit";

/* ── escrow and the ledger ─────────────────────────────────────────────────────────────────────────────────────────── */

const FLOW = [
  { icon: <Wallet />, title: "Brand wallet", body: "Money the brand added by card or bank." },
  { icon: <Vault />, title: "Escrow", body: "The whole pool and fee, locked before go-live. This is the Funded badge." },
  { icon: <ScrollText />, title: "Reserved Slot", body: "On submit, up to one video's cap is set aside for that creator." },
  { icon: <Timer />, title: "Pending", body: `Views count for ${CONSTANTS.windows.view_window_hours} hours, then the fraud check runs.` },
  { icon: <Banknote />, title: "Cleared, then paid", body: "Cleared money goes out in the free Friday payout." },
] as const;

/** The path one dollar takes, as five steps. Wraps to a column on a phone. */
export function EscrowFlow() {
  return (
    <ol className="grid gap-3 lg:grid-cols-5 lg:gap-2">
      {FLOW.map((step, index) => (
        <li key={step.title} className="relative grid">
          <GlassCard padding="md" className="grid content-start gap-3">
            <IconTile tone={index === 1 ? "mint" : "accent"}>{step.icon}</IconTile>
            <h3 className="font-display text-title-sm text-fg">{step.title}</h3>
            <p className="text-body-sm text-fg-muted">{step.body}</p>
          </GlassCard>
          {index < FLOW.length - 1 ? (
            <span aria-hidden="true" className="grid h-6 place-items-center text-fg-subtle lg:absolute lg:top-1/2 lg:-right-3.5 lg:z-10 lg:h-auto lg:w-5 lg:-translate-y-1/2">
              <ArrowDown className="size-4 lg:hidden" strokeWidth={2} />
              <ArrowRight className="hidden size-4 lg:block" strokeWidth={2} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const EXAMPLE_ROWS = [
  { n: "txn_0001", memo: "Fund bounty (pool and fee)", debit: "wallet:br_example", credit: "escrow:bnty_example", amount: "$5,600.00" },
  { n: "txn_0002", memo: "Reserve a slot for @creator", debit: "escrow:bnty_example", credit: "reserved:sub_example", amount: "$250.00" },
  { n: "txn_0003", memo: "Settle the post after 72 hours", debit: "reserved:sub_example", credit: "pending:cr_example", amount: "$186.40" },
  { n: "txn_0004", memo: "Fee on the settled post", debit: "reserved:sub_example", credit: "fees:flowd", amount: "$22.37" },
] as const;

/** A tiny ledger: every row names a debit and a credit for the same amount. Illustrative figures, labelled as an example. */
export function LedgerExample() {
  return (
    <GlassCard padding="none" className="overflow-hidden p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-3 sm:px-5">
        <p className="font-display text-title-sm text-fg">A ledger, four rows</p>
        <Badge size="sm" variant="outline">
          Example, not real money
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left">
          <caption className="sr-only">Four example ledger rows. Each row debits one account and credits another by the same amount.</caption>
          <thead>
            <tr className="text-caption text-fg-subtle">
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                Row
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                What happened
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Debit
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Credit
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLE_ROWS.map((row) => (
              <tr key={row.n} className="text-body-sm">
                <th scope="row" className="border-t border-divider px-4 py-3 font-mono text-code font-normal text-fg-muted sm:px-5">
                  {row.n}
                </th>
                <td className="border-t border-divider px-3 py-3 text-fg">{row.memo}</td>
                <td className="border-t border-divider px-3 py-3 font-mono text-code text-fg-muted">{row.debit}</td>
                <td className="border-t border-divider px-3 py-3 font-mono text-code text-fg-muted">{row.credit}</td>
                <td className="fd-figure border-t border-divider px-4 py-3 text-right font-semibold text-fg tabular-nums sm:px-5">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-caption text-fg-subtle sm:px-5">Every transaction nets to zero. A mistake is fixed by a new row that reverses it. Rows are never edited or deleted.</p>
    </GlassCard>
  );
}

export function EscrowSection() {
  return (
    <PageSection
      id="escrow"
      eyebrow="Escrow and the ledger"
      title="Funded or not live"
      description="A bounty cannot go live until its whole pool and fee are in escrow. That one rule, plus an append-only ledger, is what makes a payout date a promise."
      actions={<ArrowLink href="/promise">The flowd Promise</ArrowLink>}
    >
      <div className="grid gap-6">
        <EscrowFlow />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <LedgerExample />
          <GlassCard padding="lg" className="grid content-start gap-4">
            <p className="fd-eyebrow text-fg-subtle">The identity we test</p>
            <p className="font-display text-title-md text-balance text-fg">Funded = reserved + spent + remaining + refunded</p>
            <p className="text-body-sm text-fg-muted">Four terms add up to the escrow of every bounty, to the cent. Tests run it after every action, and the Wallet shows the same four numbers a creator sees on the bounty.</p>
            <ul className="grid gap-2.5 text-body-sm text-fg-muted">
              <li className="flex gap-2.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2} />
                <span>Approved posts are paid even if the pool later runs out: the Reserved Slot is already set aside.</span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2} />
                <span>Unspent escrow returns to the brand wallet when the bounty settles.</span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </PageSection>
  );
}

/* ── fraud ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const SIGNAL_LABEL: Record<string, string> = {
  view_spike_no_engagement: "A view spike with no likes",
  cap_clustering: "Earnings clustering at the cap",
  bought_views_pattern: "A step-function view curve",
  geo_mismatch: "Audience outside the target region",
  view_to_follower_outlier: "Views far above the follower count",
  new_account: "An account under 30 days old",
  duplicate_hash: "A duplicate of another video",
  engagement_anomaly: "Engagement that does not fit",
  traffic_source_anomaly: "Unusual traffic sources",
  curve_shape: "No natural decay in the view curve",
};

const BANDS: ReadonlyArray<{ key: keyof typeof CONSTANTS.fraud.bands; label: string; what: string; tone: "mint" | "info" | "sun" | "rose" }> = [
  { key: "clean", label: "Clean", what: "Settles normally.", tone: "mint" },
  { key: "watch", label: "Watch", what: "Settles, and the signals are logged.", tone: "info" },
  { key: "review", label: "Review", what: `A person looks within ${CONSTANTS.fraud.review_sla_hours} hours.`, tone: "sun" },
  { key: "high", label: "High", what: "The post is held until a person decides.", tone: "rose" },
];

export function FraudSection() {
  const signals = Object.entries(CONSTANTS.fraud.signals) as Array<[string, { max_points: number; rule: string }]>;
  const maxPoints = Math.max(...signals.map(([, signal]) => signal.max_points));
  return (
    <PageSection
      id="fraud"
      eyebrow="Fraud"
      title="Views are checked before they are paid"
      description={`Money is released only after a ${CONSTANTS.windows.view_window_hours}-hour window and a fraud check of up to ${CONSTANTS.windows.fraud_check_max_hours} hours. Ten named rules add points to a score from 0 to 100, and the rules that fired are listed on every case.`}
    >
      <div className="grid gap-6">
        <ul className="grid gap-3 md:grid-cols-4" aria-label="Fraud score bands">
          {BANDS.map((band) => {
            const [low, high] = CONSTANTS.fraud.bands[band.key];
            return (
              <li key={band.key}>
                <GlassCard padding="md" className="grid h-full content-start gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={band.tone} size="md">
                      {band.label}
                    </Badge>
                    <p className="fd-figure text-body-sm font-semibold text-fg-muted tabular-nums">
                      {low} to {high}
                    </p>
                  </div>
                  <p className="text-body-sm text-fg-muted">{band.what}</p>
                </GlassCard>
              </li>
            );
          })}
        </ul>

        <GlassCard padding="none" className="p-2 sm:p-3">
          <p className="px-4 pt-3 pb-2 font-display text-title-sm text-fg sm:px-5">The ten rules and the most each can add</p>
          <ul className="grid">
            {signals.map(([key, signal]) => (
              <li key={key} className="grid gap-2 border-t border-divider px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem] sm:items-center sm:gap-6 sm:px-5">
                <p className="text-body-sm font-semibold text-fg">{SIGNAL_LABEL[key] ?? key}</p>
                <p className="text-body-sm text-fg-muted">{signal.rule}</p>
                <div className="flex items-center gap-2.5 sm:justify-end">
                  <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-pill bg-surface-hover">
                    <span className="block h-full rounded-pill bg-(--fd-chart-1)" style={{ width: `${(signal.max_points / maxPoints) * 100}%` }} />
                  </span>
                  <span className="fd-figure text-body-sm font-semibold text-fg tabular-nums">up to {signal.max_points}</span>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="grid gap-4 md:grid-cols-3">
          <FactCard>
            <IconTile tone="accent">
              <ScanEye />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">A person decides the hard cases</h3>
            <p className="text-body-sm text-fg-muted">
              At {CONSTANTS.fraud.review_threshold} a case goes to review; at {CONSTANTS.fraud.hold_threshold} the post is held. Today the model is a set of rules, not a trained network. A learned model replaces it only after it beats the rules on settled posts.
            </p>
          </FactCard>
          <FactCard>
            <IconTile tone="mint">
              <BadgeDollarSign />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Real views are always paid</h3>
            <p className="text-body-sm text-fg-muted">A flag never cancels views that were real. Only proven fraud is clawed back, only for the views that were not real, and the creator can see the evidence and dispute it.</p>
          </FactCard>
          <FactCard>
            <IconTile tone="sun">
              <Eye />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">Creators see it too</h3>
            <p className="text-body-sm text-fg-muted">Every post has a View Ledger: snapshots, sources, and the plain-words cause when views are excluded. A dispute is one tap, with the ledger attached.</p>
          </FactCard>
        </div>
      </div>
    </PageSection>
  );
}

/* ── payouts, disclosure, privacy ──────────────────────────────────────────────────────────────────────────────────── */

export function PayoutSection() {
  return (
    <PageSection
      id="payouts"
      eyebrow="Payout protection"
      title="Money that is owed does not vanish"
      description="The rules that protect a payout are written into the ledger, not left to a support reply."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <Landmark />, tone: "mint" as const, title: "Paid on a schedule", body: "Cleared money goes out every Friday at 18:00 UTC, free. Instant cash-out shows its fee first: 1.5%, at least $0.50 and at most $15." },
          { icon: <Timer />, tone: "info" as const, title: "A date and a reason", body: "Every earning row shows pending, cleared or paid, an absolute ETA, and a named reason for any delay. A bare Pending fails our own render test." },
          { icon: <FileCheck2 />, tone: "accent" as const, title: "Checks just in time", body: "ID and tax details are collected at your first approval, before your first payout, and never up front. A payout held for a check says so." },
          { icon: <Lock />, tone: "violet" as const, title: "Disputes do not freeze the rest", body: "A dispute holds only the amount in question. Undisputed money keeps its date, and an overturned flag is released in the next payout run." },
        ].map((item) => (
          <FactCard key={item.title}>
            <IconTile tone={item.tone}>{item.icon}</IconTile>
            <h3 className="font-display text-title-md text-fg">{item.title}</h3>
            <p className="text-body-sm text-fg-muted">{item.body}</p>
          </FactCard>
        ))}
      </div>
    </PageSection>
  );
}

export function DisclosureSection() {
  return (
    <PageSection
      id="disclosure"
      eyebrow="Disclosure"
      title="Ads are labelled, and we check"
      description="FTC rules say a paid post must be clear that it is paid. flowd builds that into the flow instead of leaving it to memory."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Prose>
          <p>
            Every posting flow adds <strong>#ad</strong> and the brand&apos;s wording to the caption, and the creator cannot take it out. Where the platform has a paid-partnership label, Studio reminds the creator to switch it on.
          </p>
          <p>
            Before a video is approved, Compliance QA checks the disclosure on screen and in the audio, the music licence, the brand&apos;s banned claims and whether AI-generated content is labelled. Each check is written to an audit trail with the fix, so a brand can show what it did.
          </p>
          <p>
            <strong>The limit.</strong> We cannot see what a creator says after the video is posted or edit their caption on another platform. We check before approval, flag a caption change on posts we can read, and make the right thing the easy thing. Legal responsibility for disclosure stays with the parties; the brand terms say so.
          </p>
        </Prose>
        <GlassCard padding="lg" className="grid content-start gap-4">
          <p className="fd-eyebrow text-fg-subtle">What Compliance QA checks</p>
          <ul className="grid gap-3 text-body-sm text-fg-muted">
            {["Disclosure on screen and spoken", "Music: original or from a commercial library", "Banned claims and competitor names from the brief", "AI-generated content is labelled", "Caption keeps #ad and the brand wording"].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <FileCheck2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} />
                {item}
              </li>
            ))}
          </ul>
          <ArrowLink href="/legal/community-rules">Community rules and strikes</ArrowLink>
        </GlassCard>
      </div>
    </PageSection>
  );
}

export function PrivacySection() {
  return (
    <PageSection
      id="privacy"
      eyebrow="Privacy and data"
      title="Your data is yours"
      description="The short version of what we collect and what we will not do. The full inventory is in the privacy policy."
      actions={<ArrowLink href="/legal/privacy">Privacy policy</ArrowLink>}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Social tokens are encrypted and read-only", body: "Linking an account lets us read view counts. flowd never posts for you, and you can disconnect any time." },
          { title: "No training on your videos without opt-in", body: "The AI-training setting is off by default. Turn it on in Settings, privacy, and turn it off again whenever you like." },
          { title: "Analytics that respect you", body: "Do Not Track and Global Privacy Control switch it all off. Events never carry free text, emails or amounts in a URL, and ids are pseudonymous." },
          { title: "Studio checks run on your device", body: "On iPhone, the Hook Score reads the first three seconds on the phone. A take stays on the device until you submit it." },
          { title: "Export and delete", body: "Ask for a copy of your data or for deletion at any time, under GDPR and CCPA rights, from Settings." },
          { title: "Tax numbers are never stored in full", body: "Only the last four digits of a tax ID are kept. The rest goes to the tax provider." },
        ].map((item) => (
          <FactCard key={item.title}>
            <h3 className="font-display text-title-sm text-fg">{item.title}</h3>
            <p className="text-body-sm text-fg-muted">{item.body}</p>
          </FactCard>
        ))}
      </div>
    </PageSection>
  );
}

/* ── subprocessors, disclosure programme, limits ───────────────────────────────────────────────────────────────────── */

const SUBPROCESSORS = [
  { name: "Supabase", purpose: "Database, authentication and file storage", data: "Account, ledger and video metadata", status: "Planned for launch" },
  { name: "Stripe", purpose: "Card and bank payments, Connect payouts, identity checks", data: "Payment and identity details, held by Stripe", status: "Planned for launch" },
  { name: "RevenueCat", purpose: "Subscription events for brand attribution", data: "Anonymous purchase events from a brand's own app", status: "Planned for launch" },
  { name: "Anthropic", purpose: "Optional: Flo copilot text, server side only", data: "Brief text sent for a suggestion. Off unless enabled", status: "Optional" },
  { name: "PostHog", purpose: "Optional: product analytics", data: "Sanitised events. Off unless enabled", status: "Optional" },
] as const;

export function SubprocessorsSection() {
  return (
    <PageSection
      id="subprocessors"
      eyebrow="Subprocessors"
      title="Who handles data for us"
      description="The companies we plan to rely on at launch. In this demo no real data is sent to any of them: payments, identity and attribution are mocks, and everything lives in your browser."
    >
      <GlassCard padding="none" className="overflow-hidden p-2 sm:p-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left">
            <caption className="sr-only">Subprocessors, what each does, what data it handles and its status.</caption>
            <thead>
              <tr className="text-caption text-fg-subtle">
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Company
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  What it does
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Data it handles
                </th>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((row) => (
                <tr key={row.name} className="text-body-sm">
                  <th scope="row" className="border-t border-divider px-4 py-3.5 font-semibold text-fg sm:px-5">
                    {row.name}
                  </th>
                  <td className="border-t border-divider px-3 py-3.5 text-fg-muted">{row.purpose}</td>
                  <td className="border-t border-divider px-3 py-3.5 text-fg-muted">{row.data}</td>
                  <td className="border-t border-divider px-4 py-3.5 sm:px-5">
                    <Badge size="md" tone={row.status === "Optional" ? "neutral" : "info"}>
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
      <Footnote className="mt-5">We will announce any change to this list before it takes effect. Mentions of other companies are plain text, and none of them endorses or is affiliated with flowd.</Footnote>
    </PageSection>
  );
}

export function DisclosureProgramSection() {
  return (
    <PageSection
      id="vulnerability"
      eyebrow="Vulnerability disclosure"
      title="Found a hole? Tell us first."
      description="We want to hear about security problems and we will not take action against people who report them in good faith."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <GlassCard padding="lg" className="grid content-start gap-5">
          <div className="flex items-center gap-3">
            <IconTile tone="rose">
              <Bug />
            </IconTile>
            <h3 className="font-display text-title-md text-fg">How to report</h3>
          </div>
          <Prose>
            <p>
              Email <a href="mailto:security@joinflowd.io">security@joinflowd.io</a> with what you found, the steps to reproduce it and the impact you can show. We aim to acknowledge within two business days and to keep you posted until it is fixed. These are targets, not a contract.
            </p>
            <p>Please give us a reasonable time to fix a problem before you share it, use only your own accounts and test data, and stop if you reach someone else&apos;s information.</p>
          </Prose>
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-4">
          <p className="fd-eyebrow text-fg-subtle">Scope</p>
          <ul className="grid gap-3 text-body-sm text-fg-muted">
            <li>
              <span className="font-semibold text-fg">In scope:</span> joinflowd.io, app.joinflowd.io, api.joinflowd.io and the iOS app.
            </li>
            <li>
              <span className="font-semibold text-fg">Out of scope:</span> social engineering of our people, denial of service, spam, and anything that needs a real person&apos;s money or documents to prove.
            </li>
            <li>
              <span className="font-semibold text-fg">No bounty programme yet.</span> We will credit you if you want it.
            </li>
          </ul>
        </GlassCard>
      </div>
    </PageSection>
  );
}

export function LimitsSection() {
  return (
    <PageSection
      id="limits"
      eyebrow="Honest limits"
      title="What this page does not claim"
      description="Security pages that only list strengths are marketing. Here is what is not true yet."
    >
      <GlassCard padding="lg" tint="sun" className="grid gap-4">
        <ul className="grid gap-3 text-body text-fg-muted">
          {[
            "flowd has not completed a SOC 2 audit or a penetration test. Both are planned before the first paid bounty, and we will publish the results' summaries when they exist.",
            "This build runs on a demo world. No real money moves, and no real ID, tax or payment data is collected or stored.",
            "The fraud model is a set of rules today. It will miss some fraud and flag some honest posts, which is why a person decides the hard cases and a creator can dispute.",
            "We cannot see off-platform activity, and Apple limits how many offer codes can be active, so attribution has tracked and estimated figures that are always labelled apart.",
            "Targets in the Trust Center are hypotheses we hold ourselves to, not guarantees.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span aria-hidden="true" className={cn("mt-2.5 size-1.5 shrink-0 rounded-full bg-sun-solid")} />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-fg-muted">
          Questions about any of this? Read the{" "}
          <Link href="/trust" className="font-semibold text-accent underline underline-offset-4">
            Trust Center
          </Link>{" "}
          or write to hello@joinflowd.io.
        </p>
      </GlassCard>
    </PageSection>
  );
}
