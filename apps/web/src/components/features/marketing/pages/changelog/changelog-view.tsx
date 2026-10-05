"use client";

import { useMemo, useState } from "react";
import type { ChangelogTag, PartyKind } from "@/lib/contract/types";
import { CHANGELOG_TAG_META } from "@/lib/contract/types";
import { formatDate } from "@/lib/format";
import { GlassCard } from "@/components/glass/glass";
import { Badge, Chip, ChipGroup, EmptyState, SegmentedControl, Button, type Tone } from "@/components/ui";
import { PageSection } from "../kit";

export interface ChangelogItem {
  id: string;
  date: string;
  title: string;
  body: string;
  tags: readonly ChangelogTag[];
  audience: readonly PartyKind[];
  version?: string;
}

type AudienceFilter = "all" | PartyKind;

const AUDIENCE: Record<PartyKind, string> = { creator: "Creators", brand: "Brands" };

const month = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The changelog: dated entries, newest first, grouped by month, with an audience switch (everyone, creators, brands) and tag chips (new, improved,
 * fix, trust, money). An entry with no audience is for everyone and always shows. Filters say how many entries they leave and offer a way out
 * when none match.
 */
export function ChangelogView({ entries }: { entries: readonly ChangelogItem[] }) {
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [tag, setTag] = useState<ChangelogTag | "all">("all");

  const tags = useMemo(() => Array.from(new Set(entries.flatMap((entry) => entry.tags))), [entries]);
  const shown = entries.filter((entry) => (audience === "all" || entry.audience.length === 0 || entry.audience.includes(audience)) && (tag === "all" || entry.tags.includes(tag)));
  const groups = useMemo(() => {
    const map = new Map<string, ChangelogItem[]>();
    for (const entry of shown) {
      const key = month(entry.date);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <PageSection id="entries" eyebrow="Releases" title="What shipped, and when" description="Every release, newest first. Filter by who it is for or by the kind of change.">
      <div className="grid gap-8">
        <div className="grid gap-4">
          <div className="max-w-full overflow-x-auto scrollbar-none">
            <SegmentedControl<AudienceFilter>
              aria-label="Who it is for"
              value={audience}
              onValueChange={setAudience}
              options={[
                { value: "all", label: "Everyone" },
                { value: "creator", label: "Creators" },
                { value: "brand", label: "Brands" },
              ]}
            />
          </div>
          <ChipGroup aria-label="Kind of change">
            <Chip selected={tag === "all"} onSelectedChange={() => setTag("all")} size="sm">
              All changes
            </Chip>
            {CHANGELOG_TAG_ORDER.filter((item) => tags.includes(item)).map((item) => (
              <Chip key={item} selected={tag === item} onSelectedChange={() => setTag(item)} size="sm">
                {CHANGELOG_TAG_META[item].label}
              </Chip>
            ))}
          </ChipGroup>
          <p className="text-caption text-fg-subtle" role="status" aria-live="polite">
            {shown.length} of {entries.length} releases.
          </p>
        </div>

        {groups.length > 0 ? (
          <div className="grid gap-10">
            {groups.map(([label, items]) => (
              <section key={label} aria-label={label} className="grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-8">
                <h3 className="font-display text-title-sm text-fg-muted md:sticky md:top-24 md:self-start">{label}</h3>
                <ol className="grid gap-4">
                  {items.map((entry) => (
                    <li key={entry.id}>
                      <GlassCard padding="lg" className="grid gap-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <time dateTime={entry.date} className="fd-figure text-body-sm font-semibold text-fg-muted tabular-nums">
                            {formatDate(entry.date, "short")}
                          </time>
                          {entry.version ? <span className="font-mono text-code text-fg-subtle">v{entry.version}</span> : null}
                          <span className="ml-auto flex flex-wrap items-center gap-1.5">
                            {entry.tags.map((item) => (
                              <Badge key={item} tone={CHANGELOG_TAG_META[item].tone as Tone} size="md">
                                {CHANGELOG_TAG_META[item].label}
                              </Badge>
                            ))}
                            <Badge size="md" variant="outline">
                              {entry.audience.length === 0 ? "Everyone" : entry.audience.map((who) => AUDIENCE[who]).join(" and ")}
                            </Badge>
                          </span>
                        </div>
                        <h4 className="font-display text-title-md text-fg">{entry.title}</h4>
                        <p className="max-w-[62ch] text-body text-fg-muted">{entry.body}</p>
                      </GlassCard>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <GlassCard padding="lg">
            <EmptyState
              art="search"
              title="No releases match"
              description="Nothing shipped for that audience with that tag. Clear a filter to see more."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setAudience("all");
                    setTag("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </GlassCard>
        )}
      </div>
    </PageSection>
  );
}

const CHANGELOG_TAG_ORDER: readonly ChangelogTag[] = ["new", "improved", "fix", "trust", "money"];
