"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Plus, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, ConfirmDialog, EmptyState, notify } from "@/components/ui";
import { PageHeader, Section } from "@/components/shell";
import type { Niche } from "@/lib/contract/types";
import { useCrews, useMe, useStoreReady } from "@/lib/data";
import type { CrewView } from "@/lib/data/selectors";
import { actions } from "@/lib/store";
import { reportFailure, useRun } from "../shared/run-action";
import { SocialSkeleton } from "../shared/skeletons";
import { CrewCard } from "./crew-card";
import { CreateCrewDialog, JoinCodeDialog } from "./crew-dialogs";
import { MyCrew } from "./my-crew";

export function CrewsView() {
  const ready = useStoreReady();
  const crews = useCrews();
  const me = useMe();
  const { busy, run } = useRun();
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [codeFor, setCodeFor] = useState<CrewView | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  if (!ready) return <SocialSkeleton label="Loading crews" layout="hero" />;

  const mine = crews.mine;
  const crewCount = crews.discover.length + (mine ? 1 : 0);
  const defaultNiche: Niche = me.creator?.niches[0] ?? "lifestyle";

  const join = async (crew: CrewView): Promise<void> => {
    setJoiningId(crew.id);
    const data = await run(`join-${crew.id}`, () => actions.joinCrew({ crew_id: crew.id }));
    setJoiningId(null);
    if (data) notify.success(`You joined ${crew.name}`, { description: "Your weekly cleared money now counts toward the crew goal. Leave any time." });
  };

  const leave = async (): Promise<void> => {
    const result = await actions.leaveCrew();
    if (!result.ok) {
      reportFailure(result.error);
      throw new Error(result.error.code);
    }
    notify.success("You left the crew", { description: "You can join an open crew again any time." });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Community"
        title="Crews"
        description="Small groups of creators with a shared weekly board and a goal to hit together. Join one, or start one at Gold. Leave any time."
        meta={
          <Badge tone="mint" size="lg" icon={<ShieldCheck />}>
            Bonuses are funded by flowd
          </Badge>
        }
      />

      {mine ? (
        <MyCrew crew={mine} crewCount={crewCount} meId={me.creator?.id} onLeave={() => setLeaving(true)} />
      ) : (
        <GlassCard padding="lg">
          <EmptyState
            art="inbox"
            title="You're not in a crew yet"
            description="Crews are 3 to 20 creators who cheer each other on and share a weekly goal. Pick an open one below."
          />
        </GlassCard>
      )}

      <Section
        title={mine ? "Other crews" : "Find a crew"}
        description={mine ? "Leave your crew first if you want to move. Open crews take anyone eligible." : "Open crews take anyone eligible. Invite-only crews need a code from their lead."}
      >
        {crews.discover.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {crews.discover.map((crew) => (
              <CrewCard key={crew.id} crew={crew} inCrew={mine !== undefined} busy={joiningId === crew.id && busy !== null} onJoin={(c) => void join(c)} onJoinWithCode={setCodeFor} />
            ))}
          </ul>
        ) : (
          <GlassCard>
            <EmptyState size="sm" art="search" title="No other crews yet" description="Start one if you are Gold or above, or check back soon." />
          </GlassCard>
        )}
      </Section>

      <GlassCard padding="lg" aria-labelledby="lead-title" className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sun-soft text-sun">
          <Crown className="size-7" />
        </span>
        <div className="grid min-w-0 flex-1 basis-72 gap-1">
          <h2 id="lead-title" className="font-display text-title-md text-fg">
            Lead a crew
          </h2>
          <p className="text-body-sm text-fg-muted">{crews.can_lead ? "You can start a crew now: pick a name, a niche and a weekly goal." : (crews.lead_blocked_reason ?? "Leading a crew opens at Gold.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {crews.can_lead ? (
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
              Start a crew
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled>
                Start a crew
              </Button>
              {me.creator && me.creator.tier !== "gold" && me.creator.tier !== "platinum" && me.creator.tier !== "elite" ? (
                <Button asChild variant="ghost">
                  <Link href="/creator/tiers">See what Gold needs</Link>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </GlassCard>

      <CreateCrewDialog open={creating} onOpenChange={setCreating} defaultNiche={defaultNiche} />
      <JoinCodeDialog crew={codeFor} onOpenChange={(open) => (open ? undefined : setCodeFor(null))} />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={mine ? `Leave ${mine.name}?` : "Leave this crew?"}
        description={mine?.is_lead ? "You lead this crew. The longest-standing member who qualifies takes over, or the crew closes if you are the last one." : "Your cleared money stops counting toward the crew goal. You can join an open crew again any time."}
        confirmLabel="Leave crew"
        tone="danger"
        onConfirm={leave}
      />
    </div>
  );
}
