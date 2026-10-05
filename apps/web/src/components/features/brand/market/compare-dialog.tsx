"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArtAvatar, TierBadge, TIER_LABEL } from "@/components/brand";
import { Badge, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui";
import type { CreatorCard as CreatorCardRow } from "@/lib/data/selectors/creators";
import { formatCompact, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { costPerTrialText } from "./creator-bits";

interface CompareRow {
  id: string;
  label: string;
  /** The text of each creator's cell, in column order. */
  cells: readonly ReactNode[];
  /** The best value, by index, when one is clearly better (a lower price, a higher approval). */
  best?: readonly number[];
  note?: string;
}

function bestIndexes(values: readonly (number | null)[], direction: "high" | "low"): number[] {
  const real = values.map((value, index) => ({ value, index })).filter((entry): entry is { value: number; index: number } => entry.value !== null);
  if (real.length < 2) return [];
  const target = direction === "high" ? Math.max(...real.map((entry) => entry.value)) : Math.min(...real.map((entry) => entry.value));
  const winners = real.filter((entry) => entry.value === target).map((entry) => entry.index);
  return winners.length === real.length ? [] : winners;
}

function rowsFor(items: readonly CreatorCardRow[]): readonly CompareRow[] {
  const reliability = items.map((row) => (row.reliability?.kind === "verdict" ? row.reliability.score : null));
  const approval = items.map((row) => (row.creator.decided_count > 0 ? row.creator.approval_rate : null));
  const hit = items.map((row) => row.hit_rate);
  const views = items.map((row) => (row.median_views > 0 ? row.median_views : null));
  const us = items.map((row) => (row.us_audience_ratio > 0 ? row.us_audience_ratio : null));
  const price = items.map((row) => (row.rate_card?.accepts_direct_offers ? row.rate_card.price_per_video_cents : null));
  const cpt = items.map((row) => row.on_my_apps.cost_per_trial_cents);
  const response = items.map((row) => row.rate_card?.stats.median_response_hours ?? null);
  return [
    { id: "tier", label: "Tier", cells: items.map((row) => <span key={row.creator.id} className="inline-flex items-center gap-1.5"><TierBadge tier={row.creator.tier} size={20} decorative />{TIER_LABEL[row.creator.tier]}</span>) },
    {
      id: "reliability",
      label: "Reliability",
      cells: items.map((row) => (row.reliability ? (row.reliability.kind === "verdict" ? String(row.reliability.score) : `${row.reliability.low} to ${row.reliability.high}, building history`) : "No finished work")),
      best: bestIndexes(reliability, "high"),
    },
    { id: "approval", label: "Approval rate", cells: items.map((row) => (row.creator.decided_count > 0 ? `${formatPct(row.creator.approval_rate, 0)} of ${row.creator.decided_count}` : "No decisions yet")), best: bestIndexes(approval, "high") },
    { id: "hit", label: "Hit rate", cells: items.map((row) => (row.hit_rate === null ? "Needs 5 posts" : formatPct(row.hit_rate, 0))), best: bestIndexes(hit, "high") },
    { id: "views", label: "Median views", cells: items.map((row) => (row.median_views > 0 ? `${formatCompact(row.median_views)} on ${formatCompact(row.followers)} followers` : "No views yet")), best: bestIndexes(views, "high") },
    { id: "us", label: "US audience", cells: items.map((row) => (row.us_audience_ratio > 0 ? formatPct(row.us_audience_ratio, 0) : "Unknown")), best: bestIndexes(us, "high") },
    { id: "price", label: "Price per video", cells: items.map((row) => (row.rate_card?.accepts_direct_offers ? formatMoney(row.rate_card.price_per_video_cents, { cents: "never" }) : "Not taking offers")), best: bestIndexes(price, "low") },
    { id: "turn", label: "Turnaround", cells: items.map((row) => (row.rate_card ? `${row.rate_card.turnaround_days} days` : "Not set")) },
    { id: "response", label: "Replies in", cells: items.map((row) => (row.rate_card ? `about ${Math.max(1, Math.round(row.rate_card.stats.median_response_hours))} h` : "Unknown")), best: bestIndexes(response, "low") },
    { id: "posts", label: "Posts for your apps", cells: items.map((row) => (row.on_my_apps.posts > 0 ? String(row.on_my_apps.posts) : "None yet")) },
    { id: "cpt", label: "Cost per trial on your apps", cells: items.map((row) => costPerTrialText(row.on_my_apps.cost_per_trial_cents)), best: bestIndexes(cpt, "low"), note: "Tracked trials only" },
  ];
}

/** Two to four creators side by side. The best figure in a row is marked in words ("Best"), not just colour. */
export function CompareDialog({ open, onOpenChange, items, onOffer }: { open: boolean; onOpenChange: (open: boolean) => void; items: readonly CreatorCardRow[]; onOffer: (items: readonly CreatorCardRow[]) => void }) {
  const rows = rowsFor(items);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-[min(64rem,calc(100vw-1.5rem))]">
        <DialogHeader>
          <DialogTitle>Compare creators</DialogTitle>
          <DialogDescription>Verified results from finished work. A figure marked Best leads its row. Cost per trial counts tracked trials on your apps only.</DialogDescription>
        </DialogHeader>
        <DialogBody className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-body-sm">
            <caption className="sr-only">Creators compared across tier, reliability, approval, reach, price and results on your apps</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-40 bg-surface-glass-3 pr-4 pb-4 align-bottom text-caption font-medium text-fg-subtle">
                  <span className="sr-only">Measure</span>
                </th>
                {items.map((row) => (
                  <th key={row.creator.id} scope="col" className="min-w-40 px-3 pb-4 align-bottom">
                    <div className="grid justify-items-start gap-2">
                      <ArtAvatar art={row.creator.avatar} name={row.creator.display_name} size={40} decorative />
                      <Link href={`/brand/creators/${row.creator.handle}`} className="font-semibold text-fg hover:underline">
                        @{row.creator.handle}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="sticky left-0 z-10 border-t border-divider bg-surface-glass-3 py-3 pr-4 align-top text-caption font-medium text-fg-muted">
                    {row.label}
                    {row.note ? <span className="block text-micro font-normal text-fg-subtle">{row.note}</span> : null}
                  </th>
                  {row.cells.map((cell, index) => {
                    const best = row.best?.includes(index) ?? false;
                    return (
                      <td key={items[index]?.creator.id ?? index} className={cn("border-t border-divider px-3 py-3 align-top tabular-nums", best ? "font-semibold text-fg" : "text-fg-muted")}>
                        <span className="grid justify-items-start gap-1">
                          <span>{cell}</span>
                          {best ? (
                            <Badge size="sm" tone="accent">
                              Best
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onOpenChange(false);
              onOffer(items);
            }}
          >
            Send offers to these {items.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
