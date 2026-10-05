import Link from "next/link";
import { ArrowRight, CircleHelp, FileWarning, Hourglass, MessageSquareOff, ScanSearch, ShieldAlert, type LucideIcon } from "lucide-react";
import type { PromiseMetric } from "@/lib/contract/types";
import { GlassCard } from "@/components/glass/glass";
import { DemoTag } from "@/components/shell/demo-banner";
import { PROMISES } from "./promise-data";

interface Pain {
  icon: LucideIcon;
  label: string;
  audience: "Creators" | "App teams";
  report: string;
  answer: string;
  body: string;
  /** Which Promise number's live metric backs the answer (none for the attribution kit). */
  promise?: number;
  href: string;
}

const PAINS: readonly Pain[] = [
  {
    icon: Hourglass,
    label: "Payout limbo",
    audience: "Creators",
    report: "Balances sit as \"upcoming\" for weeks. On open-pool apps creators report about ten days from approval to settled, with no date to plan around.",
    answer: "Money Clock",
    body: "Every earning shows pending, cleared or paid with a dated ETA and a named reason for any delay. Friday payouts are free.",
    promise: 1,
    href: "/creators#money-clock",
  },
  {
    icon: MessageSquareOff,
    label: "Rejections without reasons",
    audience: "Creators",
    report: "Clips rejected after they already had views, with no reason given, and approved videos that never run. Brands go quiet and reputation runs one way.",
    answer: "No-Rug Approvals",
    body: "A decision in 72 hours, a reason code and evidence on every rejection, timecoded feedback, two free revisions and one appeal. Brands carry a public scorecard too.",
    promise: 3,
    href: "/brands#review",
  },
  {
    icon: ScanSearch,
    label: "View disputes",
    audience: "Creators",
    report: "On per-view deals you cannot see the real numbers, so you cannot check what you are owed. Bot flags tend to land close to payout day.",
    answer: "View Ledger",
    body: "Hourly snapshots per post, a traffic-source split and the named cause of every removed view, with a one-tap dispute that never blocks undisputed money.",
    promise: 5,
    href: "/trust",
  },
  {
    icon: FileWarning,
    label: "Rights traps",
    audience: "Creators",
    report: "Perpetual usage rights tucked inside a flat $200 deal. In one creator's tally of 24 deals that went sideways, 8 were about usage rights.",
    answer: "Rights Card and Brief Lint",
    body: "A plain-language licence on every bounty, perpetual terms blocked at publish, and paid use as a priced, dated term with expiry alerts.",
    promise: 6,
    href: "/creators#safety",
  },
  {
    icon: ShieldAlert,
    label: "Scam risk",
    audience: "Creators",
    report: "Pay-to-join offers, fake brand emails and \"stop filming before the deposit lands\". Course sellers exploit hope.",
    answer: "Scam Shield and the Funded badge",
    body: "In-app chat only, no pay-to-join, verified brands, a Funded badge only on fully escrowed bounties, and a report flow that a person reads.",
    promise: 9,
    href: "/creators#safety",
  },
  {
    icon: CircleHelp,
    label: "No attribution to installs",
    audience: "App teams",
    report: "Marketplaces we reviewed track views or store orders. We could not find one that documents paying creators for installs, trials or paid subscriptions.",
    answer: "Attribution Kit",
    body: "A deferred link, a promo-code pool, a RevenueCat webhook and a survey. Every conversion is labelled Tracked or Estimated, and only tracked ones pay.",
    href: "/brands#attribution",
  },
];

/**
 * "Built from what creators and app teams complain about": six pains paired with the Promise feature that answers each. The pains are paraphrased from public
 * documentation, app-store reviews and creator forums read in 2026 (no named company, no quote presented as a customer), and each answer shows the live proof
 * metric from the ledger where one exists. Nothing here is a testimonial.
 */
export function PainPromise({ metrics }: { metrics: readonly PromiseMetric[] }) {
  const byNumber = new Map(metrics.map((metric) => [metric.number, metric]));
  return (
    <div className="grid gap-6">
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PAINS.map((pain) => {
          const metric = pain.promise ? byNumber.get(pain.promise) : undefined;
          const Icon = pain.icon;
          return (
            <li key={pain.label}>
              <GlassCard padding="none" className="grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-[28px]">
                <div className="grid content-start gap-3 p-6 lg:min-h-[11.5rem]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2.5 text-body-sm font-semibold text-fg">
                      <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-surface-active text-fg-muted [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">
                        <Icon />
                      </span>
                      {pain.label}
                    </span>
                    <span className="fd-eyebrow text-fg-subtle">{pain.audience}</span>
                  </div>
                  <p className="text-body-sm text-pretty text-fg-muted">{pain.report}</p>
                </div>
                <div className="grid content-start gap-3 border-t border-divider bg-accent-soft p-6">
                  <p className="fd-eyebrow text-accent">flowd answers with</p>
                  <h3 className="text-title-sm text-fg">{pain.answer}</h3>
                  <p className="text-body-sm text-pretty text-fg-muted">{pain.body}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    {metric ? (
                      <p className="text-caption font-medium text-fg">
                        <span className="text-mint tabular-nums">{metric.display}</span>
                      </p>
                    ) : (
                      <p className="text-caption text-fg-subtle">Tracked and Estimated are never mixed.</p>
                    )}
                    <Link href={pain.href} className="inline-flex min-h-8 items-center gap-1 text-body-sm font-semibold text-accent hover:underline pointer-coarse:min-h-11">
                      See how
                      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </Link>
                  </div>
                </div>
              </GlassCard>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-fg-subtle">
        <DemoTag>Demo data</DemoTag>
        Live figures are computed from the demo ledger. The pains are paraphrased from public documentation, app-store reviews and creator forums read in 2026.
      </p>
    </div>
  );
}

/** All 11 commitments as a compact grid of links to the Promise page. */
export function PromiseStrip({ metrics }: { metrics: readonly PromiseMetric[] }) {
  const byNumber = new Map(metrics.map((metric) => [metric.number, metric]));
  return (
    <div className="grid gap-5">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PROMISES.map((promise) => (
          <li key={promise.number}>
            <Link
              href={`/promise#promise-${promise.number}`}
              className="group flex h-full min-h-16 items-center gap-3 rounded-2xl bg-surface-field px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[background-color,box-shadow] duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]"
            >
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-body-sm font-bold text-accent tabular-nums">
                {promise.number}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-body-sm font-semibold text-fg">{promise.title}</span>
                <span className="line-clamp-2 text-caption text-fg-subtle tabular-nums">{byNumber.get(promise.number)?.display ?? "Live proof on the Promise page"}</span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/promise" className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-accent-solid px-4 py-3 text-on-accent transition-transform duration-(--fd-dur-fast) active:scale-[0.97]">
            <span className="grid gap-0.5">
              <span className="text-body-sm font-semibold">Read the full Promise</span>
              <span className="text-caption opacity-85">What happens if we miss one</span>
            </span>
            <ArrowRight aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
          </Link>
        </li>
      </ol>
    </div>
  );
}
