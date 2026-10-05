import { Check } from "lucide-react";
import { CONSTANTS, formatMoney, tierPerks, tierThresholds, TIER_ORDER } from "@/lib/engine";
import { TIER_LABEL, TierBadge } from "@/components/brand/tier-badge";
import { GlassCard } from "@/components/glass/glass";

function perkLines(tier: (typeof TIER_ORDER)[number]): string[] {
  const perks = tierPerks(tier);
  const lines: string[] = [];
  if (perks.early_access_hours > 0) lines.push(`${perks.early_access_hours} hour${perks.early_access_hours === 1 ? "" : "s"} early access to new bounties`);
  if (perks.rate_card) lines.push("Your own rate card");
  if (perks.instant_cashout_unlimited) lines.push("Instant cash-out, no fee");
  else if (perks.instant_cashout_free_per_week > 0) lines.push("One free instant cash-out a week");
  if (perks.crews_lead) lines.push("Lead a Crew");
  if (perks.auctions) lines.push("Enter sealed-bid auctions");
  if (perks.featured_profile) lines.push("Featured profile");
  return lines;
}

/**
 * Bronze to Elite, with the real thresholds from the product's constants. Tiers are earned from cleared money, approved posts, approval rate and
 * reliability, shown everywhere, and never taken away by one bad month: a dip has a 30-day grace period and Pause keeps your tier.
 */
export function TiersStrip() {
  return (
    <div className="grid gap-5">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TIER_ORDER.map((tier) => {
          const need = tierThresholds(tier);
          const lines = perkLines(tier);
          return (
            <li key={tier}>
              <GlassCard padding="none" className="grid h-full content-start gap-4 rounded-[28px] p-5">
                <div className="flex items-center gap-3">
                  <TierBadge tier={tier} size={56} decorative />
                  <div className="grid gap-0.5">
                    <h3 className="text-title-sm text-fg">{TIER_LABEL[tier]}</h3>
                    <p className="text-caption text-fg-subtle tabular-nums">{tier === "bronze" ? "Where everyone starts" : `${formatMoney(need.lifetime_cleared_cents, { cents: "never" })} cleared`}</p>
                  </div>
                </div>
                {tier === "bronze" ? (
                  <p className="text-caption text-fg-muted">Open bounties, Studio, Wallet and the Daily Drop from your first day.</p>
                ) : (
                  <p className="text-caption text-fg-muted tabular-nums">
                    {need.approved_count} approved posts, {Math.round(need.approval_rate_min * 100)}% approval
                    {need.reliability_min > 0 ? `, reliability ${need.reliability_min}+` : ""}
                    {need.manual_review ? ", plus a manual review" : ""}
                  </p>
                )}
                {lines.length > 0 ? (
                  <ul className="grid gap-1.5">
                    {lines.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-caption text-fg">
                        <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-mint" strokeWidth={2.5} />
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </GlassCard>
            </li>
          );
        })}
      </ol>
      <p className="text-caption max-w-[78ch] text-fg-subtle">
        No tier drop for {CONSTANTS.tiers.demotion_grace_days} days after a dip, and Pause keeps your tier and your streak. Perks are a head start and a few conveniences: an open bounty pays the same rate whatever your tier.
      </p>
    </div>
  );
}
