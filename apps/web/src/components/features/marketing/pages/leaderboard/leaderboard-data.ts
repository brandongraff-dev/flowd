import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectMedianEarnings } from "@/lib/data/selectors";
import { valuesOf } from "@/lib/data/select";
import { NICHES, NICHE_META, type LeaderboardMetric, type Niche, type Tier } from "@/lib/contract/types";
import { CONSTANTS } from "@/lib/engine";
import type { ArtSeed } from "@/components/brand/art";

export interface BoardRow {
  rank: number;
  /** Change since last week: positive moved up. */
  delta: number;
  handle: string;
  name: string;
  tier: Tier;
  art: ArtSeed;
  /** Cents for earnings, installs per 1,000 verified views for conversion rate, a 0 to 1 ratio for score accuracy. */
  value: number;
}

export interface Board {
  label: string;
  /** Creators ranked on the whole board (the page shows the top 20). */
  size: number;
  rows: readonly BoardRow[];
}

export interface LeaderboardPageData {
  /** ISO week label, "2026-W40". */
  week: string;
  resetAt: string;
  /** Boards by `<metric>:<niche or "all">`. A missing key means no board exists for that pair this week. */
  boards: Readonly<Record<string, Board>>;
  niches: ReadonlyArray<{ niche: Niche; label: string }>;
  typical: { typicalCents: number; p25Cents: number; p75Cents: number; topDecileCents: number; period: string; activeCreators: number };
  /** Creators who chose to hide from leaderboards (Wellbeing Mode). They are not ranked or shown. */
  hiddenCount: number;
  cohortTarget: number;
  boardSize: number;
}

export const TOP_N = 20;

/** The public weekly boards: the latest week's global and niche boards, the top 20 of each, with the typical creator's figure to hold them against. */
export const getLeaderboardData = cache(async (): Promise<LeaderboardPageData> => {
  const db = await getServerState();
  const all = valuesOf(db.leaderboards).filter((board) => board.scope !== "cohort");
  const week = all.map((board) => board.iso_week).sort().pop() ?? "";
  const current = all.filter((board) => board.iso_week === week);

  const boards: Record<string, Board> = {};
  for (const board of current) {
    const key = `${board.metric satisfies LeaderboardMetric}:${board.scope === "global" ? "all" : (board.niche ?? "all")}`;
    const rows: BoardRow[] = [];
    for (const entry of board.entries) {
      const creator = db.creators[entry.creator_id];
      if (!creator) continue;
      rows.push({ rank: entry.rank, delta: entry.delta_rank, handle: creator.handle, name: creator.display_name, tier: creator.tier, art: creator.avatar, value: entry.value });
      if (rows.length === TOP_N) break;
    }
    boards[key] = { label: board.label, size: board.cohort_size, rows };
  }

  const median = selectMedianEarnings(db);
  const hiddenCount = valuesOf(db.wellbeing_settings).filter((setting) => setting.leaderboard_opt_out).length;
  const resetAt = current[0]?.reset_at ?? "";

  return {
    week,
    resetAt,
    boards,
    niches: NICHES.filter((niche) => Object.keys(boards).some((key) => key.endsWith(`:${niche}`))).map((niche) => ({ niche, label: NICHE_META[niche].label })),
    typical: { typicalCents: median.typical_cents, p25Cents: median.p25_cents, p75Cents: median.p75_cents, topDecileCents: median.top_decile_cents, period: median.period, activeCreators: median.active_creators_30d },
    hiddenCount,
    cohortTarget: CONSTANTS.leaderboards.cohort_target_size,
    boardSize: CONSTANTS.leaderboards.global_board_size,
  };
});
