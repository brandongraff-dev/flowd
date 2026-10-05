"use client";

import { Hourglass } from "lucide-react";
import { POST_STATUS_META, type PostStatus } from "@/lib/contract/types";
import type { PostView } from "@/lib/data/selectors";
import { formatCompact, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DomainStatusPill } from "@/components/brand";
import { Progress } from "@/components/ui";
import type { MoneyState } from "@/components/ui";

export function PostStatusPill({ status, className }: { status: PostStatus; className?: string }) {
  return <DomainStatusPill meta={POST_STATUS_META[status]} value={status} size="md" className={className} />;
}

/** The money state a post's earnings are in, for the figure's colour and glyph. */
export function moneyStateOf(status: PostStatus): MoneyState {
  switch (status) {
    case "cleared":
      return "cleared";
    case "paid":
      return "paid";
    case "removed":
    case "clawed_back":
      return "negative";
    default:
      return "pending";
  }
}

/** The 72-hour window as a bar and a sentence: "Views counting for 38 more hours" or "Window closed. Verified views are final." */
export function WindowBar({ post, className }: { post: Pick<PostView, "window" | "status">; className?: string }) {
  const { window: w } = post;
  if (!w.is_open) {
    return (
      <p className={cn("flex items-center gap-1.5 text-caption text-fg-muted", className)}>
        <Hourglass aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={2} />
        {post.status === "removed" ? "Removed before the window closed." : "View window closed. Verified views are final."}
      </p>
    );
  }
  const hours = Math.max(1, Math.round(w.hours_left));
  return (
    <Progress
      className={className}
      size="sm"
      tone="mint"
      value={Math.round(w.progress * 100)}
      aria-label="72-hour view window"
      valueText={`${hours} hours of the window left`}
      label="Views counting"
      trailing={`${hours} h left`}
    />
  );
}

/** A tiny retention readout: how much of the video the average viewer watches, and where most people leave. */
export function retentionLine(post: Pick<PostView, "retention" | "duration_ms">): string {
  const avg = Math.round(post.retention.avg_watch_ratio * 100);
  const drop = post.retention.biggest_drop_at_s;
  return `Viewers watch ${avg}% on average${drop !== undefined ? `; the biggest drop is at ${formatDuration(drop)}` : ""}.`;
}

export const viewsText = (n: number): string => `${formatCompact(n)} views`;
