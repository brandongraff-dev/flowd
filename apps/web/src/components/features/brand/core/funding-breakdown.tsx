import { Lock } from "lucide-react";
import { formatMoney, type Funding } from "@/lib/engine";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FundingBreakdownProps {
  funding: Funding;
  /** The first bounty has no platform fee and flowd matches part of the pool. */
  firstBounty: boolean;
  /** What the wallet can spend now (balance less sealed-bid holds). When given, the breakdown ends with whether it covers the bounty. */
  walletAvailableCents?: number;
  className?: string;
}

/**
 * Exactly what funding a bounty costs, line by line: the creator pool, the platform fee held with it (or waived on a first bounty), flowd's match,
 * what leaves your wallet and what sits in escrow. The numbers are the engine's `funding()`, the same ones the Go live action uses, so the page
 * can never promise a different figure than the ledger writes. Server-renderable.
 */
export function FundingBreakdown({ funding, firstBounty, walletAvailableCents, className }: FundingBreakdownProps) {
  const feeWaived = firstBounty && funding.fee_reserve_cents === 0;
  const short = walletAvailableCents === undefined ? 0 : Math.max(0, funding.brand_funded_cents - walletAvailableCents);
  return (
    <dl className={cn("grid gap-2.5 rounded-[20px] bg-surface-field p-4 text-body-sm shadow-[inset_0_0_0_1px_var(--fd-rim)]", className)}>
      <Row label="Creator pool" hint="Paid out for verified views and tracked results" value={formatMoney(funding.budget_cents)} />
      <Row
        label={feeWaived ? "Platform fee, waived on your first bounty" : `Platform fee, ${formatPct(funding.take_rate, funding.take_rate * 100 % 1 === 0 ? 0 : 1)}`}
        hint={feeWaived ? undefined : "Held in escrow with the pool; unused fee returns with the unspent pool"}
        value={formatMoney(funding.fee_reserve_cents)}
      />
      {funding.matched_cents > 0 ? <Row label="Matched by flowd" hint="Your first bounty, up to $500" value={`−${formatMoney(funding.matched_cents)}`} tone="match" /> : null}
      <div className="grid gap-2.5 border-t border-divider pt-3">
        <Row label="Leaves your wallet" value={formatMoney(funding.brand_funded_cents)} strong />
        <p className="flex items-center gap-2 text-caption text-fg-subtle">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.9} />
          <span>
            {formatMoney(funding.escrow_total_cents)} sits in escrow once funded. It is released only for verified views and tracked results, and what is unused comes back.
          </span>
        </p>
      </div>
      {walletAvailableCents !== undefined ? (
        <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-3.5 py-2.5", short > 0 ? "bg-ember-soft" : "bg-mint-soft")}>
          <span className="font-medium text-fg">{short > 0 ? `Needs ${formatMoney(short)} more in the wallet` : "Your wallet covers it"}</span>
          <span className="text-caption text-fg-muted tabular-nums">Wallet {formatMoney(walletAvailableCents)}</span>
        </div>
      ) : null}
    </dl>
  );
}

function Row({ label, hint, value, strong, tone }: { label: string; hint?: string | undefined; value: string; strong?: boolean; tone?: "match" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="grid min-w-0 gap-0.5">
        <span className={cn(strong ? "font-semibold text-fg" : "text-fg-muted")}>{label}</span>
        {hint ? <span className="text-caption text-fg-subtle">{hint}</span> : null}
      </dt>
      <dd className={cn("shrink-0 tabular-nums", strong ? "font-display text-title-sm text-fg" : "font-semibold text-fg", tone === "match" && "text-mint")}>{value}</dd>
    </div>
  );
}
