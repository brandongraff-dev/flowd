"use client";

import { ACTIVITY_ACTION_META } from "@/lib/contract/types";
import type { BrandOverview } from "@/lib/data/selectors";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Panel, PanelLink } from "../common";

/** Recent workspace activity from the audit log, newest first. Who did what, in plain English, with a dated time. */
export function ActivityCard({ loading, activity, now }: { loading: boolean; activity: BrandOverview["activity"]; now: string }) {
  return (
    <Panel title="Activity" description="Everything your team and flowd did in this workspace" actions={<PanelLink href="/brand/team">Team and activity</PanelLink>}>
      {loading ? (
        <SkeletonGroup label="Loading activity" className="grid gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-2 shrink-0" />
              <Skeleton shape="text" className="w-4/5" />
            </div>
          ))}
        </SkeletonGroup>
      ) : activity.length === 0 ? (
        <EmptyState art="inbox" size="sm" title="No activity yet" description="Funding, approvals and plan changes are logged here with who did them." />
      ) : (
        <ol className="grid">
          {activity.slice(0, 6).map((entry, index) => {
            const meta = ACTIVITY_ACTION_META[entry.action];
            return (
              <li key={entry.id} className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 pb-4 last:pb-0">
                {index < Math.min(activity.length, 6) - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-0 left-[3.5px] w-px bg-divider" /> : null}
                <span aria-hidden="true" className={cn("mt-[7px] size-[8px] rounded-full", toneClasses(meta.tone, "solid"))} />
                <p className="text-body-sm text-fg-muted">{entry.summary}</p>
                <time dateTime={entry.at} className="pt-0.5 text-caption whitespace-nowrap text-fg-subtle">
                  {formatRelative(entry.at, now, { style: "short" })}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
