"use client";

import { KeyRound, Lock, UsersRound } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Money, Progress } from "@/components/ui";
import { NICHE_META } from "@/lib/contract/types";
import type { CrewView } from "@/lib/data/selectors";
import { CONSTANTS } from "@/lib/engine";

export interface CrewCardProps {
  crew: CrewView;
  busy: boolean;
  onJoin: (crew: CrewView) => void;
  onJoinWithCode: (crew: CrewView) => void;
  /** Whether the signed-in creator already belongs to a crew. */
  inCrew: boolean;
}

/** An open or invite-only crew to look at and join. The reason you cannot join is written under the button, never just a dead control. */
export function CrewCard({ crew, busy, onJoin, onJoinWithCode, inCrew }: CrewCardProps) {
  const full = crew.member_count >= CONSTANTS.crews.max_members;
  return (
    <li className="grid">
      <GlassCard padding="md" className="grid h-full grid-cols-[minmax(0,1fr)] content-start gap-4">
        <div className="flex items-start gap-3.5">
          <ArtAvatar art={crew.art} name={crew.name} shape="square" size={52} decorative />
          <div className="grid min-w-0 gap-0.5">
            <h3 className="truncate font-display text-title-sm text-fg">{crew.name}</h3>
            <p className="text-body-sm text-fg-muted">{crew.tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={NICHE_META[crew.niche].tone} size="md">
            {NICHE_META[crew.niche].label}
          </Badge>
          <Badge tone="neutral" size="md" icon={<UsersRound />}>
            {crew.member_count} of {CONSTANTS.crews.max_members}
          </Badge>
          <Badge tone="neutral" size="md" icon={crew.open ? undefined : <Lock />}>
            {crew.open ? "Open" : "Invite only"}
          </Badge>
        </div>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3 text-caption text-fg-muted">
            <span>#{crew.week_rank} this week</span>
            <span>
              <Money cents={crew.week_cleared_cents} size="sm" icon={false} decimals="never" /> of <Money cents={crew.weekly_goal_cents} size="sm" icon={false} decimals="never" /> goal
            </span>
          </div>
          <Progress size="sm" tone="mint" value={Math.min(crew.week_cleared_cents, crew.weekly_goal_cents)} max={crew.weekly_goal_cents} aria-label={`${crew.name} weekly goal`} />
        </div>
        <div className="mt-auto grid gap-2 pt-1">
          {crew.can_join ? (
            <Button variant="secondary" loading={busy} onClick={() => onJoin(crew)}>
              Join {crew.name}
            </Button>
          ) : !crew.open && !inCrew && !full ? (
            <Button variant="secondary" leadingIcon={<KeyRound />} onClick={() => onJoinWithCode(crew)}>
              Join with a code
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              Join
            </Button>
          )}
          {!crew.can_join && crew.join_blocked_reason && !inCrew ? <p className="text-caption text-fg-subtle">{crew.join_blocked_reason}</p> : null}
        </div>
      </GlassCard>
    </li>
  );
}
