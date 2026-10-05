"use client";

import { Banknote, FileVideo, LifeBuoy, MessageSquare, ShieldAlert, Target, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui";
import type { ThreadKind } from "@/lib/contract/types";
import type { ThreadView } from "@/lib/data/selectors";
import { excerpt, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ThreadKind, LucideIcon> = { offer: Banknote, submission: FileVideo, bounty: Target, support: LifeBuoy };

export interface ThreadListProps {
  threads: readonly ThreadView[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  now: number;
}

/**
 * One conversation per row: who it is with, what it is about, the last words and when, an unread count and a pill when it is waiting
 * on you. A Scam Shield flag shows as a shield. The whole row is one button, selected state is a ring plus `aria-current`.
 */
export function ThreadList({ threads, selectedId, onSelect, now }: ThreadListProps) {
  return (
    <ul aria-label="Conversations" className="grid gap-1.5">
      {threads.map((thread) => {
        const selected = thread.id === selectedId;
        const Icon = KIND_ICON[thread.kind] ?? MessageSquare;
        const needsYou = thread.offer?.my_turn === true;
        return (
          <li key={thread.id}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(thread.id)}
              className={cn(
                "grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 rounded-xl p-3 text-left transition-colors duration-(--fd-dur-fast) ease-standard active:scale-[0.99]",
                selected ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright)]" : "hover:bg-surface-hover",
              )}
            >
              <Avatar name={thread.counterpart.name} size={40} shape={thread.counterpart.kind === "creator" ? "circle" : "square"} decorative />
              <span className="grid min-w-0 gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-body-sm", thread.unread > 0 ? "font-semibold text-fg" : "font-medium text-fg")}>{thread.counterpart.name}</span>
                  <span className="shrink-0 text-micro text-fg-subtle">{thread.last_message ? formatRelative(thread.last_message_at, now, { style: "short" }) : ""}</span>
                </span>
                <span className="flex items-center gap-1.5 text-caption text-fg-muted">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{thread.title}</span>
                </span>
                <span className="line-clamp-1 text-caption text-fg-subtle">{thread.last_message ? excerpt(thread.last_message.body, 70) : "No messages yet"}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {thread.unread > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-solid px-1.5 text-micro font-semibold text-on-accent tabular-nums">
                      {thread.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                  {needsYou ? <span className="inline-flex h-5 items-center rounded-pill bg-ember-soft px-2 text-micro font-semibold text-ember">Waiting on you</span> : null}
                  {thread.has_warning ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-pill bg-sun-soft px-2 text-micro font-semibold text-sun">
                      <ShieldAlert aria-hidden="true" className="size-3" />
                      Scam Shield
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
