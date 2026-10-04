/**
 * Contract parity: every case in packages/contract/formula-vectors.json (generated from the reference formulas in
 * packages/contract/schema/formulas.mjs) must come out of the engine unchanged. The web engine, the iOS engine and the reference all
 * reproduce the same numbers, so DOMAIN.md's worked examples cannot drift from the code.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ConversionKind, FraudSignal, IsoTimestamp, Tier } from "@/lib/contract/types";
import type { CpaRates } from "../constants";
import { expectedEarnings } from "../earnings";
import { fraudScore, type FiredSignal } from "../fraud";
import { priceCurve } from "../market";
import { matchScore, type MatchInput } from "../matching";
import { conversionClearingRun, instantPayout, moneyClockState } from "../moneyclock";
import { firstBountyFunding, funding } from "../pricing";
import { brandReliability, slaState, type BrandReliabilityInput } from "../reputation";
import { scoreFlow, scoreHook, type FlowObservations, type HookObservations } from "../scoring";
import { settlePost } from "../settlement";
import { tierFor, tierProgress, type TierStats } from "../tiers";

const VECTORS_URL = new URL("../../../../../../packages/contract/formula-vectors.json", import.meta.url);
const path = fileURLToPath(VECTORS_URL);

interface Case<I, O> {
  in: I;
  out: O;
}

interface Vectors {
  contract_version: string;
  funding: Case<{ budget_cents?: number; take_rate?: number; brand_funds_cents?: number }, Record<string, number>>[];
  settle_post: Case<{ views: number; cpm: number; conv: Record<string, number>; rates: CpaRates; cap: number; take_rate: number }, Record<string, number | boolean>>[];
  instant_payout: Case<{ tier: Tier; amount_cents: number; free_instant_used_this_week: number; founding_free: boolean }, Record<string, unknown>>[];
  expected_earnings: Case<{ base_median_views: number; cpm_cents: number; rates: CpaRates; per_video_cap_cents: number }, Record<string, Record<string, unknown>>>[];
  tier: Case<TierStats, { tier: Tier; progress: Record<string, unknown> }>[];
  fraud: Case<{ signal: FraudSignal; severity: number }[], { score: number; band: string; signals: Record<string, unknown>[] }>[];
  hook_score: Case<HookObservations, { band: string; points: number; items: Record<string, unknown>[]; label: string }>[];
  flow_score: Case<FlowObservations, { band: string; points: number; items: Record<string, unknown>[]; label: string }>[];
  money_clock: Case<{ posted_at: IsoTimestamp; now: IsoTimestamp }, Record<string, unknown>>[];
  conversion_clearing: Case<{ kind: ConversionKind; occurred_at: IsoTimestamp }, string>[];
  sla: Case<{ hours: number }, string>[];
  brand_reliability: Case<BrandReliabilityInput, { score: number; band: string; components: Record<string, unknown>[]; rejection_rate: number }>[];
  price_curve: Case<{ clearing_cpm_cents: number; median_fill_hours: number; sample_n: number }, Record<string, number>[]>[];
  match_score: Case<Omit<MatchInput, "gates"> & { gates: Record<string, boolean> }, number | null>[];
}

const vectors: Vectors | null = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Vectors) : null;

/** Engine items carry an optional `at_ms` (the moment a reason points at) that the contract's score items do not. */
const withoutAt = <T extends { at_ms?: number }>(items: readonly T[]): Omit<T, "at_ms">[] => items.map(({ at_ms: _at, ...rest }) => (void _at, rest));

describe.skipIf(vectors === null)("contract vectors (packages/contract/formula-vectors.json)", () => {
  const v = vectors as Vectors;

  it("is a version this engine was written against", () => {
    expect(v.contract_version).toMatch(/^1\./);
  });

  it.each(v?.funding ?? [])("funding %#", (c) => {
    const got = c.in.brand_funds_cents !== undefined ? firstBountyFunding({ brand_funds_cents: c.in.brand_funds_cents }) : funding({ budget_cents: c.in.budget_cents ?? 0, take_rate: c.in.take_rate ?? 0 });
    expect(got).toEqual(c.out);
  });

  it.each(v?.settle_post ?? [])("settle_post %#", (c) => {
    const got = settlePost({ window_views: c.in.views, cpm_cents: c.in.cpm, conversions: c.in.conv, rates: c.in.rates, per_video_cap_cents: c.in.cap, take_rate: c.in.take_rate });
    expect(got).toEqual(c.out);
  });

  it.each(v?.instant_payout ?? [])("instant_payout %#", (c) => {
    expect(instantPayout({ amount_cents: c.in.amount_cents, tier: c.in.tier, founding_free: c.in.founding_free, free_instant_used_this_week: c.in.free_instant_used_this_week })).toMatchObject(c.out);
  });

  it.each(v?.expected_earnings ?? [])("expected_earnings %#", (c) => {
    expect(expectedEarnings({ base_median_views: c.in.base_median_views, cpm_cents: c.in.cpm_cents, rates: c.in.rates, per_video_cap_cents: c.in.per_video_cap_cents })).toEqual(c.out);
  });

  it.each(v?.tier ?? [])("tier %#", (c) => {
    const tier = tierFor(c.in);
    expect(tier).toBe(c.out.tier);
    expect(tierProgress(c.in, tier)).toEqual(c.out.progress);
  });

  it.each(v?.fraud ?? [])("fraud %#", (c) => {
    const signals: FiredSignal[] = c.in.map((s) => ({ signal: s.signal, severity: s.severity }));
    expect(fraudScore(signals)).toEqual(c.out);
  });

  it.each(v?.hook_score ?? [])("hook_score %#", (c) => {
    const got = scoreHook(c.in);
    expect({ ...got, items: withoutAt(got.items) }).toEqual(c.out);
  });

  it.each(v?.flow_score ?? [])("flow_score %#", (c) => {
    const got = scoreFlow(c.in);
    expect({ ...got, items: withoutAt(got.items) }).toEqual(c.out);
  });

  it.each(v?.money_clock ?? [])("money_clock %#", (c) => {
    expect(moneyClockState({ posted_at: c.in.posted_at, now: c.in.now })).toEqual(c.out);
  });

  it.each(v?.conversion_clearing ?? [])("conversion_clearing %#", (c) => {
    expect(conversionClearingRun(c.in.kind, c.in.occurred_at)).toBe(c.out);
  });

  it.each(v?.sla ?? [])("sla %#", (c) => {
    expect(slaState(c.in.hours)).toBe(c.out);
  });

  it.each(v?.brand_reliability ?? [])("brand_reliability %#", (c) => {
    expect(brandReliability(c.in)).toEqual(c.out);
  });

  it.each(v?.price_curve ?? [])("price_curve %#", (c) => {
    expect(priceCurve({ clearing_cpm_cents: c.in.clearing_cpm_cents, median_fill_hours: c.in.median_fill_hours, sample_n: c.in.sample_n })).toEqual(c.out);
  });

  it.each(v?.match_score ?? [])("match_score %#", (c) => {
    expect(matchScore(c.in)).toBe(c.out);
  });
});
