import type { TournamentView } from "@/lib/data/selectors";
import { formatCountdown, formatDate } from "@/lib/format";

/** One dated sentence about where a tournament is in its life. Never a bare "soon". */
export function whenLine(t: Pick<TournamentView, "status" | "hours_to_start" | "hours_to_end" | "entries_open_at" | "starts_at" | "ends_at">): string {
  const hours = (value: number): string => formatCountdown(value * 3_600_000);
  switch (t.status) {
    case "announced":
      return `Entries open ${formatDate(t.entries_open_at, "short")}`;
    case "open":
      return t.hours_to_start !== null ? `Starts in ${hours(t.hours_to_start)} · ${formatDate(t.starts_at, "short")}` : `Started ${formatDate(t.starts_at, "short")}`;
    case "live":
      return t.hours_to_end !== null ? `Ends in ${hours(t.hours_to_end)} · ${formatDate(t.ends_at, "short")}` : `Ended ${formatDate(t.ends_at, "short")}`;
    case "judging":
      return `Results are being verified · ended ${formatDate(t.ends_at, "short")}`;
    case "complete":
      return `Ended ${formatDate(t.ends_at, "short")}`;
    case "cancelled":
      return "Cancelled. No one was charged and no prizes were owed.";
  }
}

export const TOURNAMENT_TABS = ["live", "upcoming", "past"] as const;
export type TournamentTab = (typeof TOURNAMENT_TABS)[number];
