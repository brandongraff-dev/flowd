"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Check, Zap } from "lucide-react";
import type { DropItemView, DropView } from "@/lib/data/selectors";
import { formatClockEta, formatEta } from "@/lib/format";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { useNow } from "@/lib/hooks/use-now";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Progress, Skeleton, Switch, notify } from "@/components/ui";
import { payParts } from "./bounty-parts";
import { useNotificationPrefs } from "./selectors";

const RELEASE_LABEL = "4:00 PM UTC";

/** One bounty in the drop: its real inventory ("3 of 7 left"), the pay, and one button that takes a true spot. */
function DropItemRow({ drop, item }: { drop: DropView; item: DropItemView }) {
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const claimed = item.claimed_by_me;
  const pay = payParts(item.bounty);

  const claim = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.claimDrop({ drop_id: drop.drop.id, bounty_id: item.bounty.id });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    notify.success("Spot held for you", { description: `Submit ${formatEta(result.data.claimed_until, { verb: "by", now })} UTC. After that the spot returns to the feed.` });
  };

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-3">
      <AppIcon art={item.bounty.app.icon} name={item.bounty.app.name} size={40} decorative />
      <div className="grid min-w-0 gap-0.5">
        <Link href={`/creator/bounties/${item.bounty.id}`} className="truncate rounded-sm text-body-sm font-semibold text-fg hover:underline">
          {item.bounty.title}
        </Link>
        <p className="truncate text-caption text-fg-muted">
          {item.bounty.app.name} · {pay.headline}
        </p>
        <Progress
          value={item.spots_total === 0 ? 0 : (item.spots_left / item.spots_total) * 100}
          size="sm"
          tone={item.spots_left <= 1 ? "ember" : "mint"}
          aria-label={`Spots left on ${item.bounty.title}`}
          valueText={`${item.spots_left} of ${item.spots_total} spots left`}
          className="mt-1 max-w-48"
        />
      </div>
      <div className="flex flex-col items-end gap-1">
        {claimed ? (
          <Link href={`/creator/studio?bounty=${item.bounty.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-mint-soft px-3.5 text-body-sm font-semibold text-mint">
            <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Make it
          </Link>
        ) : (
          <Button size="sm" variant="secondary" leadingIcon={<Zap className="text-ember" />} loading={busy} disabled={item.sold_out || drop.state !== "live"} onClick={() => void claim()} aria-label={`Claim a spot on ${item.bounty.title}`}>
            {item.sold_out ? "Sold out" : "Claim a spot"}
          </Button>
        )}
        <p className="text-micro text-fg-subtle tabular-nums">{claimed && item.claimed_until ? `Held until ${formatClockEta(item.claimed_until, { now })}` : `${item.spots_left} of ${item.spots_total} left`}</p>
      </div>
    </li>
  );
}

/** Pre-drop: a real countdown to 16:00 UTC, the true inventory, and one opt-in reminder. No fake scarcity: the numbers are the drop's own. */
function PreDrop({ drop }: { drop: DropView }) {
  const countdown = useCountdown(drop.release_at);
  const prefs = useNotificationPrefs();
  const [busy, setBusy] = useState(false);
  const apps = [...new Map(drop.items.map((i) => [i.bounty.app.id, i.bounty.app])).values()];

  const toggle = async (on: boolean): Promise<void> => {
    setBusy(true);
    const result = await actions.updateNotificationPrefs({ drop_reminder: on });
    setBusy(false);
    if (!result.ok) notify.error(result.error.message, { description: result.error.hint });
    else notify.message(on ? `We will remind you once, at ${RELEASE_LABEL}` : "Reminder off", { description: on ? "One notification when the drop opens. Nothing else." : undefined });
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="font-display text-figure-xl text-fg tabular-nums" aria-label={`Opens in ${countdown.label}`}>
          <span aria-hidden="true">{countdown.clock}</span>
        </p>
        <p className="text-body-sm text-fg-muted">{drop.headline}</p>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Apps in today's drop">
        {apps.slice(0, 6).map((app) => (
          <li key={app.id} className="flex items-center gap-2 text-caption font-medium text-fg-muted">
            <AppIcon art={app.icon} name={app.name} size={24} decorative />
            {app.name}
          </li>
        ))}
      </ul>
      <Switch
        label="Remind me when it opens"
        description={`One notification at ${RELEASE_LABEL}. No streak nudges, no second reminder.`}
        checked={prefs.drop_reminder}
        disabled={busy}
        onCheckedChange={(on) => void toggle(on)}
        containerClassName="rounded-2xl bg-surface-field px-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]"
      />
    </div>
  );
}

function LiveDrop({ drop }: { drop: DropView }) {
  const countdown = useCountdown(drop.claim_window_ends_at);
  return (
    <div className="grid gap-2">
      <p className="text-body-sm text-fg-muted">
        {drop.headline} Closes in <span className="font-semibold text-fg tabular-nums">{countdown.label}</span>. A claimed spot is held for 24 hours.
      </p>
      <ul className="grid divide-y divide-divider" aria-label="Bounties in today's drop">
        {drop.items.map((item) => (
          <DropItemRow key={item.bounty.id} drop={drop} item={item} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The Daily Drop: the one Ember on Home. Three honest states (pre-drop countdown, live with true spots left, sold out or closed with the next time),
 * built from the drop's own inventory: a claim takes one real spot and a spot you do not use goes back to the feed.
 */
export function DailyDropCard({ drop, loading, className }: { drop: DropView | null; loading?: boolean; className?: string }) {
  const now = useNow();
  const state = drop?.state;
  const live = state === "live";
  const ended = state === "sold_out" || state === "closed";

  return (
    <GlassCard tint="ember" padding="lg" className={cn("relative grid gap-5 overflow-hidden", className)} aria-busy={loading || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-title-md text-fg">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-ember-solid text-on-ember">
            <Zap className="size-4" strokeWidth={2.25} />
          </span>
          Daily Drop
        </h2>
        {drop ? (
          <Badge tone="ember" size="lg" icon={live ? <BellRing aria-hidden="true" /> : undefined}>
            {live ? `${drop.spots_left} of ${drop.spots_total} spots left` : ended ? (state === "sold_out" ? "Sold out" : "Closed") : `Opens ${RELEASE_LABEL}`}
          </Badge>
        ) : null}
      </div>

      {loading || !drop ? (
        <div className="grid gap-3" role="status" aria-label="Loading the Daily Drop">
          <Skeleton className="h-10 w-48" />
          <Skeleton shape="text" className="w-2/3" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : drop.state === "pre" ? (
        <PreDrop drop={drop} />
      ) : live ? (
        <LiveDrop drop={drop} />
      ) : (
        <div className="grid gap-2">
          <p className="font-display text-title-lg text-fg">{state === "sold_out" ? "Everything in today's drop is claimed." : "Today's drop has closed."}</p>
          <p className="text-body-sm text-fg-muted">
            The next drop opens {formatClockEta(drop.next_drop_at, { now })} UTC. Unclaimed spots are back in the open feed.
          </p>
          <Link href="/creator/feed" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-body-sm font-semibold text-accent hover:underline">
            Browse the feed
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
          </Link>
        </div>
      )}
    </GlassCard>
  );
}
