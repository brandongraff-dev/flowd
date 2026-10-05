"use client";

import { EyeOff, Info, Lock, Trophy } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Button, Callout, EmptyState, Money, SegmentedControl, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, notify } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import { NICHES, NICHE_META, type LeaderboardMetric, type LeaderboardScope, type Niche } from "@/lib/contract/types";
import { useLeaderboard, useMe, useStoreReady } from "@/lib/data";
import { actions } from "@/lib/store";
import Link from "next/link";
import { SocialSkeleton } from "../shared/skeletons";
import { useRun } from "../shared/run-action";
import { useUrlParam } from "../shared/use-url-param";
import { BoardList } from "./board-list";
import { METRIC_BLURB } from "./board-math";
import { StandingCard } from "./standing-card";

const SCOPES = ["cohort", "niche", "global"] as const satisfies readonly LeaderboardScope[];
const METRICS = ["earnings", "conversion_rate", "score_accuracy"] as const satisfies readonly LeaderboardMetric[];
const SCOPE_LABEL: Record<LeaderboardScope, string> = { cohort: "Your cohort", niche: "Niche", global: "Global" };

export function LeaderboardView() {
  const ready = useStoreReady();
  const me = useMe();
  const [scope, setScope] = useUrlParam<LeaderboardScope>("tab", SCOPES, "cohort");
  const [metricParam, setMetric] = useUrlParam<LeaderboardMetric>("metric", METRICS, "earnings");
  const myNiche = me.creator?.niches[0] ?? "ai_tools";
  const [niche, setNiche] = useUrlParam<Niche>("niche", NICHES, myNiche);
  const metric: LeaderboardMetric = scope === "cohort" ? "earnings" : metricParam;
  const view = useLeaderboard({ scope, metric, ...(scope === "niche" ? { niche } : {}) });
  const { busy, run } = useRun();

  if (!ready) return <SocialSkeleton label="Loading leaderboard" layout="hero" />;

  const setPrivate = async (next: boolean): Promise<void> => {
    const result = await run("private", () => actions.updateWellbeing({ leaderboard_opt_out: next }));
    if (result) {
      notify.success(next ? "You're hidden from leaderboards" : "You're back on leaderboards", { description: next ? "Your tier, earnings and streak are not affected." : "You'll appear in this week's cohort." });
    }
  };

  return (
    <Tabs value={scope} onValueChange={(next) => setScope(next as LeaderboardScope)} variant="underline" className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description="A weekly race against about 30 creators at your tier and in your niche. The top 5 move up a cohort. Nobody is demoted, and your rank never changes your tier."
        tabs={
          <TabsList aria-label="Leaderboard">
            {SCOPES.map((id) => (
              <TabsTrigger key={id} value={id}>
                {SCOPE_LABEL[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      />

      {view.opted_out ? (
        <Callout tone="neutral" icon={<EyeOff />} title="Private mode is on" action={<Button size="sm" variant="secondary" loading={busy === "private"} onClick={() => void setPrivate(false)}>Show me again</Button>}>
          Other creators can&rsquo;t see you on any board. Your tier, earnings and streak are not affected.
        </Callout>
      ) : null}

      {SCOPES.map((id) => (
        <TabsContent key={id} value={id} className="grid grid-cols-[minmax(0,1fr)] gap-6 outline-none">
          {id === scope ? (
            <>
              {view.unranked && id === "cohort" ? (
                <GlassCard padding="lg">
                  <EmptyState
                    art="wallet"
                    title="Earn your first $1"
                    description="Boards rank cleared earnings. Once your first dollar clears you join a cohort of about 30 creators at your tier and niche."
                    action={
                      <Button asChild variant="primary">
                        <Link href="/creator/feed">Find a bounty</Link>
                      </Button>
                    }
                    secondaryAction={
                      <Button asChild variant="ghost">
                        <Link href="/creator/academy">Free lessons</Link>
                      </Button>
                    }
                  />
                </GlassCard>
              ) : (
                <>
                  {view.board ? <StandingCard view={view} scope={id} metric={metric} /> : null}
                  <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
                    <GlassCard padding="md" aria-labelledby="board-title" className="grid gap-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="grid gap-0.5">
                          <h2 id="board-title" className="font-display text-title-md text-fg">
                            {view.board ? view.label : "No board yet"}
                          </h2>
                          <p className="text-caption text-fg-subtle">{METRIC_BLURB[metric].what}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {id === "niche" ? (
                            <Select
                              aria-label="Niche"
                              size="sm"
                              value={niche}
                              onValueChange={(next) => setNiche(next as Niche)}
                              options={NICHES.map((n) => ({ value: n, label: NICHE_META[n].label }))}
                              className="w-44"
                            />
                          ) : null}
                          {id !== "cohort" ? (
                            <SegmentedControl
                              aria-label="Ranked by"
                              size="sm"
                              value={metric}
                              onValueChange={setMetric}
                              options={METRICS.map((m) => ({ value: m, label: m === "earnings" ? "Earnings" : m === "conversion_rate" ? "Trial rate" : "Accuracy" }))}
                            />
                          ) : null}
                        </div>
                      </div>
                      {view.rows.length > 0 ? (
                        <BoardList view={view} metric={metric} />
                      ) : (
                        <EmptyState
                          size="sm"
                          art="chart"
                          title="No board for this selection"
                          description="Boards appear once enough creators have cleared money in this niche and metric this week. Try Earnings or another niche."
                        />
                      )}
                    </GlassCard>

                    <aside aria-label="About boards" className="grid content-start gap-4 lg:sticky lg:top-24">
                      {id === "global" && view.typical_cents !== null && view.rows[0] ? (
                        <GlassCard className="grid gap-3">
                          <p className="fd-eyebrow text-fg-subtle">Typical beside the top</p>
                          <div className="grid gap-2">
                            <div className="flex items-baseline justify-between gap-3 text-body-sm text-fg-muted">
                              <span>Top this week</span>
                              {metric === "earnings" ? <Money cents={view.rows[0].value} size="md" icon={false} /> : <span className="text-fg">#1</span>}
                            </div>
                            <div className="flex items-baseline justify-between gap-3 text-body-sm text-fg-muted">
                              <span>Typical creator, 30 days</span>
                              <Money cents={view.typical_cents} size="md" icon={false} />
                            </div>
                          </div>
                          <p className="text-caption text-fg-subtle">Median of creators who cleared money in the last 30 days. Most creators earn far less than the top of a board.</p>
                        </GlassCard>
                      ) : null}
                      <GlassCard className="grid gap-4">
                        <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
                          <Trophy aria-hidden="true" className="size-[18px] text-sun" />
                          How cohorts work
                        </h3>
                        <ul className="grid gap-3 text-body-sm text-fg-muted">
                          <li>Cohorts hold about 30 creators at your tier and in your niche, so you race people like you.</li>
                          <li>Boards reset every Monday at 00:00 UTC. The top 5 move up a cohort next week.</li>
                          <li>There is no demotion zone. A slow week keeps your place and your tier.</li>
                          <li>The public global board shows the leaders and the typical creator side by side.</li>
                        </ul>
                      </GlassCard>
                      <GlassCard className="grid gap-3">
                        <h3 className="flex items-center gap-2 font-display text-title-sm text-fg">
                          <Lock aria-hidden="true" className="size-[18px] text-fg-muted" />
                          Private mode
                        </h3>
                        <Switch
                          label="Hide me from leaderboards"
                          description="You won't appear on any board and can't be ranked. Tier, streak and earnings are untouched."
                          checked={view.opted_out}
                          disabled={busy === "private"}
                          onCheckedChange={(next) => void setPrivate(next)}
                        />
                        <p className="flex items-start gap-2 text-caption text-fg-subtle">
                          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                          Also in Wellbeing Mode, with quiet hours and numbers-off.
                        </p>
                      </GlassCard>
                    </aside>
                  </div>
                </>
              )}
            </>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
