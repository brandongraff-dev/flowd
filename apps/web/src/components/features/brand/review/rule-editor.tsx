"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import type { AutoApproveRule, Platform, ScoreBand, Tier } from "@/lib/contract/types";
import { PLATFORM_META, TIER_META } from "@/lib/contract/types";
import { useBounties } from "@/lib/data";
import { CONSTANTS } from "@/lib/engine";
import { formatMoney, formatPct } from "@/lib/format";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Callout } from "@/components/ui/callout";

type Conditions = AutoApproveRule["conditions"];
type Scope = AutoApproveRule["scope"];
type Guardrails = AutoApproveRule["guardrails"];

export interface RuleDraft {
  name: string;
  conditions: Conditions;
  scope: Scope;
  guardrails: Guardrails;
}

const A = CONSTANTS.auto_approve;

/** The starting point of a new rule: the platform defaults, organic only, a modest daily cap. */
export function defaultDraft(): RuleDraft {
  return {
    name: "",
    conditions: {
      min_flow_band: A.default_min_flow_band as ScoreBand,
      require_all_beats: true,
      require_disclosure_pass: true,
      require_no_duplicate: true,
      require_music_pass: true,
      max_fraud_score: A.default_max_fraud_score,
      min_us_audience_ratio: A.default_min_us_audience_ratio,
      min_creator_approved_posts: A.default_min_creator_approved_posts,
      min_creator_approval_rate: A.default_min_creator_approval_rate,
    },
    scope: { bounty_ids: [], tiers: [], platforms: [] },
    guardrails: { daily_cap: 10, budget_cap_cents: 100_000, spot_check_ratio: A.spot_check_ratio, pause_on_fraud: true },
  };
}

export function draftOf(rule: AutoApproveRule): RuleDraft {
  return { name: rule.name, conditions: { ...rule.conditions }, scope: { bounty_ids: [...rule.scope.bounty_ids], tiers: [...rule.scope.tiers], platforms: [...rule.scope.platforms] }, guardrails: { ...rule.guardrails } };
}

const TIERS: readonly Tier[] = ["bronze", "silver", "gold", "platinum", "elite"];
const PLATFORMS: readonly Platform[] = ["tiktok", "instagram", "youtube"];

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** Has the draft diverged from what is saved? */
export function isDirty(draft: RuleDraft, saved: RuleDraft): boolean {
  return (
    draft.name.trim() !== saved.name.trim() ||
    JSON.stringify(draft.conditions) !== JSON.stringify(saved.conditions) ||
    !sameList(draft.scope.bounty_ids, saved.scope.bounty_ids) ||
    !sameList(draft.scope.tiers, saved.scope.tiers) ||
    !sameList(draft.scope.platforms, saved.scope.platforms) ||
    JSON.stringify(draft.guardrails) !== JSON.stringify(saved.guardrails)
  );
}

function toggle<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export interface RuleEditorProps {
  draft: RuleDraft;
  onChange: (draft: RuleDraft) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** The name is only editable on a new rule (the rule's id is made from it). */
  nameEditable: boolean;
  error?: string;
}

/**
 * The rule builder (F-049). Every condition must hold for a video to be auto-approved. A missing disclosure, a duplicate and a fraud
 * score in the hold band are hard stops that no rule can switch off, and a creator's first video is always read by a person. A
 * rule only ever grants organic posting, never paid-ad rights.
 */
export function RuleEditor({ draft, onChange, disabled, disabledReason, nameEditable, error }: RuleEditorProps) {
  const bounties = useBounties({ brand: "mine", status: "active" });
  const c = draft.conditions;
  const g = draft.guardrails;
  const set = (patch: Partial<RuleDraft>): void => onChange({ ...draft, ...patch });
  const setC = (patch: Partial<Conditions>): void => set({ conditions: { ...c, ...patch } });
  const setG = (patch: Partial<Guardrails>): void => set({ guardrails: { ...g, ...patch } });
  const setS = (patch: Partial<Scope>): void => set({ scope: { ...draft.scope, ...patch } });
  const bountyChips = useMemo(() => bounties.slice(0, 12), [bounties]);

  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-8 border-0 p-0">
      {disabled && disabledReason ? <Callout tone="info" title="You can read this rule, not change it">{disabledReason}</Callout> : null}

      {nameEditable ? (
        <section className="grid gap-4" aria-labelledby="rule-name-h">
          <h3 id="rule-name-h" className="font-display text-title-sm text-fg">
            Name
          </h3>
          <Field label="Rule name" error={error} hint="Name it for what it approves. The name is fixed once the rule exists.">
            <Input value={draft.name} onChange={(event) => set({ name: event.target.value })} disabled={disabled} placeholder="Organic fast-track: B or better, proven creators" maxLength={80} />
          </Field>
        </section>

      ) : null}

      <section className="grid gap-5" aria-labelledby="rule-conditions-h">
        <div className="grid gap-1">
          <h3 id="rule-conditions-h" className="font-display text-title-sm text-fg">
            Approve when all of this is true
          </h3>
          <p className="text-body-sm text-fg-muted">Every line must hold. If one does not, the video waits in your queue for a person.</p>
        </div>

        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Flow band at least</p>
          <SegmentedControl
            aria-label="Minimum Flow band"
            size="sm"
            value={c.min_flow_band}
            onValueChange={(next) => setC({ min_flow_band: next })}
            options={[
              { value: "A", label: "A, Strong" },
              { value: "B", label: "B, Good" },
              { value: "C", label: "C, Okay" },
            ]}
          />
          <p className="text-caption text-fg-subtle">A checklist score. It gets smarter as bounties settle, so start strict.</p>
        </div>

        <div className="grid gap-1 divide-y divide-divider rounded-2xl bg-surface-field px-4">
          <Switch label="Every required beat is found" description="The beats your brief marks as required." checked={c.require_all_beats} onCheckedChange={(on) => setC({ require_all_beats: on })} />
          <Switch label="Music is licensed for ads" description="Only tracks from the commercial library." checked={c.require_music_pass} onCheckedChange={(on) => setC({ require_music_pass: on })} />
          <LockedRow label="Disclosure spoken and on screen" note="Always required. A missing disclosure always goes to a person." />
          <LockedRow label="No duplicate video" note="Always required. A match with another video always goes to a person." />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={`Fraud score at most ${c.max_fraud_score}`} hint={`A score of ${CONSTANTS.fraud.hold_threshold} or more is always held, whatever you set.`}>
            <Slider aria-label="Maximum fraud score" min={0} max={CONSTANTS.fraud.hold_threshold - 1} step={1} value={[c.max_fraud_score]} onValueChange={([v]) => setC({ max_fraud_score: v ?? 0 })} tone="neutral" marks={[{ value: A.default_max_fraud_score, label: "Default" }]} />
          </Field>
          <Field label={`US audience at least ${formatPct(c.min_us_audience_ratio, 0)}`} hint="Share of the creator's audience in the United States.">
            <Slider aria-label="Minimum US audience" min={0} max={100} step={5} value={[Math.round(c.min_us_audience_ratio * 100)]} onValueChange={([v]) => setC({ min_us_audience_ratio: (v ?? 0) / 100 })} tone="neutral" format={(v) => `${v}%`} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Creator has at least this many approved videos" hint="First videos are always read by a person.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={String(c.min_creator_approved_posts)}
              onChange={(event) => setC({ min_creator_approved_posts: Math.max(1, Math.min(200, Math.round(Number(event.target.value) || 1))) })}
              trailing={<span className="text-caption text-fg-subtle">videos</span>}
            />
          </Field>
          <Field label={`Approval rate at least ${formatPct(c.min_creator_approval_rate, 0)}`} hint="Of the creator's finished videos, across all brands.">
            <Slider aria-label="Minimum creator approval rate" min={50} max={100} step={5} value={[Math.round(c.min_creator_approval_rate * 100)]} onValueChange={([v]) => setC({ min_creator_approval_rate: (v ?? 50) / 100 })} tone="neutral" format={(v) => `${v}%`} />
          </Field>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="rule-scope-h">
        <div className="grid gap-1">
          <h3 id="rule-scope-h" className="font-display text-title-sm text-fg">
            Where it applies
          </h3>
          <p className="text-body-sm text-fg-muted">Organic posting only. A rule never grants paid-ad rights, Spark codes or partnership permission. Leave a group empty to cover all of it.</p>
        </div>
        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Bounties</p>
          {bountyChips.length === 0 ? (
            <p className="text-caption text-fg-subtle">No live bounties yet.</p>
          ) : (
            <ChipGroup aria-label="Bounties in scope">
              {bountyChips.map((b) => (
                <Chip key={b.id} size="sm" selected={draft.scope.bounty_ids.includes(b.id)} onSelectedChange={() => setS({ bounty_ids: toggle(draft.scope.bounty_ids, b.id) })}>
                  {b.title}
                </Chip>
              ))}
            </ChipGroup>
          )}
          <p className="text-caption text-fg-subtle">{draft.scope.bounty_ids.length === 0 ? "All your bounties." : `${draft.scope.bounty_ids.length} selected.`}</p>
        </div>
        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Creator tiers</p>
          <ChipGroup aria-label="Tiers in scope">
            {TIERS.map((t) => (
              <Chip key={t} size="sm" selected={draft.scope.tiers.includes(t)} onSelectedChange={() => setS({ tiers: toggle(draft.scope.tiers, t) })}>
                {TIER_META[t].label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Platforms</p>
          <ChipGroup aria-label="Platforms in scope">
            {PLATFORMS.map((p) => (
              <Chip key={p} size="sm" selected={draft.scope.platforms.includes(p)} onSelectedChange={() => setS({ platforms: toggle(draft.scope.platforms, p) })}>
                {PLATFORM_META[p].label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="rule-guardrails-h">
        <div className="grid gap-1">
          <h3 id="rule-guardrails-h" className="font-display text-title-sm text-fg">
            Guardrails
          </h3>
          <p className="text-body-sm text-fg-muted">Limits that hold even when every condition passes.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Most videos approved per day" hint="Once it is reached, the rest wait for a person.">
            <Input type="number" inputMode="numeric" min={1} max={500} value={String(g.daily_cap)} onChange={(event) => setG({ daily_cap: Math.max(1, Math.min(500, Math.round(Number(event.target.value) || 1))) })} trailing={<span className="text-caption text-fg-subtle">a day</span>} />
          </Field>
          <Field label="Most budget approved per day" hint={`${formatMoney(g.budget_cap_cents)} of per-video caps reserved.`}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              leading="$"
              value={String(Math.round(g.budget_cap_cents / 100))}
              onChange={(event) => setG({ budget_cap_cents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)) })}
            />
          </Field>
        </div>
        <Field label={`A person re-checks ${formatPct(g.spot_check_ratio, 0)} of automatic approvals`} hint={`Chosen at random. It cannot go below ${formatPct(A.spot_check_ratio, 0)}.`}>
          <Slider aria-label="Spot-check share" min={Math.round(A.spot_check_ratio * 100)} max={50} step={5} value={[Math.round(g.spot_check_ratio * 100)]} onValueChange={([v]) => setG({ spot_check_ratio: (v ?? 10) / 100 })} tone="neutral" format={(v) => `${v}%`} />
        </Field>
        <div className="rounded-2xl bg-surface-field px-4">
          <Switch label="Pause on a fraud flag" description="A clawback always pauses a rule. This also pauses it when a video it approved is flagged." checked={g.pause_on_fraud} onCheckedChange={(on) => setG({ pause_on_fraud: on })} />
        </div>
      </section>
    </fieldset>
  );
}

function LockedRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2.5">
      <span className="grid gap-0.5">
        <span className="text-body-sm font-medium text-fg">{label}</span>
        <span className="text-caption text-fg-subtle">{note}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-fg-muted">
        <Lock aria-hidden="true" className="size-3.5" />
        Always on
      </span>
    </div>
  );
}
