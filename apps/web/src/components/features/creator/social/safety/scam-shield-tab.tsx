"use client";

import { useState } from "react";
import { BadgeCheck, Clock, Flag, ShieldAlert, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, Checkbox, EmptyState } from "@/components/ui";
import { Section } from "@/components/shell";
import { REPORT_STATUS_META, SCAM_REASON_META } from "@/lib/contract/types";
import type { SafetyView } from "@/lib/data/selectors";
import { formatCountdown, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportSheet } from "./report-sheet";

/** The five questions to ask before you reply to any offer, each one a thing you can see in the app. */
function SpotChecklist({ items }: { items: readonly string[] }) {
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const count = checked.size;
  const toggle = (index: number, on: boolean): void => {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });
  };
  return (
    <GlassCard padding="lg" aria-labelledby="spot-title" className="grid gap-5">
      <div className="grid gap-1.5">
        <h2 id="spot-title" className="font-display text-title-md text-fg">
          Spot a scam in 30 seconds
        </h2>
        <p className="text-body-sm text-fg-muted">Before you reply to an offer or start a bounty, tick what you can see for yourself. A &ldquo;no&rdquo; to any of these is your cue to slow down.</p>
      </div>
      <ul className="grid gap-1">
        {items.map((item, index) => (
          <li key={item}>
            <Checkbox label={item} checked={checked.has(index)} onCheckedChange={(on) => toggle(index, on === true)} />
          </li>
        ))}
      </ul>
      <div role="status" aria-live="polite">
        {count === 0 ? (
          <Callout tone="neutral" title="Nothing checked yet">
            Open the offer or bounty in another tab and look for each one.
          </Callout>
        ) : count < items.length ? (
          <Callout tone="sun" title={`${count} of ${items.length} checked`}>
            Check the rest before you reply. If you cannot find one, ask in the flowd thread and wait for the answer.
          </Callout>
        ) : (
          <Callout tone="mint" title="All five check out" icon={<BadgeCheck />}>
            This looks like a real flowd deal. If anything still feels off, you can report it below, at no cost.
          </Callout>
        )}
      </div>
    </GlassCard>
  );
}

function ReportRow({ report }: { report: SafetyView["reports"][number] }) {
  const status = REPORT_STATUS_META[report.status];
  const reason = SCAM_REASON_META[report.reason];
  return (
    <li className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-code text-fg-muted">{report.case_id}</span>
          <Badge tone={status.tone} size="md">
            {status.label}
          </Badge>
          <Badge tone="neutral" size="md">
            {reason.label}
          </Badge>
        </div>
        <p className="text-body-sm text-pretty text-fg">{report.description}</p>
        <p className="text-caption text-fg-subtle">
          Sent {formatDate(report.created_at, "medium")}
          {report.action_taken ? ` · ${report.action_taken}` : ""}
        </p>
      </div>
      <p className="inline-flex items-center gap-1.5 text-caption font-medium text-fg-muted sm:justify-self-end">
        <Clock aria-hidden="true" className="size-4" />
        {report.sla_hours_left !== null ? (report.sla_hours_left > 0 ? `Reply due in ${formatCountdown(report.sla_hours_left * 3_600_000)}` : "Reply is due now") : report.resolved_at ? `Closed ${formatDate(report.resolved_at, "short")}` : status.meaning}
      </p>
    </li>
  );
}

export function ScamShieldTab({ safety }: { safety: SafetyView }) {
  const [reporting, setReporting] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <GlassCard padding="lg" aria-labelledby="rules-title" className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
        <div className="grid gap-4">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-mint-soft text-mint">
            <ShieldCheck className="size-7" />
          </span>
          <h2 id="rules-title" className="font-display text-display-sm text-balance text-fg">
            flowd never asks you to pay.
          </h2>
          <p className="max-w-[58ch] text-body-lg text-fg-muted">Not to join a bounty, not to get paid, not to &ldquo;unlock&rdquo; anything. Every bounty is escrowed before it goes live, and every payment goes through your Wallet.</p>
          <ul className="grid gap-2.5">
            {safety.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-3 text-body text-fg-muted">
                <ShieldCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-mint" />
                <span className="text-pretty">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <Button variant="primary" size="lg" leadingIcon={<ShieldAlert />} onClick={() => setReporting(true)}>
            Report something
          </Button>
          <p className="max-w-[26ch] text-caption text-fg-subtle lg:text-right">A person replies within 24 hours. It costs you nothing.</p>
        </div>
      </GlassCard>

      <SpotChecklist items={safety.checklist} />

      <Section title="My reports" description="Every report you sent, with its case number, status and when we reply.">
        {safety.reports.length > 0 ? (
          <GlassCard padding="sm">
            <ul className={cn("grid divide-y divide-divider")}>
              {safety.reports.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </ul>
          </GlassCard>
        ) : (
          <GlassCard>
            <EmptyState
              size="sm"
              art="inbox"
              title="No reports yet"
              description="If an offer asks you to pay, leave flowd or open a new account, report it here. Reports are private."
              action={
                <Button variant="secondary" leadingIcon={<Flag />} onClick={() => setReporting(true)}>
                  Report something
                </Button>
              }
            />
          </GlassCard>
        )}
      </Section>

      <ReportSheet open={reporting} onOpenChange={setReporting} />
    </div>
  );
}
