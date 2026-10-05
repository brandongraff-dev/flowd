"use client";

import Link from "next/link";
import { Swords, Trophy } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { PageHeader, Section } from "@/components/shell";
import { ENTRY_STATUS_META } from "@/lib/contract/types";
import { useStoreReady, useTournaments } from "@/lib/data";
import type { TournamentView } from "@/lib/data/selectors";
import { SocialSkeleton } from "../shared/skeletons";
import { useUrlParam } from "../shared/use-url-param";
import { TournamentCard } from "./tournament-card";
import { TOURNAMENT_TABS, whenLine, type TournamentTab } from "./tournament-meta";

const TAB_LABEL: Record<TournamentTab, string> = { live: "Live and open", upcoming: "Upcoming", past: "Past" };
const TAB_EMPTY: Record<TournamentTab, { title: string; description: string }> = {
  live: { title: "Nothing is running right now", description: "New tournaments are announced a week ahead. Upcoming ones are one tab over." },
  upcoming: { title: "No tournaments announced", description: "When one is announced you can see the prizes and the rules before entries open." },
  past: { title: "No past tournaments yet", description: "Finished brackets and their results will be kept here." },
};

function Grid({ items }: { items: readonly TournamentView[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((tournament) => (
        <TournamentCard key={tournament.id} tournament={tournament} />
      ))}
    </ul>
  );
}

export function TournamentsView() {
  const ready = useStoreReady();
  const data = useTournaments();
  const [tab, setTab] = useUrlParam<TournamentTab>("tab", TOURNAMENT_TABS, "live");
  if (!ready) return <SocialSkeleton label="Loading tournaments" layout="grid" />;

  const sets: Record<TournamentTab, readonly TournamentView[]> = {
    live: [...data.live, ...data.open],
    upcoming: data.upcoming,
    past: data.past,
  };
  const active = data.mine.filter((t) => t.status === "live" || t.status === "open" || t.status === "judging");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <Tabs value={tab} onValueChange={(next) => setTab(next as TournamentTab)} variant="underline" className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <PageHeader
          eyebrow="Compete"
          title="Tournaments"
          description="Free to enter, with prize pools funded by sponsors or flowd. Hook battles are judged on the Hook Score checklist and how many viewers are still watching at second three."
          meta={
            <Badge tone="neutral" size="lg" icon={<Trophy />}>
              No entry fees, ever
            </Badge>
          }
          tabs={
            <TabsList aria-label="Tournaments">
              {TOURNAMENT_TABS.map((id) => (
                <TabsTrigger key={id} value={id} count={sets[id].length}>
                  {TAB_LABEL[id]}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        />

        {active.length > 0 ? (
          <Section title="Your entries" description="Where you stand in the tournaments you entered.">
            <ul className="grid gap-3 md:grid-cols-2">
              {active.map((t) => (
                <li key={t.id} className="grid">
                  <GlassCard asChild padding="md" className="flex items-center justify-between gap-4 transition-transform duration-(--fd-dur-base) ease-out hover:-translate-y-0.5 motion-reduce:transition-none">
                    <Link href={`/creator/tournaments/${t.id}`}>
                      <span className="grid min-w-0 gap-1">
                        <span className="truncate text-body font-semibold text-fg">{t.title}</span>
                        <span className="text-caption text-fg-subtle">{whenLine(t)}</span>
                      </span>
                      {t.my_entry ? (
                        <Badge tone={ENTRY_STATUS_META[t.my_entry.status].tone} variant="solid" size="lg" icon={<Swords />}>
                          {ENTRY_STATUS_META[t.my_entry.status].label}
                        </Badge>
                      ) : null}
                    </Link>
                  </GlassCard>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {TOURNAMENT_TABS.map((id) => (
          <TabsContent key={id} value={id} className="outline-none">
            {id === tab ? (
              sets[id].length > 0 ? (
                <Grid items={sets[id]} />
              ) : (
                <GlassCard>
                  <EmptyState art="bounty" title={TAB_EMPTY[id].title} description={TAB_EMPTY[id].description} />
                </GlassCard>
              )
            ) : null}
          </TabsContent>
        ))}
      </Tabs>

      <p className="max-w-[70ch] text-caption text-fg-subtle">
        Prizes are paid as cleared earnings from the sponsor&rsquo;s pool, and every prize shows in your Wallet like any other money. Winners are chosen by the stated metric, not by chance. Most entrants do not place, so enter for the practice and the hook, not the prize.
      </p>
    </div>
  );
}
