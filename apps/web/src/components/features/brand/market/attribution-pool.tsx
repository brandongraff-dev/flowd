"use client";

import { CalendarClock, Plus } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, EmptyState } from "@/components/ui";
import type { OfferCode } from "@/lib/contract/types";
import type { CodePoolView } from "@/lib/data/selectors/workspace";
import { useDemoNow } from "@/lib/data";
import { formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX = 10;

function Lane({ code, handle, now }: { code: OfferCode; handle: string | undefined; now: string }) {
  const used = code.max_redemptions > 0 ? code.redemptions / code.max_redemptions : 0;
  const stale = code.redemptions >= code.max_redemptions || Date.parse(code.valid_until) <= Date.parse(now);
  return (
    <li className="grid gap-2 rounded-xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-code font-semibold text-fg">{code.code}</code>
        {stale ? (
          <Badge size="sm" tone="sun">
            Retire
          </Badge>
        ) : (
          <Badge size="sm" tone={code.status === "assigned" ? "accent" : "neutral"}>
            {code.status === "assigned" ? "Assigned" : "Available"}
          </Badge>
        )}
      </div>
      <p className="truncate text-caption text-fg-muted">{handle ? `@${handle}` : "Not assigned to a creator yet"}</p>
      <div className="grid gap-1" aria-label={`${formatInt(code.redemptions)} of ${formatInt(code.max_redemptions)} redemptions used`} role="img">
        <div className="h-1 overflow-hidden rounded-pill bg-surface-active">
          <div className="h-full rounded-pill bg-accent-solid" style={{ width: `${Math.max(used > 0 ? 3 : 0, Math.min(100, used * 100))}%` }} />
        </div>
        <p className="flex justify-between gap-2 text-micro text-fg-subtle tabular-nums">
          <span>{formatInt(code.redemptions)} redeemed</span>
          <span>of {formatInt(code.max_redemptions)}</span>
        </p>
      </div>
      <p className="flex items-center gap-1 text-micro text-fg-subtle">
        <CalendarClock aria-hidden="true" className="size-3" strokeWidth={1.75} />
        {code.rotation_due_at ? `Rotates ${formatDate(code.rotation_due_at, "short")}` : `Valid to ${formatDate(code.valid_until, "short")}`}
      </p>
    </li>
  );
}

function FreeLane() {
  return (
    <li className="grid min-h-[7.25rem] content-center justify-items-center gap-1 rounded-xl border border-dashed border-rim-strong p-3 text-center">
      <Plus aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
      <p className="text-caption font-medium text-fg-muted">Free lane</p>
      <p className="text-micro text-fg-subtle">The next creator&apos;s code goes here</p>
    </li>
  );
}

/**
 * The offer-code pool, as lanes. Apple allows ten active codes per subscription SKU: ten lanes, filled by codes that are assigned to creators,
 * dashed where one is free. Stale codes are marked "Retire" in words. Nothing here moves money; it shows capacity.
 */
export function CodePoolLanes({ pool, handles }: { pool: readonly CodePoolView[]; handles: ReadonlyMap<string, string> }) {
  const now = useDemoNow();
  if (pool.length === 0) {
    return (
      <GlassCard padding="lg">
        <EmptyState
          art="chart"
          size="sm"
          title="No offer codes yet"
          description="Create codes for your subscription in App Store Connect. flowd rotates a pool of up to ten active codes per subscription, and falls back to the tracked link when it is full."
        />
      </GlassCard>
    );
  }
  return (
    <div className="grid gap-4">
      {pool.map((sku) => {
        const { health } = sku;
        const lanes = Array.from({ length: MAX }, (_, index) => sku.codes[index]);
        return (
          <GlassCard key={sku.sku} padding="md" className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h3 className="font-display text-title-sm text-fg">{sku.offer_name}</h3>
                <p className="font-mono text-caption text-fg-subtle">{sku.sku}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge size="lg" tone="neutral">
                  <span className="tabular-nums">
                    {health.active} of {health.cap}
                  </span>{" "}
                  active
                </Badge>
                <Badge size="lg" tone={health.free_slots > 0 ? "neutral" : "ember"} variant="outline">
                  {health.free_slots > 0 ? `${health.free_slots} free ${health.free_slots === 1 ? "lane" : "lanes"}` : "Pool is full"}
                </Badge>
                {health.stale > 0 ? (
                  <Badge size="lg" tone="sun">
                    {health.stale} to retire
                  </Badge>
                ) : null}
              </div>
            </div>

            <div role="img" aria-label={`${health.active} of ${health.cap} lanes in use, ${health.assigned} assigned and ${health.available} available`} className="grid grid-cols-10 gap-1.5">
              {lanes.map((code, index) => (
                <span
                  key={index}
                  className={cn("h-2 rounded-pill", code ? (code.status === "assigned" ? "bg-accent-solid" : "bg-accent-solid/45") : "border border-dashed border-rim-strong")}
                />
              ))}
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={`Lanes for ${sku.sku}`}>
              {lanes.map((code, index) => (code ? <Lane key={code.id} code={code} now={now} handle={code.assigned_creator_id ? handles.get(code.assigned_creator_id) : undefined} /> : <FreeLane key={`free-${index}`} />))}
            </ul>
          </GlassCard>
        );
      })}
      <p className="text-caption text-fg-subtle">
        Apple allows 10 active offer codes per subscription. flowd rotates a pool, retires codes that are used up or expired, and always keeps the tracked link as the fallback, so a creator is never left without attribution. Redemption caps are Apple&apos;s: up to 25,000 per custom code.
      </p>
    </div>
  );
}
