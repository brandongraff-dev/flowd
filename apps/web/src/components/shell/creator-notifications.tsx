"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  Bell,
  CircleAlert,
  CircleCheck,
  Clock,
  FileCheck2,
  Flame,
  HandCoins,
  Handshake,
  Medal,
  RotateCcw,
  Scale,
  ShieldAlert,
  Sparkles,
  Timer,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NOTIFICATION_KIND_META, type NotificationKind } from "@/lib/contract/types";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { useNotifications } from "@/lib/data";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge, Button, EmptyState, Money, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, toneClasses, notify } from "@/components/ui";

const KIND_ICON: Partial<Record<NotificationKind, LucideIcon>> = {
  approval: CircleCheck,
  changes_requested: RotateCcw,
  rejection: CircleAlert,
  appeal_decided: Scale,
  post_live: Timer,
  views_milestone: Sparkles,
  cash_event: HandCoins,
  payout_cleared: BadgeCheck,
  payout_paid: Banknote,
  payout_held: Clock,
  tier_up: Medal,
  streak_milestone: Flame,
  streak_freeze_used: Flame,
  drop_live: Zap,
  drop_reminder: Zap,
  offer_received: Handshake,
  offer_countered: Handshake,
  offer_accepted: Handshake,
  crew_invite: Users,
  rights_expiring: FileCheck2,
  rights_renewed: FileCheck2,
  dispute_update: Scale,
  tax_info_needed: FileCheck2,
  scam_warning: ShieldAlert,
  flo_tip: Sparkles,
};

export interface CreatorNotificationsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The creator's notification drawer: what needs you first (changes requested, a held payout, an offer), then everything else, newest first. Cash
 * events keep their amount as a figure. Opening one marks it read and goes where it points; "Mark all read" clears the dot.
 */
export function CreatorNotifications({ open, onOpenChange }: CreatorNotificationsProps) {
  const router = useRouter();
  const now = useNow();
  const { items, unread, needs_you } = useNotifications();
  const needsIds = new Set(needs_you.map((n) => n.id));
  const rest = items.filter((n) => !needsIds.has(n.id));

  const go = async (id: string, href: string | null, isUnread: boolean): Promise<void> => {
    if (isUnread) await actions.markNotificationRead({ id });
    onOpenChange(false);
    if (href) router.push(href);
  };

  const markAll = async (): Promise<void> => {
    const result = await actions.markAllNotificationsRead();
    if (result.ok) notify.message("All caught up", { description: result.data.count === 1 ? "1 notification marked read." : `${result.data.count} notifications marked read.` });
    else notify.error(result.error.message, { description: result.error.hint });
  };

  const row = (n: (typeof items)[number], highlighted: boolean): ReactElement => {
    const Icon = KIND_ICON[n.kind] ?? Bell;
    const meta = NOTIFICATION_KIND_META[n.kind];
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => void go(n.id, n.href, n.unread)}
          className={cn(
            "group grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 rounded-2xl p-3 text-left transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:min-h-14",
            highlighted && "bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]",
          )}
        >
          <span aria-hidden="true" className={cn("grid size-9 place-items-center rounded-full [&_svg]:size-[18px] [&_svg]:stroke-[1.85]", toneClasses(meta.tone, "soft"))}>
            <Icon />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className={cn("truncate text-body-sm text-fg", n.unread ? "font-semibold" : "font-medium")}>
                {n.title}
                {n.unread ? <span className="sr-only"> (unread)</span> : null}
              </span>
              <time dateTime={n.created_at} className="shrink-0 text-micro text-fg-subtle tabular-nums">
                {formatRelative(n.created_at, now, { style: "short" })}
              </time>
            </span>
            {n.amount_cents !== undefined ? <Money cents={n.amount_cents} state="cleared" signDisplay="always" size="md" icon={false} decimals="always" /> : null}
            <span className="line-clamp-2 text-caption text-fg-muted">{n.body}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>{unread > 0 ? `${unread} unread. Cash events arrive at once; the rest are batched in quiet hours.` : "You are all caught up. Cash events arrive at once."}</SheetDescription>
        </SheetHeader>
        <SheetBody className="grid content-start gap-5">
          {items.length === 0 ? (
            <EmptyState art="inbox" size="sm" title="Nothing yet" description="Approvals, cleared money and offers show up here, each with a link to the thing." />
          ) : (
            <>
              {needs_you.length > 0 ? (
                <section aria-labelledby="needs-you-title" className="grid gap-2">
                  <h3 id="needs-you-title" className="flex items-center gap-2 px-1 text-caption font-semibold text-fg-muted">
                    Needs you
                    <Badge tone="ember" size="sm">
                      {needs_you.length}
                    </Badge>
                  </h3>
                  <ul className="grid gap-1">{needs_you.map((n) => row(n, true))}</ul>
                </section>
              ) : null}
              {rest.length > 0 ? (
                <section aria-labelledby="earlier-title" className="grid gap-2">
                  <h3 id="earlier-title" className="px-1 text-caption font-semibold text-fg-muted">
                    {needs_you.length > 0 ? "Everything else" : "Recent"}
                  </h3>
                  <ul className="grid gap-1">{rest.map((n) => row(n, false))}</ul>
                </section>
              ) : null}
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" size="sm" disabled={unread === 0} onClick={() => void markAll()}>
            Mark all read
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
