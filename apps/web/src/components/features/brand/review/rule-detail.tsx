"use client";

import { useState } from "react";
import { FlaskConical, Pause, Play, Power, Save, Zap } from "lucide-react";
import { RULE_AUDIT_ACTION_META, RULE_STATUS_META, type AutoApproveRule } from "@/lib/contract/types";
import { useMe } from "@/lib/data";
import type { RuleView } from "@/lib/data/selectors";
import type { DryRunResult } from "@/lib/engine";
import { formatDateTime, formatRelative, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DomainStatusPill } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { DryRunPanel } from "./dry-run-panel";
import { defaultDraft, draftOf, isDirty, RuleEditor, type RuleDraft } from "./rule-editor";

export interface RuleDetailProps {
  /** The rule being edited, or undefined to make a new one. */
  rule: RuleView | undefined;
  canManage: boolean;
  dryRun: { result: DryRunResult; at: string } | undefined;
  onDryRun: (ruleId: string, result: DryRunResult, at: string) => void;
  onSaved: (rule: AutoApproveRule) => void;
}

type Busy = "save" | "dry" | "on" | "pause" | "resume" | "run" | null;

/**
 * One rule: its builder, the dry run that must come before it can be switched on, the on and off controls (a pause, and a kill switch
 * that says why), its running totals and its audit log. Mount it with a `key` so a saved rule re-reads its own values.
 */
export function RuleDetail({ rule, canManage, dryRun, onDryRun, onSaved }: RuleDetailProps) {
  const me = useMe();
  const [draft, setDraft] = useState<RuleDraft>(() => (rule ? draftOf(rule) : defaultDraft()));
  const [busy, setBusy] = useState<Busy>(null);
  const [killOpen, setKillOpen] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const saved = rule ? draftOf(rule) : undefined;
  const dirty = saved ? isDirty(draft, saved) : true;
  const conditionsChanged = saved ? JSON.stringify(draft.conditions) !== JSON.stringify(saved.conditions) || JSON.stringify(draft.scope) !== JSON.stringify(saved.scope) : false;

  const fail = (r: { error: { message: string; hint?: string } }): void => {
    notify.error(r.error.message, { description: r.error.hint });
  };

  const save = async (): Promise<void> => {
    if (draft.name.trim().length < 3) {
      setNameError("Name the rule, in at least 3 characters.");
      return;
    }
    setNameError(undefined);
    setBusy("save");
    const r = await actions.saveRule({
      ...(rule ? { rule_id: rule.id } : {}),
      name: draft.name,
      // Only send conditions and scope when they changed: editing them sends a rule back to draft and clears its dry run.
      ...(!rule || conditionsChanged ? { conditions: draft.conditions, scope: draft.scope } : {}),
      guardrails: draft.guardrails,
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    notify.success(rule ? "Rule saved" : "Rule created", { description: rule && conditionsChanged ? "It is back in draft. Run a fresh dry run before turning it on." : "Run a dry run on your last 50 videos to see what it would do." });
    onSaved(r.data.rule);
  };

  const runDry = async (): Promise<void> => {
    if (!rule) return;
    setBusy("dry");
    const r = await actions.dryRunRule({ rule_id: rule.id });
    setBusy(null);
    if (!r.ok) return fail(r);
    onDryRun(rule.id, r.data.result, r.data.rule.dry_run?.ran_at ?? "");
  };

  const setStatus = async (status: "active" | "paused", mode: Busy): Promise<void> => {
    if (!rule) return;
    setBusy(mode);
    const r = await actions.setRuleStatus({ rule_id: rule.id, status });
    setBusy(null);
    if (!r.ok) return fail(r);
    notify.success(status === "paused" ? "Rule paused" : mode === "resume" ? "Rule resumed" : "Rule is on", {
      description: status === "paused" ? "Nothing is approved automatically until you resume it." : "It approves what passes, and a person re-checks a share of it.",
    });
  };

  const runOnQueue = async (): Promise<void> => {
    if (!rule) return;
    setBusy("run");
    const r = await actions.autoApproveRun({ rule_id: rule.id });
    setBusy(null);
    if (!r.ok) return fail(r);
    notify.success(r.data.approved === 0 ? "Nothing in the queue passed" : `Approved ${pluralise(r.data.approved, "video")}`, {
      description: `${r.data.routed_to_human} of ${r.data.evaluated} stay${r.data.routed_to_human === 1 ? "s" : ""} for a person.`,
    });
  };

  const readOnly = !canManage;
  const status = rule?.status;
  const hasResult = dryRun !== undefined;

  return (
    <div className="grid min-w-0 gap-6">
      <GlassCard padding="lg" className="grid gap-5">
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="grid min-w-0 gap-2">
            <h2 className="font-display text-title-lg text-fg">{rule ? rule.name : "New rule"}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {rule ? <DomainStatusPill meta={RULE_STATUS_META[rule.status]} /> : <Badge tone="neutral">Not saved yet</Badge>}
              {rule?.dry_run_summary ? <span className="text-body-sm text-fg-muted">{rule.dry_run_summary}</span> : null}
            </div>
          </div>
          {rule ? <RuleControls rule={rule} busy={busy} readOnly={readOnly} dirty={dirty} onOn={() => void setStatus("active", "on")} onPause={() => void setStatus("paused", "pause")} onResume={() => void setStatus("active", "resume")} onKill={() => setKillOpen(true)} onRun={() => void runOnQueue()} /> : null}
        </header>

        {rule ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat label="Approved by this rule" value={String(rule.stats.auto_approved)} hint={rule.stats.last_triggered_at ? `last ${formatRelative(rule.stats.last_triggered_at)}` : "not yet"} />
            <Stat label="Re-checked by a person" value={String(rule.stats.spot_checked)} hint={`${rule.stats.spot_check_overturned} overturned`} />
            <div className="col-span-2 grid content-start gap-1.5">
              <dt className="text-caption text-fg-subtle">Today against the daily cap</dt>
              <dd>
                <Progress value={rule.today.approved} max={Math.max(rule.today.cap, 1)} tone="neutral" size="md" aria-label="Approved today against the daily cap" valueText={`${rule.today.approved} of ${rule.today.cap} today`} />
              </dd>
              <dd className="text-caption text-fg-muted tabular-nums">
                {rule.today.approved} of {rule.today.cap} approved today
              </dd>
            </div>
          </dl>
        ) : null}

        {rule?.status === "killed" ? (
          <Callout tone="rose" title="Killed">
            {rule.kill_reason ? `Because: ${rule.kill_reason}. ` : ""}It approves nothing. To turn it back on, run a fresh dry run first.
          </Callout>
        ) : null}
        {rule?.status === "paused" ? <Callout tone="sun" title="Paused">It approves nothing until you resume it. A clawback or a fraud flag on something it approved pauses a rule on its own, so a person looks first.</Callout> : null}
        {rule && !rule.can_enable && rule.status !== "active" && rule.status !== "paused" && rule.enable_blocked_reason ? <Callout tone="info" title="Before this can go live">{rule.enable_blocked_reason}</Callout> : null}
      </GlassCard>

      <GlassCard padding="lg" className="grid gap-6">
        <RuleEditor draft={draft} onChange={setDraft} disabled={readOnly} disabledReason="Ask a workspace owner or admin to change auto-approve rules." nameEditable={!rule} error={nameError} />
        <div className="grid gap-3 border-t border-divider pt-5">
          {rule && dirty && conditionsChanged && (status === "active" || status === "dry_run") ? (
            <Callout tone="sun" title="Saving these changes sends the rule back to draft">
              A rule needs a fresh dry run on its current conditions before it can be switched on again.
            </Callout>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" leadingIcon={<Save />} loading={busy === "save"} disabled={readOnly || (rule !== undefined && !dirty)} onClick={() => void save()}>
              {rule ? "Save changes" : "Create rule"}
            </Button>
            {rule ? (
              <Button variant="secondary" leadingIcon={<FlaskConical />} loading={busy === "dry"} disabled={readOnly || dirty} onClick={() => void runDry()}>
                {rule.has_dry_run ? "Run the dry run again" : "Run a dry run"}
              </Button>
            ) : null}
            {rule && dirty ? <span className="text-caption text-fg-subtle">Save your changes first: the dry run uses the saved rule.</span> : null}
          </div>
        </div>
      </GlassCard>

      {rule && (hasResult || rule.dry_run) ? (
        <GlassCard padding="lg" className="grid gap-5" aria-label="Dry run">
          <h3 className="font-display text-title-md text-fg">Dry run</h3>
          {hasResult ? (
            <DryRunPanel result={dryRun.result} ranLabel={formatDateTime(dryRun.at)} />
          ) : rule.dry_run ? (
            <div className="grid gap-4">
              <p className="font-display text-title-md text-fg">{rule.dry_run_summary}</p>
              <p className="text-body-sm text-fg-muted">
                Ran {formatDateTime(rule.dry_run.ran_at)}: {rule.dry_run.would_send_to_human} would stay with a person and {rule.dry_run.would_block} were safety stops. Run it again to see each video and why.
              </p>
            </div>
          ) : null}
        </GlassCard>
      ) : null}

      {rule ? <AuditLog rule={rule} myMemberId={me.member?.id} /> : null}

      <KillDialog open={killOpen} onOpenChange={setKillOpen} ruleName={rule?.name ?? ""} onKill={async (reason) => {
        if (!rule) return false;
        const r = await actions.setRuleStatus({ rule_id: rule.id, status: "killed", reason });
        if (!r.ok) {
          fail(r);
          return false;
        }
        notify.success("Rule killed", { description: "It approves nothing now. Videos already approved stay approved." });
        return true;
      }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="font-display text-figure-md text-fg tabular-nums">{value}</dd>
      {hint ? <dd className="text-caption text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}

interface RuleControlsProps {
  rule: RuleView;
  busy: Busy;
  readOnly: boolean;
  dirty: boolean;
  onOn: () => void;
  onPause: () => void;
  onResume: () => void;
  onKill: () => void;
  onRun: () => void;
}

/** On, pause, resume and the kill switch. The kill switch is always one click away while a rule is on. */
function RuleControls({ rule, busy, readOnly, dirty, onOn, onPause, onResume, onKill, onRun }: RuleControlsProps) {
  const live = rule.status === "active";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {live ? (
        <>
          <Button size="sm" variant="secondary" leadingIcon={<Zap />} loading={busy === "run"} disabled={readOnly} onClick={onRun}>
            Run on the queue now
          </Button>
          <Button size="sm" variant="secondary" leadingIcon={<Pause />} loading={busy === "pause"} disabled={readOnly} onClick={onPause}>
            Pause
          </Button>
          <Button size="sm" variant="danger" leadingIcon={<Power />} disabled={readOnly} onClick={onKill}>
            Kill switch
          </Button>
        </>
      ) : rule.status === "paused" ? (
        <>
          <Button size="sm" variant="primary" leadingIcon={<Play />} loading={busy === "resume"} disabled={readOnly} onClick={onResume}>
            Resume
          </Button>
          <Button size="sm" variant="danger" leadingIcon={<Power />} disabled={readOnly} onClick={onKill}>
            Kill switch
          </Button>
        </>
      ) : (
        <Button size="sm" variant="primary" leadingIcon={<Play />} loading={busy === "on"} disabled={readOnly || dirty || !rule.can_enable} onClick={onOn}>
          Turn on
        </Button>
      )}
    </div>
  );
}

function AuditLog({ rule, myMemberId }: { rule: RuleView; myMemberId: string | undefined }) {
  const entries = [...rule.audit].reverse();
  return (
    <GlassCard padding="lg" className="grid gap-4" aria-label="Audit log">
      <header className="grid gap-1">
        <h3 className="font-display text-title-md text-fg">Audit log</h3>
        <p className="text-body-sm text-fg-muted">Every change and every automatic decision, with who did it. Nothing here can be edited.</p>
      </header>
      <ol className="grid gap-1.5">
        {entries.map((e, index) => {
          const meta = RULE_AUDIT_ACTION_META[e.action];
          return (
            <li key={`${e.at}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 rounded-xl bg-surface-field px-3.5 py-2.5 sm:grid-cols-[8.5rem_7.5rem_minmax(0,1fr)]">
              <span className="order-2 text-caption text-fg-subtle tabular-nums sm:order-none">{formatDateTime(e.at)}</span>
              <span className="order-1 sm:order-none">
                <Badge tone={meta.tone as Tone} size="sm">
                  {meta.label}
                </Badge>
              </span>
              <span className={cn("order-3 col-span-2 text-body-sm text-fg-muted sm:order-none sm:col-span-1")}>
                {e.note}
                <span className="text-fg-subtle"> · {e.actor_member_id ? (e.actor_member_id === myMemberId ? "You" : "A teammate") : "flowd"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}

function KillDialog({ open, onOpenChange, ruleName, onKill }: { open: boolean; onOpenChange: (open: boolean) => void; ruleName: string; onKill: (reason: string) => Promise<boolean> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">{open ? <KillForm ruleName={ruleName} onCancel={() => onOpenChange(false)} onKill={onKill} /> : null}</DialogContent>
    </Dialog>
  );
}

function KillForm({ ruleName, onCancel, onKill }: { ruleName: string; onCancel: () => void; onKill: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (reason.trim().length < 3) {
      setError("Say why you are stopping it. The reason is saved in the audit log.");
      return;
    }
    setBusy(true);
    const killed = await onKill(reason.trim());
    setBusy(false);
    if (killed) onCancel();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Kill this rule</DialogTitle>
        <DialogDescription>
          &ldquo;{ruleName}&rdquo; stops approving right away. Videos it already approved stay approved. To turn it back on you need a fresh dry run.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Field label="Why" error={error}>
          <Textarea rows={3} maxLength={200} showCount value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Two approvals this week should have gone to a person." />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Keep it running
        </Button>
        <Button variant="destructive" loading={busy} onClick={() => void submit()}>
          Kill rule
        </Button>
      </DialogFooter>
    </>
  );
}
