"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { COMPETITORS, type Competitor } from "./compare-data";
import { CompareGrid } from "./compare-grid";

const MAX = 3;

/** Choose who to put beside flowd (one to three). Wide screens show a table, phones a card per topic; both come from the same dated facts. */
export function CompareExplorer({ initial = ["trybe", "whop"], className }: { initial?: readonly Competitor["id"][]; className?: string }) {
  const [selected, setSelected] = useState<readonly Competitor["id"][]>(initial);
  const chosen = COMPETITORS.filter((competitor) => selected.includes(competitor.id));

  const toggle = (id: Competitor["id"]): void => {
    setSelected((current) => {
      if (current.includes(id)) return current.length > 1 ? current.filter((value) => value !== id) : current;
      return current.length >= MAX ? [...current.slice(1), id] : [...current, id];
    });
  };

  return (
    <div className={cn("grid gap-6", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span id="compare-with" className="text-body-sm font-semibold text-fg">
          Compare flowd with
        </span>
        <ChipGroup aria-labelledby="compare-with">
          {COMPETITORS.map((competitor) => (
            <Chip key={competitor.id} selected={selected.includes(competitor.id)} onSelectedChange={() => toggle(competitor.id)}>
              {competitor.name}
            </Chip>
          ))}
        </ChipGroup>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="About the products compared">
        {chosen.map((competitor) => (
          <li key={competitor.id} className="text-caption text-fg-muted">
            <strong className="font-semibold text-fg">{competitor.name}.</strong> {competitor.summary}
          </li>
        ))}
      </ul>
      <CompareGrid competitors={chosen} caption={`flowd compared with ${chosen.map((competitor) => competitor.name).join(", ")}, topic by topic`} />
      <ul className="grid gap-1 text-caption text-fg-subtle" aria-label="Sources">
        {chosen.map((competitor) => (
          <li key={competitor.id}>
            <strong className="font-semibold text-fg-muted">{competitor.name}:</strong> {competitor.sources}
          </li>
        ))}
      </ul>
    </div>
  );
}
