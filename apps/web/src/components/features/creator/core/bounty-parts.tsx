"use client";

import { Clock, Lock, ShieldCheck, Zap } from "lucide-react";
import type { RightsCard } from "@/lib/contract/types";
import { formatCpm, formatMoney } from "@/lib/format";
import type { BountyView } from "@/lib/data/selectors";
import { cn } from "@/lib/utils";
import { Badge, Progress } from "@/components/ui";

/**
 * The headline of the pay and everything stacked on it, short enough for a card cover: "$2.00 per 1,000 views" and "+ $0.40 install, $1.50 trial, $4 paid".
 * An install-only or outcome bounty leads with its first outcome rate.
 */
export function payParts(bounty: Pick<BountyView, "cpm_cents" | "cpa_install_cents" | "cpa_trial_cents" | "cpa_paid_cents" | "flat_fee_cents">): { headline: string; extras: string } {
  const outcomes: string[] = [];
  if (bounty.cpa_install_cents > 0) outcomes.push(`${formatMoney(bounty.cpa_install_cents, { cents: "auto" })} install`);
  if (bounty.cpa_trial_cents > 0) outcomes.push(`${formatMoney(bounty.cpa_trial_cents, { cents: "auto" })} trial`);
  if (bounty.cpa_paid_cents > 0) outcomes.push(`${formatMoney(bounty.cpa_paid_cents, { cents: "auto" })} paid`);
  if (bounty.flat_fee_cents > 0) return { headline: `${formatMoney(bounty.flat_fee_cents, { cents: "auto" })} flat per video`, extras: bounty.cpm_cents > 0 ? `+ ${formatCpm(bounty.cpm_cents, "long")}` : "" };
  if (bounty.cpm_cents > 0) return { headline: formatCpm(bounty.cpm_cents, "long"), extras: outcomes.length > 0 ? `+ ${outcomes.join(", ")}` : "" };
  const [first, ...rest] = outcomes;
  return { headline: first ? `${first.replace(" ", " per ")}` : "Pay set by the brief", extras: rest.length > 0 ? `+ ${rest.join(", ")}` : "" };
}

/** Pay-structure badges: CPM, CPA and install-only are labelled so nobody opens a bounty to find out how it pays. */
export function PayTypeBadge({ type, className }: { type: BountyView["type"]; className?: string }) {
  const label = type === "cpm" ? "Views (CPM)" : type === "cpa" ? "Outcomes (CPA)" : type === "install_only" ? "Install-only" : type === "stacked" ? "Views + outcomes" : "Flat fee";
  return (
    <Badge tone="neutral" size="md" className={className}>
      {label}
    </Badge>
  );
}

/** The Funded badge: shown only for a bounty that is fully escrowed and live. It is the promise, so it is never decorative. */
export function FundedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="mint" size="md" icon={<ShieldCheck aria-hidden="true" />} className={className} title="Fully escrowed. Approved videos are paid even if the pool empties.">
      Funded
    </Badge>
  );
}

/** The pool left as a bar, with the true number of spots (a reserved slot is one per-video cap). */
export function BudgetLeft({ bounty, className }: { bounty: Pick<BountyView, "budget_left_cents" | "escrow_funded_cents" | "fill_ratio" | "spots_left">; className?: string }) {
  const left = Math.max(0, Math.round((1 - bounty.fill_ratio) * 100));
  return (
    <Progress
      className={className}
      size="sm"
      tone={left <= 15 ? "ember" : "mint"}
      value={left}
      aria-label="Pool left"
      valueText={`${formatMoney(bounty.budget_left_cents, { cents: "never" })} left in the pool, ${bounty.spots_left} ${bounty.spots_left === 1 ? "spot" : "spots"}`}
      label={`${formatMoney(bounty.budget_left_cents, { cents: "never" })} left`}
      trailing={`${bounty.spots_left} ${bounty.spots_left === 1 ? "spot" : "spots"}`}
    />
  );
}

/** "Decides in about 11 h": the brand's real median review time from its Scorecard, or an honest "New brand". */
export function DecidesIn({ decides, className }: { decides: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption text-fg-muted", className)}>
      <Clock aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={2} />
      {decides ?? "New brand, no decision history yet"}
    </span>
  );
}

/** The Rights chip's one line: "Organic posting, paid ads 90 days". The full card is on the bounty page. */
export function rightsChipText(card: Pick<RightsCard, "paid_ads_days" | "exclusivity_days" | "ai_likeness">): string {
  const parts = ["Organic posting", card.paid_ads_days > 0 ? `paid ads ${card.paid_ads_days} days` : "no paid ads"];
  if (card.exclusivity_days > 0) parts.push(`${card.exclusivity_days}-day exclusivity`);
  if (card.ai_likeness) parts.push("AI likeness");
  return parts.join(", ");
}

/** One line for the Rights chip ("Organic posting, paid ads 90 days"), always readable beside the card's title. */
export function RightsChip({ summary, className }: { summary: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill bg-surface-field px-2.5 py-1 text-micro font-medium text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]", className)}>
      <ShieldCheck aria-hidden="true" className="size-3 text-fg-subtle" strokeWidth={2} />
      {summary}
    </span>
  );
}

export function LockedBadge({ reason, className }: { reason?: string; className?: string }) {
  return (
    <Badge tone="sun" size="md" icon={<Lock aria-hidden="true" />} className={className} title={reason}>
      Locked
    </Badge>
  );
}

export function EarlyAccessBadge({ className }: { className?: string }) {
  return (
    <Badge tone="ember" size="md" icon={<Zap aria-hidden="true" />} className={className}>
      Early access
    </Badge>
  );
}
