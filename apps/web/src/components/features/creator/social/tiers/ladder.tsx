import { Check, Lock } from "lucide-react";
import { TierBadge, TIER_LABEL } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge } from "@/components/ui";
import type { TierRow } from "@/lib/data/selectors";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/contract/types";

function Need({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-body-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold text-fg tabular-nums">{value}</dd>
    </div>
  );
}

function LadderCard({ row, nextTier }: { row: TierRow; nextTier: Tier | null }) {
  const isNext = row.tier === nextTier;
  const bronze = row.tier === "bronze";
  return (
    <li className="grid">
      <GlassCard
        padding="md"
        className={cn(
          "grid h-full content-start gap-4",
          row.current && "shadow-[inset_0_0_0_2px_var(--fd-accent-bright)]",
          isNext && "shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--fd-accent-bright)_55%,transparent)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <TierBadge tier={row.tier} size={56} decorative />
          {row.current ? (
            <Badge tone="accent" size="md">
              You are here
            </Badge>
          ) : row.reached ? (
            <Badge tone="mint" size="md" icon={<Check />}>
              Reached
            </Badge>
          ) : isNext ? (
            <Badge tone="accent" variant="outline" size="md">
              Next
            </Badge>
          ) : (
            <Badge tone="neutral" size="md" icon={<Lock />}>
              Locked
            </Badge>
          )}
        </div>
        <h3 className="font-display text-title-md text-fg">{TIER_LABEL[row.tier]}</h3>
        {bronze ? (
          <p className="text-body-sm text-fg-muted">Everyone starts here, with full access to open bounties.</p>
        ) : (
          <dl className="grid gap-1.5">
            <Need label="Lifetime cleared" value={formatMoney(row.needs.cleared_cents, { cents: "never" })} />
            <Need label="Approved posts" value={String(row.needs.approved)} />
            <Need label="Approval rate" value={formatPct(row.needs.approval_rate, 0)} />
            {row.needs.reliability > 0 ? <Need label="Reliability" value={String(row.needs.reliability)} /> : null}
            {row.needs.manual_review ? <Need label="Review" value="By flowd" /> : null}
          </dl>
        )}
        <ul className="grid gap-1.5 border-t border-divider pt-3 md:hidden">
          {row.perks.length > 0 ? (
            row.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-body-sm text-fg-muted">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" />
                {perk}
              </li>
            ))
          ) : (
            <li className="text-body-sm text-fg-subtle">Open bounties, weekly payouts and the Academy.</li>
          )}
        </ul>
      </GlassCard>
    </li>
  );
}

/** Bronze to Elite as five cards: the thresholds in numbers, with you marked and the next step outlined. Perks live in the matrix below on wide screens and in the cards on phones. */
export function Ladder({ rows, next }: { rows: readonly TierRow[]; next: Tier | null }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {rows.map((row) => (
        <LadderCard key={row.tier} row={row} nextTier={next} />
      ))}
    </ol>
  );
}
