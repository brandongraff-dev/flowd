"use client";

import { Gift, LogOut, UsersRound } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, CopyField, Money, Progress } from "@/components/ui";
import { CREW_ROLE_META, NICHE_META } from "@/lib/contract/types";
import type { CrewView } from "@/lib/data/selectors";
import { CONSTANTS, mulRate } from "@/lib/engine";
import { Person } from "../shared/person";

/** What the weekly goal pays if the week closes where it stands: a share of what the crew cleared, capped, funded by flowd. */
function bonusEstimate(cleared: number): number {
  return Math.min(CONSTANTS.crews.weekly_goal_bonus_cap_cents, mulRate(cleared, CONSTANTS.crews.weekly_goal_bonus_rate));
}

export interface MyCrewProps {
  crew: CrewView;
  crewCount: number;
  /** The signed-in creator, so their row is marked. */
  meId?: string;
  onLeave: () => void;
}

/** Your crew: who they are, the weekly goal as a progress bar with the flowd-funded bonus, how to invite, and the members ranked by this week's cleared money. */
export function MyCrew({ crew, crewCount, meId, onLeave }: MyCrewProps) {
  const reached = crew.week_cleared_cents >= crew.weekly_goal_cents;
  const percent = Math.round(crew.goal_ratio * 100);
  return (
    <GlassCard padding="lg" aria-labelledby="my-crew-title" className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-6">
        <div className="flex items-start gap-4">
          <ArtAvatar art={crew.art} name={crew.name} shape="square" size={72} decorative />
          <div className="grid min-w-0 gap-1.5">
            <p className="fd-eyebrow text-accent">Your crew</p>
            <h2 id="my-crew-title" className="font-display text-title-lg text-fg">
              {crew.name}
            </h2>
            <p className="text-body text-fg-muted">{crew.tagline}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge tone={NICHE_META[crew.niche].tone} size="md">
                {NICHE_META[crew.niche].label}
              </Badge>
              <Badge tone="neutral" size="md" icon={<UsersRound />}>
                {crew.member_count} of {CONSTANTS.crews.max_members}
              </Badge>
              <Badge tone="neutral" size="md">
                {crew.open ? "Open to join" : "Invite only"}
              </Badge>
              <Badge tone="neutral" size="md">
                #{crew.week_rank} of {crewCount} this week
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl bg-surface-field p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-body-sm font-semibold text-fg">Weekly goal</p>
            <p className="text-caption text-fg-subtle">Resets Monday 00:00 UTC</p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Money cents={crew.week_cleared_cents} size="lg" state="cleared" decimals="never" />
            <span className="text-body-sm text-fg-muted">
              of <Money cents={crew.weekly_goal_cents} size="sm" decimals="never" icon={false} />
            </span>
          </div>
          <Progress value={Math.min(crew.week_cleared_cents, crew.weekly_goal_cents)} max={crew.weekly_goal_cents} tone="mint" aria-label="Crew weekly goal" valueText={`${percent}% of the weekly goal cleared`} />
          <p className="flex items-start gap-2 text-caption text-fg-muted">
            <Gift aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" />
            {reached ? (
              <span>
                Goal reached. If the week closes here flowd pays the crew about <Money cents={bonusEstimate(crew.week_cleared_cents)} size="sm" state="cleared" icon={false} /> as a bonus.
              </span>
            ) : (
              <span>
                Reach the goal and flowd pays the crew {Math.round(CONSTANTS.crews.weekly_goal_bonus_rate * 100)}% of what it cleared, up to <Money cents={CONSTANTS.crews.weekly_goal_bonus_cap_cents} size="sm" decimals="never" icon={false} />. The bonus comes from flowd, never from members.
              </span>
            )}
          </p>
        </div>

        <div className="grid gap-3">
          <p className="text-body-sm font-semibold text-fg">Invite someone</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField aria-label="Crew invite link" value={crew.invite_url} />
            <CopyField aria-label="Crew invite code" value={crew.invite_code} />
          </div>
        </div>

        <div className="grid gap-3 border-t border-divider pt-5">
          <p className="text-body-sm font-semibold text-fg">How crews work</p>
          <ul className="grid gap-2 text-body-sm text-fg-muted">
            <li>Everyone&rsquo;s cleared money this week counts toward one shared goal.</li>
            <li>Crews hold 3 to 20 creators. Anyone eligible can join an open crew, and a Gold creator leads it.</li>
            <li>Nothing is taken from members. A crew never costs money, and you can leave in one tap.</li>
          </ul>
          <div>
            <Button variant="ghost" size="sm" leadingIcon={<LogOut />} onClick={onLeave}>
              Leave crew
            </Button>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-title-md text-fg">Crew board</h3>
          <p className="text-caption text-fg-subtle">Cleared this week</p>
        </div>
        <ol className="grid divide-y divide-divider overflow-hidden rounded-xl bg-surface-field/60">
          {crew.week_leaderboard.map((member, index) => (
            <li key={member.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5">
              <span className="text-center font-display text-title-sm text-fg-muted tabular-nums">{index + 1}</span>
              <Person creator={member.creator} size={36} you={member.creator_id === meId} detail={CREW_ROLE_META[member.role].label} />
              <Money cents={member.week_cleared_cents} size="sm" icon={false} />
            </li>
          ))}
        </ol>
        <p className="text-caption text-fg-subtle">Members see each other&rsquo;s cleared totals for the week. You can leave any time.</p>
      </div>
    </GlassCard>
  );
}
