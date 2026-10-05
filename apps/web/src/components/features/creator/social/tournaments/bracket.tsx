"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { SegmentedControl } from "@/components/ui";
import type { EntryView, MatchupView, RoundView } from "@/lib/data/selectors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function Side({ entry, score, won, decided }: { entry?: EntryView; score?: number; won: boolean; decided: boolean }) {
  if (!entry) {
    return (
      <div className="flex min-h-12 items-center gap-2.5 rounded-lg px-2.5 py-2 text-caption text-fg-subtle">
        <span aria-hidden="true" className="size-7 rounded-full border border-dashed border-rim" />
        To be decided
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2.5 py-2",
        won && "bg-mint-soft",
        entry.is_me && !won && "bg-accent-soft",
        decided && !won && "opacity-70",
      )}
    >
      <ArtAvatar art={entry.creator.avatar} name={entry.creator.display_name} size={28} decorative />
      <span className="grid min-w-0 gap-px">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-body-sm", won ? "font-semibold text-fg" : "font-medium text-fg")}>@{entry.creator.handle}</span>
          {entry.is_me ? <span className="shrink-0 rounded-pill bg-accent-soft px-1.5 text-micro font-semibold text-accent">You</span> : null}
        </span>
        <span className="truncate text-micro text-fg-subtle" title={entry.hook_text}>
          {entry.hook_text}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        {won ? <Check aria-label="Won this match" className="size-4 text-mint stroke-[2.5]" /> : null}
        {score !== undefined ? <span className="text-caption font-semibold text-fg-muted tabular-nums">{score.toFixed(1)}</span> : null}
      </span>
    </div>
  );
}

function Matchup({ matchup }: { matchup: MatchupView }) {
  const decided = matchup.winner !== undefined;
  return (
    <li className="grid gap-1 rounded-xl bg-surface-field p-1.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <Side entry={matchup.a} score={matchup.score_a} won={decided && matchup.winner?.id === matchup.a?.id} decided={decided} />
      <Side entry={matchup.b} score={matchup.score_b} won={decided && matchup.winner?.id === matchup.b?.id} decided={decided} />
    </li>
  );
}

/**
 * The bracket: one column per round on wide screens, one round at a time on phones (a segmented control picks it). Every match shows both
 * hooks, both scores and the winner with a check, so the result never rests on colour. The metric is named under the round.
 */
export function Bracket({ rounds }: { rounds: readonly RoundView[] }) {
  const current = rounds.find((round) => round.matchups.some((m) => m.winner === undefined))?.round ?? rounds[rounds.length - 1]?.round ?? 1;
  const [selected, setSelected] = useState<string>(String(current));
  if (rounds.length === 0) return null;
  return (
    <div className="grid gap-5">
      <div className="md:hidden">
        <SegmentedControl
          aria-label="Round"
          fullWidth
          size="sm"
          value={selected}
          onValueChange={setSelected}
          options={rounds.map((round) => ({ value: String(round.round), label: round.name }))}
        />
      </div>
      <div className="grid gap-6 md:auto-cols-[minmax(15rem,1fr)] md:grid-flow-col md:overflow-x-auto md:pb-2">
        {rounds.map((round) => (
          <section key={round.round} aria-labelledby={`round-${round.round}`} className={cn("grid content-start gap-3", String(round.round) !== selected && "hidden md:grid")}>
            <header className="grid gap-0.5">
              <h3 id={`round-${round.round}`} className="font-display text-title-sm text-fg">
                {round.name}
              </h3>
              <p className="text-caption text-fg-subtle">
                {formatDate(round.starts_at, "short")} to {formatDate(round.ends_at, "short")}
                {round.matchups[0] ? ` · ${round.matchups[0].metric}` : ""}
              </p>
            </header>
            {round.matchups.length > 0 ? (
              <ul className="grid gap-3">
                {round.matchups.map((matchup) => (
                  <Matchup key={matchup.id} matchup={matchup} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-rim p-4 text-caption text-fg-subtle">Matchups are set when the round before it ends.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
