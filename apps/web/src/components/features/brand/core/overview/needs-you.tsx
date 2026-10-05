"use client";

import Link from "next/link";
import { ChevronRight, FileCheck2, Flame, ListChecks, Megaphone, Scale, ShieldAlert, ShieldCheck, Timer, WalletMinimal, type LucideIcon } from "lucide-react";
import type { NeedsItem } from "@/lib/data/selectors";
import { cn } from "@/lib/utils";
import { Badge, toneClasses, type Tone } from "@/components/ui/badge";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Panel } from "../common";

const ICON: Record<NeedsItem["kind"], LucideIcon> = {
  review: ListChecks,
  sla: Timer,
  dispute: Scale,
  rights: FileCheck2,
  funding: WalletMinimal,
  fatigue: Flame,
  promotion: Megaphone,
  qa: ShieldAlert,
};

/** Colour carries urgency, never meaning alone: the glyph and the words say what it is. */
const toneOf = (item: NeedsItem): Tone => (item.priority <= 1 ? "rose" : item.priority === 2 ? "ember" : item.priority <= 4 ? "accent" : "neutral");

export interface NeedsYouProps {
  loading: boolean;
  items: readonly NeedsItem[];
  waiting: number;
  oldestHours: number | null;
}

/**
 * "Needs you": what is waiting on a decision, most urgent first. It sits top-right of the overview because action comes before reporting. Every
 * row is a real link to the page that clears it. Empty is a quiet success, not a blank.
 */
export function NeedsYou({ loading, items, waiting, oldestHours }: NeedsYouProps) {
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          Needs you
          {!loading && items.length > 0 ? (
            <Badge tone={items[0] && items[0].priority <= 2 ? "ember" : "accent"} size="sm">
              <span className="sr-only">{items.length} items</span>
              <span aria-hidden="true">{items.length}</span>
            </Badge>
          ) : null}
        </span>
      }
      description={
        loading
          ? undefined
          : waiting > 0
            ? `${waiting} in review${oldestHours !== null ? `, the oldest ${Math.round(oldestHours)} hours` : ""}. Decide within 48 hours and creators are paid sooner.`
            : "A decision here is a payout there."
      }
    >
      {loading ? (
        <SkeletonGroup label="Loading what needs you" className="grid gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-9 shrink-0" />
              <div className="grid flex-1 gap-2">
                <Skeleton shape="text" className="w-4/5" />
                <Skeleton shape="text" className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </SkeletonGroup>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-full", toneClasses("mint"))}>
            <ShieldCheck className="size-[18px]" strokeWidth={2} />
          </span>
          <div className="grid gap-0.5">
            <p className="text-body-sm font-semibold text-fg">Nothing needs you</p>
            <p className="text-caption text-fg-muted">Every video has a decision, every bounty is funded and no licence ends this month.</p>
          </div>
        </div>
      ) : (
        <ul className="-mx-1.5 grid gap-0.5">
          {items.slice(0, 6).map((item) => {
            const Icon = ICON[item.kind];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] p-2.5 transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover"
                >
                  <span aria-hidden="true" className={cn("grid size-9 place-items-center rounded-full", toneClasses(toneOf(item)))}>
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-body-sm font-semibold text-fg">{item.title}</span>
                    {item.detail ? <span className="text-caption text-fg-subtle">{item.detail}</span> : null}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
