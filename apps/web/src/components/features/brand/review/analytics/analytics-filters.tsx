"use client";

import { X } from "lucide-react";
import { FORMAT_ID_META, FORMAT_IDS, HOOK_TYPE_META, HOOK_TYPES, PLATFORM_META } from "@/lib/contract/types";
import type { Platform } from "@/lib/contract/types";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeChoice = (typeof RANGES)[number];

export interface AnalyticsFilters {
  range: RangeChoice;
  bounty: string | null;
  creator: string | null;
  hook: string | null;
  format: string | null;
  platform: string | null;
}

const ALL = "all";

interface Option {
  value: string;
  label: string;
}

export interface FilterBarProps {
  filters: AnalyticsFilters;
  bounties: readonly Option[];
  creators: readonly Option[];
  onChange: <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => void;
  onClear: () => void;
}

const withAll = (label: string, options: readonly Option[]): Option[] => [{ value: ALL, label }, ...options];

/** The filters of the funnel, in one row above everything they change (dataviz: page-level filters live above the charts). */
export function FilterBar({ filters, bounties, creators, onChange, onClear }: FilterBarProps) {
  const applied = [filters.bounty, filters.creator, filters.hook, filters.format, filters.platform].filter(Boolean).length;
  const pick = (key: "bounty" | "creator" | "hook" | "format" | "platform") => (value: string) => onChange(key, value === ALL ? null : value);
  return (
    <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Filters">
      <SegmentedControl
        aria-label="Posted in the last"
        size="sm"
        value={filters.range}
        onValueChange={(next) => onChange("range", next)}
        options={[
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
          { value: "90d", label: "90 days" },
          { value: "all", label: "All time" },
        ]}
      />
      <Select size="sm" aria-label="Bounty" value={filters.bounty ?? ALL} onValueChange={pick("bounty")} options={withAll("All bounties", bounties)} className="w-48" />
      <Select size="sm" aria-label="Creator" value={filters.creator ?? ALL} onValueChange={pick("creator")} options={withAll("All creators", creators)} className="w-44" />
      <Select size="sm" aria-label="Hook type" value={filters.hook ?? ALL} onValueChange={pick("hook")} options={withAll("All hooks", HOOK_TYPES.map((h) => ({ value: h, label: HOOK_TYPE_META[h].label })))} className="w-40" />
      <Select size="sm" aria-label="Format" value={filters.format ?? ALL} onValueChange={pick("format")} options={withAll("All formats", FORMAT_IDS.map((f) => ({ value: f, label: FORMAT_ID_META[f].label })))} className="w-48" />
      <Select size="sm" aria-label="Platform" value={filters.platform ?? ALL} onValueChange={pick("platform")} options={withAll("All platforms", (Object.keys(PLATFORM_META) as Platform[]).map((p) => ({ value: p, label: PLATFORM_META[p].label })))} className="w-40" />
      {applied > 0 ? (
        <Button variant="plain" size="sm" leadingIcon={<X />} onClick={onClear}>
          Clear {applied === 1 ? "filter" : `${applied} filters`}
        </Button>
      ) : null}
    </div>
  );
}
