"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { TIER_LABEL } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Callout, EmptyState } from "@/components/ui";
import { PageHeader, Section, Timeline, type TimelineItem } from "@/components/shell";
import type { Tier } from "@/lib/contract/types";
import { useStoreReady, useTiers } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { SocialSkeleton } from "../shared/skeletons";
import { Ladder } from "./ladder";
import { PerksTable } from "./perks-table";
import { ProgressPanel } from "./progress-panel";

const EVENT_TITLE: Record<string, string> = {
  promoted: "Moved up",
  granted: "Tier granted",
  hold_started: "Grace hold started",
  hold_cleared: "Back on track",
  demoted: "Tier changed after the grace hold",
  carry_over_applied: "Founding history counted",
};

export function TiersView() {
  const ready = useStoreReady();
  const view = useTiers();
  if (!ready) return <SocialSkeleton label="Loading tiers" layout="hero" />;

  const creator = view.creator;
  if (!creator) {
    return <EmptyState art="locked" title="Sign in as a creator to see your tier" description="Tiers are earned from your cleared money and approved work." />;
  }
  const tier = creator.tier as Tier;
  const next = view.next as Tier | null;
  const history: TimelineItem[] = view.history.map((event) => ({
    id: event.id,
    title: `${EVENT_TITLE[event.kind] ?? "Tier update"}${event.kind === "promoted" ? `: ${TIER_LABEL[event.to_tier as Tier]}` : ""}`,
    time: formatDate(event.at, "medium"),
    description: event.note,
    state: "done",
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Community"
        title="Tiers"
        description="Tiers are earned from cleared money and approved work. They are never bought, and every step unlocks something you can use."
      />

      <ProgressPanel view={view} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        {next ? (
          <GlassCard className="grid content-start gap-4" aria-labelledby="unlocks-title">
            <h2 id="unlocks-title" className="flex items-center gap-2 font-display text-title-md text-fg">
              <Sparkles aria-hidden="true" className="size-5 text-sun" />
              What {TIER_LABEL[next]} unlocks
            </h2>
            {view.unlocks.length > 0 ? (
              <ul className="grid gap-2.5">
                {view.unlocks.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-body text-fg-muted">
                    <ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-fg-muted">{TIER_LABEL[next]} keeps the perks you have and raises the bar for the next tier.</p>
            )}
            <p className="text-caption text-fg-subtle">You keep everything you have at {TIER_LABEL[tier]}.</p>
          </GlassCard>
        ) : null}

        <GlassCard className="grid content-start gap-4" aria-labelledby="grace-title">
          <h2 id="grace-title" className="flex items-center gap-2 font-display text-title-md text-fg">
            <ShieldCheck aria-hidden="true" className="size-5 text-mint" />
            No drop for 30 days after a dip
          </h2>
          <p className="text-body text-fg-muted">
            If your numbers slip below your tier, say your approval rate dips after a tough batch, you keep the tier for 30 days while you recover.
            Pausing in{" "}
            <Link href="/creator/wellbeing" className="font-semibold text-accent underline underline-offset-4">
              Wellbeing Mode
            </Link>{" "}
            keeps your tier too.
          </p>
          {view.grace ? (
            <Callout tone="sun" title={`${view.grace.days_left} days of grace left`}>
              Your tier is held until {formatDate(view.grace.until, "medium")}. Clear the missing numbers before then and the hold lifts.
            </Callout>
          ) : (
            <p className="text-caption text-fg-subtle">No grace hold is running. You are at or above every {TIER_LABEL[tier]} threshold.</p>
          )}
        </GlassCard>
      </div>

      <Section title="The ladder" description="Bronze to Elite: what each tier asks for, and what it gives you.">
        <Ladder rows={view.ladder} next={next} />
        <PerksTable current={tier} />
      </Section>

      <Section title="Your history" description="Every change to your tier, with the numbers behind it.">
        {history.length > 0 ? (
          <GlassCard>
            <Timeline items={history} />
          </GlassCard>
        ) : (
          <GlassCard>
            <EmptyState size="sm" art="chart" title="Nothing yet" description="You start at Bronze. Your first move up shows here with the numbers that earned it." />
          </GlassCard>
        )}
      </Section>
    </div>
  );
}
