"use client";

import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { NOTIFICATION_KIND_META } from "@/lib/contract/types";
import { useDemoNow, useNotifications, useStoreReady } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";

export interface BrandNotificationsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The notifications drawer: "Needs you" first (reviews waiting, funding, expiring rights, disputes), then everything else, newest first.
 * Every row is a real link to the page that resolves it, and opening one marks it read. Clear the whole list in one tap.
 */
export function BrandNotifications({ open, onOpenChange }: BrandNotificationsProps) {
  const ready = useStoreReady();
  const now = useDemoNow();
  const { items, unread, needs_you } = useNotifications({ limit: 40 });
  const needsIds = new Set(needs_you.map((item) => item.id));
  const rest = items.filter((item) => !needsIds.has(item.id));

  const markAll = async (): Promise<void> => {
    const result = await actions.markAllNotificationsRead();
    if (result.ok) notify.success(result.data.count === 1 ? "1 notification marked as read" : `${result.data.count} notifications marked as read`);
    else notify.error(result.error.message, { description: result.error.hint });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {unread > 0 ? `${unread} unread. The ones that need a decision are first.` : "You are all caught up."}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="grid content-start gap-6">
          {!ready ? (
            <div role="status" aria-label="Loading notifications" className="grid gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-[76px] w-full rounded-[20px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState art="inbox" size="sm" title="Nothing needs you" description="Reviews, funding and expiring rights show up here the moment they need a decision." />
          ) : (
            <>
              {needs_you.length > 0 ? (
                <NotificationGroup title="Needs you" items={needs_you} now={now} onNavigate={() => onOpenChange(false)} />
              ) : null}
              {rest.length > 0 ? <NotificationGroup title={needs_you.length > 0 ? "Earlier" : "Recent"} items={rest} now={now} onNavigate={() => onOpenChange(false)} /> : null}
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" leadingIcon={<CheckCheck aria-hidden="true" />} disabled={unread === 0} onClick={markAll}>
            Mark all as read
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type NotificationItems = ReturnType<typeof useNotifications>["items"];

function NotificationGroup({ title, items, now, onNavigate }: { title: string; items: NotificationItems; now: string; onNavigate: () => void }) {
  return (
    <section aria-label={title} className="grid gap-2.5">
      <h3 className="fd-eyebrow text-fg-subtle">{title}</h3>
      <ul className="grid gap-2">
        {items.map((item) => {
          const meta = NOTIFICATION_KIND_META[item.kind];
          const body = (
            <>
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {item.unread ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent-solid" /> : null}
                  <span className={cn("truncate text-body-sm text-fg", item.unread ? "font-semibold" : "font-medium")}>{item.title}</span>
                  {item.unread ? <span className="sr-only">Unread</span> : null}
                </span>
                <time dateTime={item.created_at} className="shrink-0 pt-px text-caption text-fg-subtle">
                  {formatRelative(item.created_at, now, { style: "short" })}
                </time>
              </span>
              <span className="line-clamp-2 text-caption text-fg-muted">{item.body}</span>
              <span className="flex">
                <Badge tone={meta.tone} size="sm">
                  {meta.label}
                </Badge>
              </span>
            </>
          );
          const className = "grid gap-1.5 rounded-[20px] bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover";
          const markRead = (): void => {
            if (item.unread) void actions.markNotificationRead({ id: item.id });
            onNavigate();
          };
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} onClick={markRead} className={className}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={markRead} className={cn(className, "w-full text-left")}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
