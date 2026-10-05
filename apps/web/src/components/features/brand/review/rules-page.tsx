"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Pause, Plus, ShieldCheck, Zap } from "lucide-react";
import { RULE_STATUS_META, type TimeoutPolicy } from "@/lib/contract/types";
import { useBrandSettings, useReviewQueue, useRules, useStoreReady } from "@/lib/data";
import type { RuleView } from "@/lib/data/selectors";
import { cheapestPlanWith, planHasFeature, planLabel, type DryRunResult } from "@/lib/engine";
import { formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DomainStatusPill } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { notify } from "@/components/ui/toast";
import { RouteLoading } from "./route-states";
import { RuleDetail } from "./rule-detail";
import { useUrlValue } from "./url-state";

/**
 * Guarded auto-approve (F-049). A rule approves clean videos so a reviewer's time goes to the ones that need it, inside guardrails: it
 * needs a dry run on the last 50 videos before it can be switched on, a person re-checks 10% of what it approves, a clawback pauses
 * it, and a kill switch stops it at once. It only ever grants organic posting. Calm by design: nothing here celebrates.
 */
export function RulesPage() {
  const ready = useStoreReady();
  const settings = useBrandSettings();
  const rules = useRules();
  const queue = useReviewQueue();
  const [param, setParam] = useUrlValue("rule");
  const [results, setResults] = useState<Record<string, { result: DryRunResult; at: string }>>({});
  const [pausing, setPausing] = useState(false);

  const brand = settings.brand;
  const planOk = brand ? planHasFeature(brand.plan, "guarded_auto_approve") : false;
  const creating = param === "new";
  const selected = creating ? undefined : (rules.find((r) => r.id === param) ?? rules.find((r) => r.status === "active") ?? rules[0]);
  const active = rules.filter((r) => r.status === "active");

  const header = (
    <PageHeader
      eyebrow="Review"
      title="Auto-approve rules"
      description="Let clean videos through without a click, inside guardrails you set. A rule only ever grants organic posting, and a person re-checks a share of everything it approves."
      breadcrumbs={
        <Link href="/brand/review" className="inline-flex w-fit items-center gap-2 rounded-pill py-1 pr-2 text-body-sm font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Review queue
        </Link>
      }
      actions={
        planOk ? (
          <Button variant="primary" size="sm" leadingIcon={<Plus />} disabled={!settings.can_manage} onClick={() => setParam("new")}>
            New rule
          </Button>
        ) : null
      }
    />
  );

  if (!ready) {
    return (
      <div className="grid gap-8">
        <RouteLoading shape="split" label="Loading auto-approve rules" />
      </div>
    );
  }

  if (!planOk) {
    const need = cheapestPlanWith("guarded_auto_approve");
    return (
      <div className="grid gap-8">
        {header}
        <GlassCard padding="lg" className="mx-auto w-full max-w-2xl">
          <EmptyState
            art="locked"
            title={`Guarded auto-approve is part of the ${need ? planLabel(need) : "Pro"} plan`}
            description={`You are on ${brand ? planLabel(brand.plan) : "Free"}. Until then every video waits for you, which is fine: the queue is built to be cleared fast from the keyboard.`}
            action={
              <Link href="/brand/settings" className={buttonVariants({ variant: "primary" })}>
                See plans
              </Link>
            }
            secondaryAction={
              <Link href="/brand/review" className={buttonVariants({ variant: "ghost" })}>
                Back to the queue
              </Link>
            }
          />
        </GlassCard>
      </div>
    );
  }

  const pauseAll = async (): Promise<void> => {
    setPausing(true);
    let paused = 0;
    for (const r of active) {
      const res = await actions.setRuleStatus({ rule_id: r.id, status: "paused", reason: "Paused all rules" });
      if (res.ok) paused += 1;
      else notify.error(res.error.message, { description: res.error.hint });
    }
    setPausing(false);
    if (paused > 0) notify.success(`Paused ${pluralise(paused, "rule")}`, { description: "Every video waits for a person until you resume." });
  };

  return (
    <div className="grid gap-6">
      {header}

      <GlassCard padding="md" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3" aria-label="Auto-approve status">
        <div className="flex items-center gap-3.5">
          <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-full", active.length > 0 ? "bg-violet-soft text-violet" : "bg-surface-active text-fg-muted")}>
            {active.length > 0 ? <Zap className="size-5" /> : <Pause className="size-5" />}
          </span>
          <div className="grid gap-0.5">
            <p className="font-display text-title-sm text-fg">{active.length > 0 ? `Auto-approve is on: ${pluralise(active.length, "rule")}` : "Auto-approve is off"}</p>
            <p className="text-body-sm text-fg-muted">
              {active.length > 0 ? `${queue.counts.auto_approved_today} approved automatically today. A person re-checks a share of them.` : "Every video waits for you. Turn a rule on after its dry run to clear the clean ones for you."}
            </p>
          </div>
        </div>
        {active.length > 0 ? (
          <Button variant="secondary" size="sm" leadingIcon={<Pause />} loading={pausing} disabled={!settings.can_manage} onClick={() => void pauseAll()}>
            Pause all rules
          </Button>
        ) : null}
      </GlassCard>

      {rules.length === 0 && !creating ? (
        <GlassCard padding="lg" className="mx-auto w-full max-w-2xl">
          <EmptyState
            art="flo"
            title="No rules yet"
            description="A rule approves videos that pass your conditions and leaves the rest to you. Start with the defaults, run the dry run on your last 50 videos, and decide with real numbers."
            action={
              <Button variant="primary" leadingIcon={<Plus />} disabled={!settings.can_manage} onClick={() => setParam("new")}>
                Create your first rule
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside aria-label="Your rules" className="grid gap-3 lg:sticky lg:top-24">
            <ul className="grid gap-2">
              {rules.map((r) => (
                <li key={r.id}>
                  <RuleCard rule={r} selected={!creating && selected?.id === r.id} onSelect={() => setParam(r.id)} />
                </li>
              ))}
              {creating ? (
                <li>
                  <div aria-current="true" className="rounded-2xl bg-accent-soft p-3.5 shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright)]">
                    <p className="text-body-sm font-semibold text-fg">New rule</p>
                    <p className="text-caption text-fg-muted">Not saved yet</p>
                  </div>
                </li>
              ) : null}
            </ul>
          </aside>
          <RuleDetail
            key={creating ? "new" : `${selected?.id}-${selected?.updated_at}`}
            rule={selected}
            canManage={settings.can_manage}
            dryRun={selected ? results[selected.id] : undefined}
            onDryRun={(id, result, at) => setResults((current) => ({ ...current, [id]: { result, at } }))}
            onSaved={(rule) => setParam(rule.id)}
          />
        </div>
      )}

      {brand ? <TimeoutPolicyCard policy={brand.timeout_policy} slaHours={brand.review_sla_hours} canManage={settings.can_manage} /> : null}
    </div>
  );
}

function RuleCard({ rule, selected, onSelect }: { rule: RuleView; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid w-full gap-2 rounded-2xl p-3.5 text-left transition-colors duration-(--fd-dur-fast) ease-standard",
        selected ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--fd-accent-bright)]" : "bg-surface-field hover:bg-surface-hover",
      )}
    >
      <span className="flex items-start justify-between gap-2.5">
        <span className="text-body-sm font-semibold text-fg">{rule.name}</span>
        <DomainStatusPill meta={RULE_STATUS_META[rule.status]} size="md" />
      </span>
      <span className="text-caption text-fg-muted">{rule.dry_run_summary ?? "No dry run yet"}</span>
      <span className="text-caption text-fg-subtle tabular-nums">
        {rule.today.approved} of {rule.today.cap} today
        {rule.stats.last_triggered_at ? ` · last ${formatRelative(rule.stats.last_triggered_at)}` : ""}
      </span>
    </button>
  );
}

const POLICY_COPY: Record<TimeoutPolicy, { label: string; description: string }> = {
  escalate: { label: "Tell the owner", description: "At 72 hours with no decision, the bounty owner and the SLA desk are told. Nothing is approved for you." },
  approve_if_clean: { label: "Approve if clean", description: "At 72 hours, a video is approved only if every automated check passes. Anything flagged is escalated instead." },
};

/** What happens when 72 hours pass with no decision. It is the real policy the clock applies to every bounty in the workspace. */
function TimeoutPolicyCard({ policy, slaHours, canManage }: { policy: TimeoutPolicy; slaHours: number; canManage: boolean }) {
  const [busy, setBusy] = useState(false);
  const change = async (next: TimeoutPolicy): Promise<void> => {
    if (next === policy) return;
    setBusy(true);
    const r = await actions.updateBrandSettings({ timeout_policy: next });
    setBusy(false);
    if (!r.ok) {
      notify.error(r.error.message, { description: r.error.hint });
      return;
    }
    notify.success("Timeout policy saved", { description: POLICY_COPY[next].label });
  };
  return (
    <GlassCard padding="lg" className="grid gap-5" aria-labelledby="timeout-title">
      <header className="grid gap-1">
        <h2 id="timeout-title" className="flex items-center gap-2 font-display text-title-md text-fg">
          <ShieldCheck aria-hidden="true" className="size-5 text-fg-muted" />
          When {slaHours} hours pass with no decision
        </h2>
        <p className="max-w-[62ch] text-body-sm text-fg-muted">Creators see your promise before they apply, and a late decision lowers your Brand Scorecard either way. This is the safety net for the videos nobody got to.</p>
      </header>
      <RadioGroup aria-label="Timeout policy" value={policy} onValueChange={(next) => void change(next as TimeoutPolicy)} disabled={!canManage || busy} className="gap-2 sm:grid-cols-2">
        {(Object.keys(POLICY_COPY) as TimeoutPolicy[]).map((key) => (
          <RadioGroupItem key={key} id={`timeout-${key}`} value={key} label={POLICY_COPY[key].label} description={POLICY_COPY[key].description} variant="card" />
        ))}
      </RadioGroup>
      {!canManage ? <Callout tone="info">Ask a workspace owner or admin to change this.</Callout> : null}
    </GlassCard>
  );
}
