"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clapperboard, ScanFace, Timer } from "lucide-react";
import type { HookType } from "@/lib/contract/types";
import { formatInt, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Thumb } from "@/components/brand/thumb";
import { DemoTag } from "@/components/shell/demo-banner";
import { Badge, Button, Chip, ChipGroup, CopyIconButton, EmptyState, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, buttonVariants } from "@/components/ui";
import { CHECKLIST_LABEL } from "@/lib/engine";
import { Footnote, PageSection } from "../kit";
import { DEMO_APP, type FormatDto, type FormatsPageData, type HookDto } from "./formats-data";

const DIFFICULTY: Record<FormatDto["difficulty"], string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

function FormatCard({ format, hook, onOpen }: { format: FormatDto; hook: string; onOpen: () => void }) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="group grid h-full w-full min-w-0 content-start gap-4 rounded-[28px] bg-surface-glass-1 p-3 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[transform,box-shadow] duration-(--fd-dur-base) ease-out active:scale-[0.99] [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]"
      >
        <div className="relative overflow-hidden rounded-[20px]">
          <Thumb art={format.art} hook={hook} aspect="4:5" durationSec={format.maxSeconds} caption={`Format ${format.rank}`} radius="2xl" />
        </div>
        <div className="grid gap-2 px-2 pb-2">
          <h3 className="font-display text-title-sm text-fg">{format.name}</h3>
          <p className="line-clamp-3 text-body-sm text-fg-muted">{format.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge size="md">{DIFFICULTY[format.difficulty]}</Badge>
            <Badge size="md" icon={<Timer aria-hidden="true" />}>
              {format.minSeconds}–{format.maxSeconds} s
            </Badge>
            <Badge size="md" icon={format.faceless ? <Clapperboard aria-hidden="true" /> : <ScanFace aria-hidden="true" />}>
              {format.faceless ? "Faceless" : "On camera"}
            </Badge>
          </div>
          <p className="mt-1 flex items-center justify-between gap-3 text-caption text-fg-subtle">
            <span>
              <span className="font-semibold text-fg-muted tabular-nums">{formatPct(format.stats.trialRate, 1)}</span> of installs start a trial
            </span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-accent transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2} />
          </p>
        </div>
      </button>
    </li>
  );
}

function BeatBar({ format }: { format: FormatDto }) {
  const total = Math.max(1, ...format.beats.map((beat) => beat.end));
  return (
    <div className="grid gap-3">
      <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-pill">
        {format.beats.map((beat, index) => (
          <span key={`${beat.id}-${index}`} className={cn("h-full", beat.required ? "bg-(--fd-chart-1)" : "bg-(--fd-chart-1) opacity-40")} style={{ width: `${((beat.end - beat.start) / total) * 100}%` }} />
        ))}
      </div>
      <ol className="grid gap-2">
        {format.beats.map((beat, index) => (
          <li key={`${beat.id}-${index}`} className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-3 rounded-2xl bg-surface-field px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="fd-figure pt-0.5 text-body-sm font-semibold text-fg-muted tabular-nums">
              {clock(beat.start)}–{clock(beat.end)}
            </p>
            <div className="grid gap-0.5">
              <p className="text-body-sm font-semibold text-fg">
                {beat.label}
                {!beat.required ? <span className="ml-2 text-caption font-normal text-fg-subtle">Optional</span> : null}
              </p>
              <p className="text-caption text-fg-muted">{beat.tip}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FormatSheet({ format, hooks, open, onOpenChange }: { format: FormatDto | undefined; hooks: readonly HookDto[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const sample = useMemo(() => (format ? format.hookIds.map((id) => hooks.find((hook) => hook.id === id)).filter((hook): hook is HookDto => hook !== undefined) : []), [format, hooks]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={format ? "format-sheet-description" : undefined} className="sm:w-[min(calc(100%-1.5rem),34rem)]">
        {format ? (
          <>
            <SheetHeader>
              <p className="fd-eyebrow text-accent">Format {format.rank} of 11</p>
              <SheetTitle>{format.name}</SheetTitle>
              <SheetDescription id="format-sheet-description">{format.summary}</SheetDescription>
            </SheetHeader>
            <SheetBody className="grid content-start gap-7">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge size="lg">{DIFFICULTY[format.difficulty]}</Badge>
                <Badge size="lg" icon={<Timer aria-hidden="true" />}>
                  {format.minSeconds}–{format.maxSeconds} seconds
                </Badge>
                <Badge size="lg" icon={format.faceless ? <Clapperboard aria-hidden="true" /> : <ScanFace aria-hidden="true" />}>
                  {format.faceless ? "Faceless" : "On camera"}
                </Badge>
              </div>

              <section aria-labelledby="sheet-beats" className="grid gap-3">
                <h3 id="sheet-beats" className="font-display text-title-sm text-fg">
                  The beats
                </h3>
                <BeatBar format={format} />
              </section>

              <section aria-labelledby="sheet-why" className="grid gap-2">
                <h3 id="sheet-why" className="font-display text-title-sm text-fg">
                  Why it works
                </h3>
                <p className="text-body-sm text-fg-muted">{format.whyItWorks}</p>
                <dl className="mt-1 grid grid-cols-3 gap-2">
                  {[
                    { label: "Settled posts", value: formatInt(format.stats.settledPosts) },
                    { label: "Median views", value: formatInt(format.stats.medianViews) },
                    { label: "Trial rate", value: formatPct(format.stats.trialRate, 1) },
                  ].map((item) => (
                    <div key={item.label} className="grid gap-0.5 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                      <dt className="text-caption text-fg-subtle">{item.label}</dt>
                      <dd className="fd-figure text-figure-md text-fg">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-caption text-fg-subtle">Trial rate is trials per install on settled flowd posts in this format. Demo data.</p>
              </section>

              {sample.length > 0 ? (
                <section aria-labelledby="sheet-hooks" className="grid gap-3">
                  <h3 id="sheet-hooks" className="font-display text-title-sm text-fg">
                    Hooks that open it, filled for {DEMO_APP.name}
                  </h3>
                  <ul className="grid gap-2">
                    {sample.map((hook) => (
                      <li key={hook.id} className="flex items-start gap-2 rounded-2xl bg-surface-field py-3 pr-1.5 pl-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                        <div className="grid min-w-0 flex-1 gap-1">
                          <p className="text-body-sm font-medium text-fg">&ldquo;{hook.text}&rdquo;</p>
                          <p className="text-caption text-fg-subtle">{hook.typeLabel}</p>
                        </div>
                        <CopyIconButton value={hook.text} label="Copy hook" />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="sheet-script" className="grid gap-2">
                <h3 id="sheet-script" className="font-display text-title-sm text-fg">
                  Example script
                </h3>
                <pre className="rounded-2xl bg-bg-sunken p-4 font-mono text-code whitespace-pre-wrap text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">{format.script}</pre>
                <p className="text-caption text-fg-subtle">Filled for the fictional app {DEMO_APP.name}. In Studio the script is written from your bounty&apos;s brief.</p>
              </section>

              <section aria-labelledby="sheet-shots" className="grid gap-2">
                <h3 id="sheet-shots" className="font-display text-title-sm text-fg">
                  Shot list
                </h3>
                <ul className="grid gap-1.5 text-body-sm text-fg-muted">
                  {format.shots.map((shot) => (
                    <li key={shot} className="flex items-start gap-2.5">
                      <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-subtle" />
                      {shot}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="sheet-fit" className="grid gap-2">
                <h3 id="sheet-fit" className="font-display text-title-sm text-fg">
                  Best for
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {format.categories.map((item) => (
                    <Badge key={item} tone="accent" size="md">
                      {item}
                    </Badge>
                  ))}
                  {format.niches.map((item) => (
                    <Badge key={item} size="md">
                      {item}
                    </Badge>
                  ))}
                </div>
                <p className="text-caption text-fg-subtle">Suggested call to action: {format.ctas.join(" or ").toLowerCase()}. One, near the end.</p>
              </section>
            </SheetBody>
            <SheetFooter>
              <Link href="/tools/hook-score" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                Score a hook free
              </Link>
              <Link href={format.studioHref} className={buttonVariants({ variant: "primary", size: "lg" })}>
                Try in Studio
                <ArrowRight aria-hidden="true" />
              </Link>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function HookCard({ hook }: { hook: HookDto }) {
  return (
    <li>
      <GlassCard padding="md" className="grid h-full content-start gap-4">
        <div className="flex items-start justify-between gap-3">
          <Badge tone="accent" size="md">
            {hook.typeLabel}
          </Badge>
          <CopyIconButton value={hook.text} label={`Copy ${hook.typeLabel} hook`} className="-mt-1 -mr-1" />
        </div>
        <p className="font-display text-title-sm text-balance text-fg">&ldquo;{hook.text}&rdquo;</p>
        <p className="text-body-sm text-fg-muted">{hook.whenToUse}</p>
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider pt-3 text-caption text-fg-subtle">
          <span>
            <span className="font-semibold text-fg-muted tabular-nums">{formatPct(hook.trialRate, 1)}</span> trial rate
          </span>
          <span>Used in {formatInt(hook.uses)} posts</span>
          <span>Hook Score {hook.avgScore}</span>
        </p>
      </GlassCard>
    </li>
  );
}

const HOOKS_PER_PAGE = 6;

/**
 * The format and hook library: a hook-type filter that narrows both the eleven formats and the fill-in hooks, a card per format that opens a sheet
 * (beats with timings, why it works, filled hooks, script, shot list), and the hooks themselves with copy buttons. Everything is filled for a
 * fictional demo app. The library is a hypothesis; the page says so beside the stats.
 */
export function FormatsExplorer({ data }: { data: FormatsPageData }) {
  const [hookType, setHookType] = useState<HookType | "all">("all");
  const [faceless, setFaceless] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [hookLimit, setHookLimit] = useState(HOOKS_PER_PAGE);

  const formats = data.formats.filter((format) => (hookType === "all" || format.hookTypes.includes(hookType)) && (!faceless || format.faceless));
  const hooks = data.hooks.filter((hook) => hookType === "all" || hook.type === hookType);
  const shown = hooks.slice(0, hookLimit);
  // The last opened format stays mounted while the sheet leaves, so the exit animation never shows an empty panel.
  const sheetFormat = data.formats.find((format) => format.id === sheetId);
  const typeLabel = hookType === "all" ? "every hook type" : (data.hookTypes.find((item) => item.type === hookType)?.label ?? hookType);

  const choose = (next: HookType | "all"): void => {
    setHookType(next);
    setHookLimit(HOOKS_PER_PAGE);
  };

  return (
    <>
      <PageSection
        id="library"
        eyebrow="The library"
        title="Eleven formats, each with its beats"
        description="Pick a hook type to see the formats that pair with it. Open any format for the beat-by-beat timing, a filled script and the shot list."
        actions={<DemoTag />}
      >
        <div className="grid gap-6">
          <div className="grid gap-3">
            <ChipGroup aria-label="Hook type" className="-mx-1 flex-nowrap overflow-x-auto px-1 pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
              <Chip selected={hookType === "all"} onSelectedChange={() => choose("all")} count={data.formats.length}>
                All formats
              </Chip>
              {data.hookTypes.map((item) => (
                <Chip key={item.type} selected={hookType === item.type} onSelectedChange={() => choose(item.type)} count={item.formats}>
                  {item.label}
                </Chip>
              ))}
            </ChipGroup>
            <div className="flex flex-wrap items-center gap-3">
              <Chip selected={faceless} onSelectedChange={setFaceless} icon={<Clapperboard />} size="sm">
                Faceless only
              </Chip>
              <p className="text-caption text-fg-subtle" role="status" aria-live="polite">
                Showing {formats.length} of {data.formats.length} formats for {typeLabel}.
              </p>
            </div>
          </div>

          {formats.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {formats.map((format) => (
                <FormatCard
                  key={format.id}
                  format={format}
                  hook={data.hooks.find((item) => item.id === format.hookIds[0])?.text ?? format.name}
                  onOpen={() => {
                    setSheetId(format.id);
                    setSheetOpen(true);
                  }}
                />
              ))}
            </ul>
          ) : (
            <GlassCard padding="lg">
              <EmptyState
                art="search"
                title={faceless ? "No faceless format pairs with that hook type" : "No format is built around that hook type yet"}
                description={faceless ? "Faceless formats lean on text and numbers. Try Specific number or Curiosity gap, or turn faceless off." : "It still works inside any format. The hooks for it are further down this page."}
                action={
                  faceless ? (
                    <Button variant="primary" onClick={() => setFaceless(false)}>
                      Show on-camera formats too
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => choose("all")}>
                      Show all formats
                    </Button>
                  )
                }
              />
            </GlassCard>
          )}
        </div>
      </PageSection>

      <FormatSheet format={sheetFormat} hooks={data.hooks} open={sheetOpen} onOpenChange={setSheetOpen} />

      <PageSection
        id="hooks"
        eyebrow="Fill-in hooks"
        title={`${formatInt(data.totals.hooks)} hooks, filled for ${DEMO_APP.name}`}
        description="The first sentence is the whole job: it has to land in about two seconds. Each template shows how it reads for a real app, when to use it and how it has done."
      >
        <div className="grid gap-6">
          <p className="text-body-sm text-fg-muted" role="status" aria-live="polite">
            {hooks.length} {hooks.length === 1 ? "hook" : "hooks"} for {typeLabel}, best trial rate first.
          </p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((hook) => (
              <HookCard key={hook.id} hook={hook} />
            ))}
          </ul>
          {hooks.length > shown.length ? (
            <div className="flex justify-center">
              <Button variant="secondary" size="lg" onClick={() => setHookLimit((limit) => limit + HOOKS_PER_PAGE)}>
                Show {Math.min(HOOKS_PER_PAGE, hooks.length - shown.length)} more
              </Button>
            </div>
          ) : null}
          <Footnote>
            Hook Score here is the average {CHECKLIST_LABEL.split(".")[0]?.toLowerCase()} of posts that used the hook, not a prediction. Trial rate is trials per install on settled flowd posts, and small samples are not ranked as winners.
          </Footnote>
        </div>
      </PageSection>
    </>
  );
}
