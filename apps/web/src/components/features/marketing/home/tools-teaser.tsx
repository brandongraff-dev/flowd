"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Check, PiggyBank, Radar, Target, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { scoreHookText } from "@/lib/engine";
import { ScoreRing } from "@/components/charts";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EXAMPLES = [
  { label: "A strong open", text: "I deleted five sleep apps. Here's the one I kept." },
  { label: "A slow start", text: "Hey guys, so today I wanted to talk about this app that I found." },
  { label: "A risky claim", text: "This app makes you passive income, guaranteed." },
] as const;

const TOOLS: readonly { href: string; title: string; body: string; icon: LucideIcon; audience: string }[] = [
  { href: "/tools/hook-score", title: "Hook Score", body: "Paste a hook or upload a clip. Analysed in your browser.", icon: Target, audience: "Creators" },
  { href: "/tools/app-ugc-audit", title: "App UGC Audit", body: "An App Store link in; a brief, ten hooks and a predicted CPM out.", icon: Radar, audience: "App teams" },
  { href: "/tools/earnings-calculator", title: "Earnings calculator", body: "A range, with the typical creator beside it.", icon: Calculator, audience: "Creators" },
  { href: "/tools/budget-planner", title: "Budget planner", body: "What a pool buys in views, installs and trials.", icon: PiggyBank, audience: "App teams" },
];

/**
 * Free tools, with one of them running right here: type a hook and the real text scorer (`scoreHookText`) answers instantly with a band, the points
 * it earned and a fix for each one it lost. It is a checklist score and says so. The full tool adds clips, rewrites and a shareable result.
 */
export function ToolsTeaser() {
  const [text, setText] = useState<string>(EXAMPLES[0].text);
  const result = useMemo(() => scoreHookText(text), [text]);
  const items = useMemo(() => [...result.items].sort((a, b) => Number(a.passed) - Number(b.passed)).slice(0, 4), [result]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <GlassCard padding="lg" className="grid content-start gap-6 rounded-[32px]">
        <div className="grid gap-1.5">
          <p className="fd-eyebrow text-fg-subtle">Try it now</p>
          <h3 className="text-title-lg text-fg">Score a hook in a second.</h3>
        </div>

        <div className="grid gap-3">
          <Field label="Your first line" hint={`First sentence: ${result.rule.words} words, about ${result.rule.est_seconds.toFixed(1)} seconds out loud. A hook should land inside two.`}>
            <Input value={text} maxLength={160} onChange={(event) => setText(event.target.value)} placeholder="I tested five sleep apps so you don't have to." />
          </Field>
          <ChipGroup aria-label="Example hooks">
            {EXAMPLES.map((example) => (
              <Chip key={example.label} size="sm" selected={text === example.text} onSelectedChange={() => setText(example.text)}>
                {example.label}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        <div className="grid items-start gap-6 sm:grid-cols-[auto_minmax(0,1fr)]" aria-live="polite">
          <ScoreRing name="Hook Score" score={result.score} size={128} checklist={false} caption={<span className="text-caption text-fg-subtle">Checklist score</span>} />
          <ul className="grid gap-2" aria-label="Why this score">
            {items.map((item) => (
              <li key={item.id} className="grid gap-0.5 rounded-2xl bg-surface-field px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
                  <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-full", item.passed ? "bg-mint-soft text-mint" : "bg-sun-soft text-sun")}>
                    {item.passed ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <span className="text-caption font-medium text-fg-subtle tabular-nums">
                    {item.points}/{item.max}
                    <span className="sr-only"> points</span>
                  </span>
                </p>
                <p className="pl-7 text-caption text-pretty text-fg-muted">{item.passed ? item.reason : (item.fix ?? item.reason)}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption max-w-[62ch] text-fg-subtle">
          {result.label} A risky claim such as &quot;guaranteed&quot; caps the score, because that hook could not be approved.
        </p>
      </GlassCard>

      <div className="grid content-start gap-4">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="group flex min-h-20 items-center gap-4 rounded-[24px] bg-surface-field px-5 py-4 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[background-color,box-shadow] duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]"
              >
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                  <tool.icon />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center gap-2 text-body-sm font-semibold text-fg">
                    {tool.title}
                    <span className="fd-eyebrow text-fg-subtle">{tool.audience}</span>
                  </span>
                  <span className="text-caption text-fg-muted">{tool.body}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-fast) group-hover:translate-x-0.5" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/tools" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-fit")}>
          All free tools
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
