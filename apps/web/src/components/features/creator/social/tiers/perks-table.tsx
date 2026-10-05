import { Check, Minus } from "lucide-react";
import { TierBadge, TIER_LABEL, TIER_ORDER } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import type { Tier } from "@/lib/contract/types";
import { cn } from "@/lib/utils";
import { PERK_ROWS, perksOf } from "./perks";

/**
 * The perk matrix. A real table (row and column headers, one caption) for wide screens; phones read the same facts in each ladder
 * card. Your tier's column is outlined, and a missing perk is a dash with a spoken "Not included", never an empty cell.
 */
export function PerksTable({ current }: { current: Tier }) {
  return (
    <GlassCard padding="md" className="hidden md:block">
      <table className="w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Perks by tier</caption>
        <thead>
          <tr>
            <th scope="col" className="pb-3 pl-2 text-micro font-semibold tracking-wide text-fg-subtle uppercase">
              Perk
            </th>
            {TIER_ORDER.map((tier) => (
              <th key={tier} scope="col" className={cn("px-3 pb-3 text-center", tier === current && "rounded-t-xl bg-accent-soft")}>
                <span className="inline-flex items-center gap-2 text-body-sm font-semibold text-fg">
                  <TierBadge tier={tier} size={24} decorative />
                  {TIER_LABEL[tier]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERK_ROWS.map((row, index) => {
            const last = index === PERK_ROWS.length - 1;
            return (
              <tr key={row.id}>
                <th scope="row" className="border-t border-divider py-3.5 pr-4 pl-2 align-top">
                  <span className="block text-body-sm font-semibold text-fg">{row.label}</span>
                  <span className="block max-w-[34ch] text-caption font-normal text-fg-subtle">{row.hint}</span>
                </th>
                {TIER_ORDER.map((tier) => {
                  const value = row.value(perksOf(tier));
                  return (
                    <td key={tier} className={cn("border-t border-divider px-3 py-3.5 text-center align-middle", tier === current && "bg-accent-soft", tier === current && last && "rounded-b-xl")}>
                      {value ? (
                        <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-fg tabular-nums">
                          {value === "Included" ? <Check aria-hidden="true" className="size-4 text-mint" /> : null}
                          {value}
                        </span>
                      ) : (
                        <span className="inline-flex text-fg-subtle">
                          <Minus aria-hidden="true" className="size-4" />
                          <span className="sr-only">Not included</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassCard>
  );
}
