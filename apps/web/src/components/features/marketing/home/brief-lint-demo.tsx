"use client";

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_NOW, lintBrief, type BriefLintInput } from "@/lib/engine";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLES = [
  {
    label: "A brief with traps",
    text: "Creators are paid once they reach 100,000 views. Create a new account just for this campaign and post 3 times a day. We keep the rights forever.",
  },
  {
    label: "A clean brief",
    text: "Show Nap Nest in the first three seconds, then your honest first-night routine. Say it helps you wind down. Ask people to try it free for seven days.",
  },
  {
    label: "A pay-to-join trap",
    text: "Pay a $25 entry fee to join this campaign, and send an unpaid test video first so we can see your style.",
  },
] as const;

const DAY = 86_400_000;

/** Everything except the brief text is a sensible default: $2.00 CPM, a $250 cap, a $5,000 pool, one video, a 14-day window and the 90-day rights default. */
function inputFor(text: string): BriefLintInput {
  const start = Date.parse(DEMO_NOW);
  return {
    type: "cpm",
    plan: "free",
    cpm_cents: 200,
    per_video_cap_cents: 25_000,
    budget_cents: 500_000,
    brief: {
      summary: text,
      talking_points: [],
      dos: [],
      donts: [],
      cta: "Try it free for seven days",
      tone: "Honest and calm",
      disclosure_text: "#ad Paid partnership with Nap Nest",
    },
    rights_card: { paid_ads_days: 90, ai_likeness: false },
    deliverables: { videos_per_creator: 1, min_duration_s: 15, max_duration_s: 45, platforms: ["tiktok", "instagram"], regions: ["US"] },
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + 14 * DAY).toISOString(),
    median_views: 15_000,
    basis: "AI photo and video, comparable bounties",
  };
}

const SEVERITY = {
  blocker: { tone: "rose", label: "Blocker", icon: CircleAlert },
  warning: { tone: "ember", label: "Warning", icon: TriangleAlert },
  info: { tone: "info", label: "Tip", icon: Info },
} as const;

/**
 * Brief Lint, running here on the real rules: type or pick a brief and the same engine that guards the publish button finds the trap, quotes the
 * words that triggered it and says how to fix it. A blocker stops publishing; a warning or a tip does not. Only the brief text is yours: the pay, the
 * cap and the rights are the defaults a new bounty starts with.
 */
export function BriefLintDemo() {
  const [text, setText] = useState<string>(EXAMPLES[0].text);
  const result = useMemo(() => lintBrief(inputFor(text), DEMO_NOW), [text]);

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-5 p-5 sm:p-8">
          <div className="grid gap-1.5">
            <p className="fd-eyebrow text-fg-subtle">Brief Lint</p>
            <h3 className="text-title-lg text-fg">Traps cannot be published.</h3>
            <p className="text-body-sm max-w-[48ch] text-fg-muted">Edit the brief and watch the checks run. The same ruleset runs again on the server at publish.</p>
          </div>
          <ChipGroup aria-label="Example briefs">
            {EXAMPLES.map((example) => (
              <Chip key={example.label} size="sm" selected={text === example.text} onSelectedChange={() => setText(example.text)}>
                {example.label}
              </Chip>
            ))}
          </ChipGroup>
          <Field label="What creators are asked to do" hint="Pay $2.00 CPM, cap $250, pool $5,000, 90-day paid-ad rights: the defaults for a new bounty.">
            <Textarea rows={5} value={text} maxLength={400} onChange={(event) => setText(event.target.value)} />
          </Field>
        </div>

        <div className="grid content-start gap-4 border-t border-divider bg-surface-field/50 p-5 sm:p-8 lg:border-t-0 lg:border-l" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm font-semibold text-fg">
              {result.blockers} blocker{result.blockers === 1 ? "" : "s"}, {result.warnings} warning{result.warnings === 1 ? "" : "s"}
            </p>
            <Badge tone={result.can_publish ? "mint" : "rose"} size="lg" icon={result.can_publish ? <CircleCheck /> : <CircleAlert />}>
              {result.can_publish ? "Can publish" : "Publish is off"}
            </Badge>
          </div>
          {result.findings.length === 0 ? (
            <p className="rounded-2xl bg-mint-soft px-4 py-3 text-body-sm text-fg">Nothing to fix. The brief passes every check.</p>
          ) : (
            <ul className="grid gap-2.5">
              {result.findings.map((finding) => {
                const spec = SEVERITY[finding.severity];
                return (
                  <li key={finding.code} className="grid gap-1.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" tone={spec.tone} icon={<spec.icon />}>
                        {spec.label}
                      </Badge>
                      <p className="text-body-sm font-semibold text-fg">{finding.title}</p>
                    </div>
                    <p className="text-caption text-fg-muted">{finding.message}</p>
                    {finding.matched_text ? (
                      <p className="text-caption text-fg-subtle">
                        Found: <q className="rounded bg-surface-active px-1 py-0.5 text-fg">{finding.matched_text}</q>
                      </p>
                    ) : null}
                    <p className={cn("text-caption font-medium", finding.severity === "blocker" ? "text-rose" : "text-fg")}>Fix: {finding.fix}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
