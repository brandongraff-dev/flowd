import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { ArtAvatar } from "@/components/brand/avatar";
import { TierBadge } from "@/components/brand/tier-badge";
import { Money } from "@/components/ui/money";
import { DemoTag } from "@/components/shell/demo-banner";
import type { LeaderboardPageData } from "./leaderboard-data";

/** The top three of the all-niche earnings board as a podium, with the typical creator's figure under it so the best week is never the only number. */
export function LeaderboardHero({ data }: { data: LeaderboardPageData }) {
  const top = data.boards["earnings:all"]?.rows.slice(0, 3) ?? [];
  // Silver left, gold centre, bronze right: the podium reads in rank order from the middle out.
  const order = [top[1], top[0], top[2]].filter((row): row is NonNullable<typeof row> => row !== undefined);
  const height: Record<number, string> = { 1: "min-h-[10.5rem]", 2: "min-h-[8.5rem]", 3: "min-h-[7.5rem]" };
  return (
    <GlassCard padding="lg" className="mx-auto grid w-full max-w-[34rem] gap-6 lg:ml-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="fd-eyebrow text-fg-subtle">All niches · earnings</p>
        <DemoTag />
      </div>
      <ol aria-label="Top three creators this week" className="grid grid-cols-3 items-end gap-3">
        {order.map((row) => (
          <li key={row.handle}>
            <Link
              href={`/c/${row.handle}`}
              className={cn(
                "grid content-end justify-items-center gap-2 rounded-2xl bg-surface-field p-3 text-center shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover",
                height[row.rank],
              )}
            >
              <span className="fd-figure text-figure-md text-fg">{row.rank}</span>
              <ArtAvatar art={row.art} name={`@${row.handle}`} size={row.rank === 1 ? 56 : 44} decorative />
              <span className="max-w-full truncate text-caption font-semibold text-fg">@{row.handle}</span>
              <TierBadge tier={row.tier} size={20} />
              <Money cents={row.value} state="cleared" size="sm" />
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-caption text-fg-subtle">
        The typical creator cleared <span className="font-semibold text-fg-muted">{formatMoney(data.typical.typicalCents)}</span> in the last {data.typical.period}. Boards show the best weeks, not the usual one.
      </p>
    </GlassCard>
  );
}
