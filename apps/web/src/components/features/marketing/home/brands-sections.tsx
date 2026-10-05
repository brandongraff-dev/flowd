import Link from "next/link";
import { ArrowRight, Check, Code2, Link2, Gift, MessageSquareText, ShieldCheck, Tag, TicketPercent, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONSTANTS } from "@/lib/engine";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { DemoTag } from "@/components/shell/demo-banner";
import { ReviewPhone } from "./studio-phone";

const SOURCES = [
  { icon: Link2, title: "Tracked link", body: "joinflowd.io/r/<code> opens your App Store page with the creator and bounty carried through a deferred link.", tag: "tracked" },
  { icon: TicketPercent, title: "Promo-code pool", body: "Apple allows 10 active offer codes per subscription, so flowd rotates a pool and always falls back to the link.", tag: "tracked" },
  { icon: Webhook, title: "Attribution partner (planned)", body: "Adapters for AppsFlyer, Adjust and Branch are on the roadmap. They would add reported installs and revenue next to your own.", tag: "estimated" },
  { icon: MessageSquareText, title: "Survey", body: "A \"how did you hear about us?\" answer, kept as context. It never decides who gets paid.", tag: "estimated" },
] as const;

/**
 * The Attribution Kit as a diagram: four ways a conversion can be tied to a video on the left, the RevenueCat webhook and SDK attributes that match them
 * in the middle, and on the right what happens to each kind. Only a link or a code is deterministic, so only those pay a bonus; the rest are shown,
 * labelled Estimated, and never paid.
 */
export function AttributionDiagram() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)] lg:items-stretch">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {SOURCES.map((source) => (
          <li key={source.title}>
            <GlassCard padding="none" className="flex h-full items-start gap-4 rounded-[24px] p-5">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                <source.icon />
              </span>
              <span className="grid gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <h3 className="text-body font-semibold text-fg">{source.title}</h3>
                  <Badge size="sm" tone={source.tag === "tracked" ? "info" : "neutral"} variant="outline">
                    {source.tag === "tracked" ? "Tracked" : "Estimated"}
                  </Badge>
                </span>
                <span className="text-body-sm text-pretty text-fg-muted">{source.body}</span>
              </span>
            </GlassCard>
          </li>
        ))}
      </ul>

      <GlassCard padding="none" className="grid content-center justify-items-center gap-3 rounded-[28px] p-6 text-center">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-surface-active text-fg [&_svg]:size-6 [&_svg]:stroke-[1.75]">
          <Code2 />
        </span>
        <h3 className="text-title-sm text-fg">RevenueCat webhook and SDK attributes</h3>
        <p className="text-body-sm text-pretty text-fg-muted">
          A signed webhook brings in trials, conversions, renewals and refunds. The SDK writes the creator and bounty onto the subscriber on first launch, so a later refund still reaches the right video.
        </p>
        <p className="text-caption text-fg-subtle">Built to set up in under ten minutes, and a test event shows Tracked within a minute.</p>
      </GlassCard>

      <div className="grid gap-3">
        <GlassCard padding="none" className="grid content-start gap-2 rounded-[24px] bg-mint-soft p-5">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
            <Check aria-hidden="true" className="size-4 text-mint" strokeWidth={3} />
            Tracked: link or code
          </p>
          <p className="text-body-sm text-pretty text-fg-muted">Counts in the funnel and in ROAS, and pays the creator&apos;s install, trial and paid bonuses after their clearing windows.</p>
        </GlassCard>
        <GlassCard padding="none" className="grid content-start gap-2 rounded-[24px] p-5">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
            <Tag aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={2} />
            Estimated: partner, survey, model
          </p>
          <p className="text-body-sm text-pretty text-fg-muted">Shown for context with its label and a hatched bar. Never paid, never styled like a tracked result.</p>
        </GlassCard>
        <p className="text-caption text-fg-subtle">
          Windows: installs clear after {CONSTANTS.windows.cpa_clear_hours.install} hours, trials after {CONSTANTS.windows.cpa_clear_hours.trial}, paid subscriptions after {CONSTANTS.windows.cpa_clear_hours.paid}, inside a {CONSTANTS.pay.cpa_window_days}-day attribution window.
        </p>
      </div>
    </div>
  );
}

const BUILDER_STEPS = [
  { title: "Link", body: "Paste your App Store link. flowd reads the name, category and price points and draws a generated icon." },
  { title: "Brief", body: "Flo drafts three must-say beats, do's and don'ts, ten hooks and ranked formats. Edit anything inline. Brief Lint runs on every edit." },
  { title: "Pay", body: "Set the CPM, the bonuses and the cap. A price suggestion shows its fill time and confidence, and Pay Math shows median creator pay and your all-in CPM." },
  { title: "Fund", body: "Escrow the pool. A first bounty shows the fee waived and up to $500 matched. Go live stays off until it is Funded, and says how much is missing." },
] as const;

/** The AI bounty builder in four steps. */
export function BuilderSteps() {
  return (
    <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {BUILDER_STEPS.map((step, index) => (
        <li key={step.title}>
          <GlassCard padding="none" className="grid h-full content-start gap-3 rounded-[28px] p-6">
            <span aria-hidden="true" className="font-display text-figure-lg text-fg-subtle tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-title-md text-fg">{step.title}</h3>
            <p className="text-body-sm text-pretty text-fg-muted">{step.body}</p>
          </GlassCard>
        </li>
      ))}
    </ol>
  );
}

/** The review queue: keyboard-first, timecoded, with guarded auto-approve, shown beside a phone mock-up of one submission. */
export function ReviewSection() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
      <div className="grid gap-4">
        <ul className="grid gap-3">
          {[
            ["A deadline on every decision", `Each submission shows when you decide by, ${CONSTANTS.review.sla_hours} hours from submit. The clock turns amber at ${CONSTANTS.review.stale_after_hours}.`],
            ["Feedback pinned to the frame", "Press C to comment at the current frame, I and O to mark a range. Must-fix notes carry into the next version and the creator ticks them off."],
            ["Evidence before you decide", "A checklist score, fraud evidence with the rules that fired, the disclosure and music checks, and a duplicate match if there is one."],
            ["Two revisions, one appeal", "Two rounds are included. A rejection needs a reason code linked to the brief and at least one piece of evidence."],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="grid gap-0.5">
                <span className="text-body-sm font-semibold text-fg">{title}</span>
                <span className="text-body-sm text-pretty text-fg-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>

        <GlassCard padding="none" className="grid gap-3 rounded-[24px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-title-sm text-fg">Guarded auto-approve</h3>
            <span className="flex items-center gap-2">
              <Badge size="sm" tone="neutral" variant="outline">
                Example
              </Badge>
              <DemoTag>Demo data</DemoTag>
            </span>
          </div>
          <p className="text-body-sm text-pretty text-fg-muted">
            Before a rule can switch on, it runs on your last {CONSTANTS.auto_approve.dry_run_sample} submissions: <strong className="font-semibold text-fg">&quot;would have approved 31 of the last 50&quot;</strong>. First-time creators always go to a person, a random{" "}
            {Math.round(CONSTANTS.auto_approve.spot_check_ratio * 100)}% is spot-checked, any fraud flag or clawback pauses the rule, and one click kills it. It applies to organic posting only, never to paid-ad rights.
          </p>
        </GlassCard>
      </div>
      <ReviewPhone width={290} />
    </div>
  );
}

/** Rights Vault, API and MCP, and a matched first bounty: the things a team grows into. */
export function GrowthCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassCard padding="lg" className="grid content-start gap-4 rounded-[28px]">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          <ShieldCheck />
        </span>
        <h3 className="text-title-md text-fg">Rights Vault</h3>
        <p className="text-body-sm text-pretty text-fg-muted">Every licence in one place, by expiry. Alerts at 30, 14 and 7 days, renewals priced up front at a quarter of the base fee per 30 days, and Spark and partnership codes recorded with their term.</p>
        <ul className="grid gap-2 text-caption text-fg-muted">
          <li className="flex items-center justify-between rounded-xl bg-surface-field px-3 py-2 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span>Paid-ad rights, Nap Nest hook</span>
            <span className="font-semibold text-fg tabular-nums">12 days left</span>
          </li>
          <li className="flex items-center justify-between rounded-xl bg-surface-field px-3 py-2 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span>Spark code, 30-day term</span>
            <span className="font-semibold text-fg tabular-nums">Ends Nov 4</span>
          </li>
          <li className="text-micro text-fg-subtle">Example</li>
        </ul>
      </GlassCard>

      <GlassCard padding="lg" className="grid content-start gap-4 rounded-[28px]">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          <Code2 />
        </span>
        <h3 className="text-title-md text-fg">API, webhooks and MCP</h3>
        <p className="text-body-sm text-pretty text-fg-muted">The whole bounty lifecycle, including approve and reject and settlement webhooks. Keys have read, write or financial scopes, and anything created by a key is a draft until a person approves it.</p>
        <div className="rounded-2xl bg-bg-sunken p-4 font-mono text-code text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-fg">&gt; Launch a $500 bounty for Nap Nest.</p>
          <p className="mt-2">Drafted &quot;Wind-down routine hook&quot;: $2.40 CPM, $250 cap, $500 pool. Waiting for your approval to fund.</p>
        </div>
        <Link href="/developers" className={cn(buttonVariants({ variant: "secondary" }), "w-fit")}>
          For developers
        </Link>
      </GlassCard>

      <GlassCard padding="lg" className="grid content-start gap-4 rounded-[28px]">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-mint-soft text-mint [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          <Gift />
        </span>
        <h3 className="text-title-md text-fg">Your first bounty, matched</h3>
        <p className="text-body-sm text-pretty text-fg-muted">The platform fee is waived on your first bounty and flowd matches what you fund up to $500. Fund $5,000 and the pool is $5,500, with a Funded badge and an escrow you can watch.</p>
        <p className="text-caption text-fg-subtle">Design-partner programme. Creators are never charged a fee, and you only pay for what clears.</p>
        <Link href="/signup/brand" className={cn(buttonVariants({ variant: "primary" }), "w-fit")}>
          Start a bounty
          <ArrowRight aria-hidden="true" />
        </Link>
      </GlassCard>
    </div>
  );
}

/** Proof you can check yourself, instead of logos: public pages that need no account. */
export function ProofLinks() {
  const items = [
    { href: "/market", title: "The live Market", body: "Clearing CPMs by category with the median beside the middle half." },
    { href: "/promise", title: "The flowd Promise", body: "Eleven commitments, each with a public proof metric from the ledger." },
    { href: "/scorecard/br_lumi", title: "A public Brand Scorecard", body: "Pay speed, decision time and fairness, shown to creators before they join." },
    { href: "/compare", title: "An honest comparison", body: "Dated facts, tagged verified or reported, with where others are better." },
  ] as const;
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="group grid h-full content-start gap-1.5 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[background-color,box-shadow] duration-(--fd-dur-fast) hover:bg-surface-hover hover:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]">
              <span className="flex items-center justify-between gap-2 text-body-sm font-semibold text-fg">
                {item.title}
                <ArrowRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) group-hover:translate-x-0.5" strokeWidth={1.75} />
              </span>
              <span className="text-caption text-fg-muted">{item.body}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-caption max-w-[72ch] text-fg-subtle">
        We do not show customer logos or case studies yet, because there are none we have permission to name. When there are, they will say &quot;App X: 2M views, 4,000 trials, $Y&quot; with the real numbers, and only with the team&apos;s agreement.
      </p>
    </div>
  );
}

/**
 * A live bounty at a glance, for the brands page hero: the Funded badge, where the pool is (spent, reserved, remaining: they add up to what was funded),
 * and the funnel numbers with their Tracked label. An illustration with example numbers, and it says so.
 */
export function BountyOverviewCard() {
  const pool = 1_000_000;
  const parts = [
    { label: "Paid out", cents: 854_000, className: "bg-[var(--fd-chart-1)]" },
    { label: "Reserved for pending posts", cents: 62_000, className: "bg-[var(--fd-chart-2)]" },
    { label: "Remaining", cents: 84_000, className: "bg-surface-active" },
  ] as const;
  const money = (cents: number): string => `$${(cents / 100).toLocaleString("en-US")}`;

  return (
    <GlassCard padding="none" className="mx-auto grid w-full max-w-[30rem] gap-6 rounded-[32px] p-7 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="fd-eyebrow text-fg-subtle">Live bounty</p>
          <h3 className="text-title-md text-fg">Wind-down routine hook</h3>
          <p className="text-caption text-fg-muted">Nap Nest &middot; $2.40 per 1,000 views &middot; $1.50 per trial</p>
        </div>
        <Badge tone="mint" size="lg" icon={<ShieldCheck />}>
          Funded
        </Badge>
      </div>

      <div className="grid gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body-sm font-semibold text-fg">Pool {money(pool)}</p>
          <p className="text-caption text-fg-subtle">funded = reserved + spent + remaining</p>
        </div>
        <div className="flex h-3 w-full gap-0.5" role="img" aria-label={`Pool of ${money(pool)}: ${parts.map((part) => `${part.label} ${money(part.cents)}`).join(", ")}`}>
          {parts.map((part) => (
            <span key={part.label} className={cn("h-full first:rounded-l-full last:rounded-r-full", part.className)} style={{ flexBasis: `${(part.cents / pool) * 100}%` }} />
          ))}
        </div>
        <ul className="grid gap-1.5 text-caption text-fg-muted">
          {parts.map((part) => (
            <li key={part.label} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[3px]", part.className)} />
              {part.label}
              <span className="ml-auto font-semibold text-fg tabular-nums">{money(part.cents)}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Posts", "214", null],
          ["Installs", "3,310", "Tracked"],
          ["Per install", "$2.58", "All-in"],
        ].map(([label, value, tag]) => (
          <div key={label} className="grid content-start gap-1 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <dt className="text-caption font-medium text-fg-muted">{label}</dt>
            <dd className="font-display text-figure-lg text-fg tabular-nums">{value}</dd>
            {tag ? (
              <dd>
                <Badge size="sm" tone="info" variant="outline">
                  {tag}
                </Badge>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-fg-subtle">
        <Badge size="sm" tone="neutral" variant="outline">
          Example
        </Badge>
        An illustration with example numbers.
      </p>
    </GlassCard>
  );
}
