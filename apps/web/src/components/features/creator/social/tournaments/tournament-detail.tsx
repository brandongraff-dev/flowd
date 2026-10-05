"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Medal, Swords, Users } from "lucide-react";
import { ArtSurface } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, CopyField, EmptyState, Money } from "@/components/ui";
import { Section } from "@/components/shell";
import { ENTRY_STATUS_META, NICHE_META, TOURNAMENT_FORMAT_META, TOURNAMENT_STATUS_META } from "@/lib/contract/types";
import { useStoreReady, useTournament } from "@/lib/data";
import type { EntryView } from "@/lib/data/selectors";
import { formatDate, formatInt, ordinal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Person } from "../shared/person";
import { SocialSkeleton } from "../shared/skeletons";
import { Bracket } from "./bracket";
import { EnterSheet } from "./enter-sheet";
import { whenLine } from "./tournament-meta";

function Standing({ entry, index }: { entry: EntryView; index: number }) {
  const status = ENTRY_STATUS_META[entry.status];
  const place = entry.placement ?? index + 1;
  return (
    <li className={cn("grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5", entry.is_me && "bg-accent-soft")}>
      <span className="text-center font-display text-title-sm text-fg-muted tabular-nums">{place}</span>
      <Person creator={entry.creator} size={36} you={entry.is_me} detail={entry.hook_text} />
      <span className="grid justify-items-end gap-1">
        <span className="text-caption font-semibold text-fg tabular-nums">
          {entry.hook_points} <span className="font-normal text-fg-subtle">· {entry.hook_band}</span>
        </span>
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>
      </span>
    </li>
  );
}

export function TournamentDetail({ id }: { id: string }) {
  const ready = useStoreReady();
  const t = useTournament(id);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!ready) return <SocialSkeleton label="Loading tournament" layout="split" />;
  if (!t) {
    return (
      <div className="py-10">
        <EmptyState
          art="search"
          title="That tournament doesn't exist"
          description="It may have been renamed or removed. The tournaments page lists everything running."
          action={
            <Button asChild variant="primary">
              <Link href="/creator/tournaments">All tournaments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const status = TOURNAMENT_STATUS_META[t.status];
  const mine = t.my_entry;
  const visibleStandings = showAll ? t.standings : t.standings.slice(0, 10);
  const winners = t.status === "complete" ? t.standings.filter((entry) => entry.placement !== undefined && entry.placement <= 3 && entry.prize_cents !== undefined) : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <Link href="/creator/tournaments" className="inline-flex w-fit items-center gap-1.5 rounded-md py-1 text-body-sm font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Tournaments
      </Link>

      <GlassCard padding="none" className="overflow-hidden">
        <div className="relative h-44 sm:h-52">
          <ArtSurface art={t.art} aspect="16:9" />
          <div aria-hidden="true" className="fd-media-scrim absolute inset-0" />
          <div className="absolute inset-x-5 top-4 flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} variant="solid" size="lg">
              {status.label}
            </Badge>
            <Badge tone="neutral" variant="solid" size="lg" className="bg-black/55 text-white">
              {TOURNAMENT_FORMAT_META[t.format].label}
            </Badge>
          </div>
          <p className="absolute inset-x-5 bottom-4 text-body-sm font-semibold text-white/90">Sponsored by {t.sponsor_label}</p>
        </div>
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-3">
            <h1 className="font-display text-display-md text-balance text-fg">{t.title}</h1>
            <p className="max-w-[62ch] text-body-lg text-fg-muted">{t.description}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {t.min_tier ? (
                <Badge tone="neutral" size="lg" icon={<Lock />}>
                  {t.min_tier[0].toUpperCase() + t.min_tier.slice(1)} and above
                </Badge>
              ) : null}
              {t.niche ? (
                <Badge tone={NICHE_META[t.niche].tone} size="lg">
                  {NICHE_META[t.niche].label}
                </Badge>
              ) : null}
              <Badge tone="neutral" size="lg" icon={<Users />}>
                {formatInt(t.entries_count)} entries
              </Badge>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 lg:text-right">
            <div className="grid gap-0.5">
              <dt className="text-caption font-medium text-fg-subtle">Prize pool</dt>
              <dd>
                <Money cents={t.prize_pool_cents} size="lg" decimals="never" icon={false} />
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption font-medium text-fg-subtle">{t.status === "live" || t.status === "judging" || t.status === "complete" ? "Dates" : "Starts"}</dt>
              <dd className="text-body-sm font-semibold text-fg">
                {formatDate(t.starts_at, "short")} to {formatDate(t.ends_at, "short")}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-divider bg-surface-field/60 px-6 py-4 sm:px-8">
          <p className="text-body-sm text-fg-muted">{whenLine(t)}</p>
          {mine ? (
            <Badge tone={ENTRY_STATUS_META[mine.status].tone} variant="solid" size="lg" icon={<Swords />}>
              You are {ENTRY_STATUS_META[mine.status].label.toLowerCase()}
            </Badge>
          ) : t.can_enter ? (
            <Button variant="primary" size="lg" leadingIcon={<Swords />} onClick={() => setOpen(true)}>
              Enter free
            </Button>
          ) : (
            <p className="max-w-[44ch] text-body-sm text-fg-subtle sm:text-right">{t.enter_blocked_reason}</p>
          )}
        </div>
      </GlassCard>

      {mine ? (
        <Callout tone="mint" title="Your hook" icon={<Medal />}>
          <span className="grid gap-1">
            <span className="text-body text-fg">&ldquo;{mine.hook_text}&rdquo;</span>
            <span>
              Checklist score {mine.hook_points} ({mine.hook_band}), seed {mine.seed}
              {mine.placement ? `, finished ${ordinal(mine.placement)}` : ""}
              {mine.prize_cents ? <> and won <Money cents={mine.prize_cents} size="sm" state="cleared" /></> : ""}.
            </span>
          </span>
        </Callout>
      ) : null}

      {winners.length > 0 ? (
        <Section title="Results" description="Prizes were paid as cleared earnings to the winners' Wallets.">
          <ol className="grid gap-3 md:grid-cols-3">
            {winners.map((entry) => (
              <li key={entry.id}>
                <GlassCard className="grid gap-3">
                  <p className="fd-eyebrow text-sun">{ordinal(entry.placement ?? 0)} place</p>
                  <Person creator={entry.creator} size={44} you={entry.is_me} detail={entry.hook_text} />
                  {entry.prize_cents ? <Money cents={entry.prize_cents} size="lg" state="cleared" icon={false} /> : null}
                </GlassCard>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
          {t.rounds.length > 0 ? (
            <Section title="Bracket" description="Hooks go head to head each round, and the higher score wins the match.">
              <GlassCard className="min-w-0">
                <Bracket rounds={t.rounds} />
              </GlassCard>
            </Section>
          ) : null}

          <Section title={t.format === "leaderboard" ? "Leaderboard" : "Standings"} description={t.format === "leaderboard" ? "Ranked by the tournament's metric until it ends." : "Final placements when it is over, otherwise by Hook Score points."}>
            {t.standings.length > 0 ? (
              <GlassCard padding="sm" className="grid min-w-0 gap-2">
                <ol className="grid divide-y divide-divider overflow-hidden rounded-xl">
                  {visibleStandings.map((entry, index) => (
                    <Standing key={entry.id} entry={entry} index={index} />
                  ))}
                </ol>
                {t.standings.length > 10 && !showAll ? (
                  <div className="flex justify-center pb-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                      Show all {t.standings.length} entries
                    </Button>
                  </div>
                ) : null}
              </GlassCard>
            ) : (
              <GlassCard>
                <EmptyState size="sm" art="bounty" title="No entries yet" description={t.status === "cancelled" ? "This tournament was cancelled before it started." : "Be the first in. Entries are free."} />
              </GlassCard>
            )}
          </Section>
        </div>

        <aside aria-label="Prizes and rules" className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:sticky lg:top-24">
          <GlassCard className="grid gap-3">
            <h2 className="font-display text-title-sm text-fg">Prizes</h2>
            <ul className="grid gap-2">
              {t.prizes.map((prize) => (
                <li key={prize.place} className="flex items-baseline justify-between gap-3 text-body-sm">
                  <span className="text-fg-muted">
                    {ordinal(prize.place)}
                    {prize.label ? <span className="text-fg-subtle"> · {prize.label}</span> : null}
                  </span>
                  <Money cents={prize.amount_cents} size="sm" decimals="never" icon={false} />
                </li>
              ))}
            </ul>
            <p className="text-caption text-fg-subtle">{t.prizes.length} of {t.entries_count > 0 ? formatInt(t.entries_count) : "the"} entrants place. Prizes are paid from the pool, never from entry fees, because there are none.</p>
          </GlassCard>
          <GlassCard className="grid gap-3">
            <h2 className="font-display text-title-sm text-fg">Rules</h2>
            <ul className="grid gap-2.5 text-body-sm text-fg-muted">
              {t.rules.map((rule) => (
                <li key={rule} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  <span className="text-pretty">{rule}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <h2 className="font-display text-title-sm text-fg">Public page</h2>
            <p className="text-caption text-fg-subtle">Anyone can watch the bracket without signing in.</p>
            <CopyField aria-label="Public tournament link" value={t.public_url} />
          </GlassCard>
        </aside>
      </div>

      <EnterSheet tournament={t} open={open} onOpenChange={setOpen} />
    </div>
  );
}
