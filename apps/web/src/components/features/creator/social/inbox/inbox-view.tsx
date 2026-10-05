"use client";

import { useMemo, useState } from "react";
import { Inbox as InboxIcon, Lock } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Chip, ChipGroup, EmptyState, SearchInput } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import type { ThreadKind } from "@/lib/contract/types";
import { useInbox, useStoreReady } from "@/lib/data";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useNow } from "@/lib/hooks/use-now";
import { SocialSkeleton } from "../shared/skeletons";
import { useUrlParam } from "../shared/use-url-param";
import { ThreadList } from "./thread-list";
import { ThreadPane } from "./thread-pane";

type Filter = "all" | "offers" | "reviews" | "support";
const FILTERS = ["all", "offers", "reviews", "support"] as const;
const KINDS: Record<Exclude<Filter, "all">, readonly ThreadKind[]> = { offers: ["offer"], reviews: ["submission", "bounty"], support: ["support"] };
const LABEL: Record<Filter, string> = { all: "All", offers: "Offers", reviews: "Reviews", support: "Support" };

export function InboxView() {
  const ready = useStoreReady();
  const desktop = useMediaQuery("(min-width: 1024px)", false);
  const now = useNow();
  const inbox = useInbox();
  const [selected, setSelected] = useUrlParam<string>("thread", null, "");
  const [filter, setFilter] = useUrlParam<Filter>("filter", FILTERS, "all");
  const [query, setQuery] = useState("");

  const threads = useMemo(() => {
    const kinds = filter === "all" ? null : KINDS[filter];
    const q = query.trim().toLowerCase();
    return inbox.threads.filter((thread) => (!kinds || kinds.includes(thread.kind)) && (q === "" || `${thread.title} ${thread.counterpart.name} ${thread.last_message?.body ?? ""}`.toLowerCase().includes(q)));
  }, [inbox.threads, filter, query]);

  if (!ready) return <SocialSkeleton label="Loading inbox" layout="split" />;

  const needing = inbox.offers_waiting;
  // Desktop opens the first conversation; a phone starts on the list.
  const activeId = selected !== "" && inbox.threads.some((thread) => thread.id === selected) ? selected : desktop ? threads[0]?.id : undefined;
  const active = inbox.threads.find((thread) => thread.id === activeId);
  const countOf = (id: Filter): number => (id === "all" ? inbox.threads.length : inbox.threads.filter((thread) => KINDS[id].includes(thread.kind)).length);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        eyebrow="Money"
        title="Inbox"
        description="Offers, counters and messages, each with its Pay Math and Rights Card inline. Everything stays in flowd."
        actions={
          <>
            {needing > 0 ? (
              <Badge tone="ember" size="lg">
                {needing} {needing === 1 ? "offer needs" : "offers need"} you
              </Badge>
            ) : null}
            <Badge tone="neutral" size="lg" icon={<Lock />}>
              In-app only
            </Badge>
          </>
        }
      />

      {inbox.threads.length === 0 ? (
        <GlassCard>
          <EmptyState art="inbox" title="Nothing here yet" description="Offers from brands, notes on your submissions and messages from flowd support will land here. Cash events and decisions come first." />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:h-[calc(100dvh-21rem)] lg:min-h-[30rem] lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
          <GlassCard padding="sm" className={`min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 ${activeId && !desktop ? "hidden" : "grid"}`} aria-label="Conversations">
            <div className="grid gap-3 p-1.5">
              <SearchInput aria-label="Search conversations" placeholder="Search" value={query} onValueChange={setQuery} onClear={() => setQuery("")} />
              <ChipGroup aria-label="Filter conversations">
                {FILTERS.map((id) => (
                  <Chip key={id} size="sm" selected={filter === id} onSelectedChange={() => setFilter(id)} count={countOf(id)}>
                    {LABEL[id]}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
            <div className="min-h-0 overflow-y-auto px-1 pb-1">
              {threads.length > 0 ? (
                <ThreadList threads={threads} selectedId={activeId} onSelect={setSelected} now={now} />
              ) : (
                <EmptyState size="sm" art="search" title="No conversations match" description={query ? `Nothing for “${query}”. Clear the search or try another word.` : "Nothing in this filter yet."} />
              )}
            </div>
          </GlassCard>

          <GlassCard padding="md" className={`min-h-0 ${activeId || desktop ? "grid" : "hidden"}`}>
            {active ? (
              <ThreadPane key={active.id} thread={active} now={now} onBack={() => setSelected("")} />
            ) : (
              <EmptyState art={<InboxIcon className="size-10 text-fg-subtle" aria-hidden="true" />} title="Pick a conversation" description="Offers show their price, your ask and the licence right here." />
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
