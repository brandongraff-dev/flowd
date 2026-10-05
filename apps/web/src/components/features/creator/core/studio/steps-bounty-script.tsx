"use client";

import { useMemo, useState } from "react";
import { Check, Dices, Lock, RefreshCw, Sparkles, Zap } from "lucide-react";
import { DIFFICULTY_META, FORMAT_ID_META, HOOK_TYPE_META } from "@/lib/contract/types";
import { scriptTask } from "@/lib/ai/context";
import { useBountyForCreator, useFeed, useHooks, useSavedBounties, useTemplates } from "@/lib/data";
import type { BountyView, CreatorBountyView, FormatView } from "@/lib/data/selectors";
import { scoreHookText } from "@/lib/engine";
import { formatMoney } from "@/lib/format";
import { useFlo } from "@/lib/hooks/use-flo";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/brand";
import { Badge, Button, Callout, Chip, ChipGroup, Field, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { GlassCard } from "@/components/glass";
import { FundedBadge, payParts } from "../bounty-parts";
import { BandChip } from "./score-panel";
import { defaultScript, firstLine, type StudioDraft } from "./studio-state";

type SetDraft = (patch: Partial<StudioDraft>) => void;

// ── step 1: bounty and format ──────────────────────────────────────────────────────────────────

function BountyChoice({ bounty, selected, onPick, matchLabel }: { bounty: BountyView; selected: boolean; onPick: () => void; matchLabel?: string }) {
  const pay = payParts(bounty);
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onPick}
        className={cn(
          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[20px] bg-surface p-3.5 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[box-shadow,background-color] duration-(--fd-dur-fast) ease-standard hover:bg-surface-raised pointer-coarse:min-h-16",
          selected && "bg-accent-soft shadow-[inset_0_0_0_2px_var(--fd-accent-bright)]",
        )}
      >
        <AppIcon art={bounty.app.icon} name={bounty.app.name} size={40} decorative />
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-body-sm font-semibold text-fg">{bounty.title}</span>
          <span className="truncate text-caption text-fg-muted">
            {bounty.app.name} · {pay.headline}
            {pay.extras ? ` ${pay.extras}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {matchLabel ? <span className="hidden text-micro font-semibold text-accent tabular-nums sm:inline">{matchLabel}</span> : null}
          {selected ? (
            <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-accent-solid text-on-accent">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          ) : (
            <FundedBadge />
          )}
        </span>
      </button>
    </li>
  );
}

function FormatChoice({ format, selected, recommended, onPick }: { format: FormatView; selected: boolean; recommended: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onPick}
        className={cn(
          "grid h-full w-full content-start gap-2 rounded-[20px] bg-surface p-4 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[box-shadow,background-color] duration-(--fd-dur-fast) ease-standard hover:bg-surface-raised",
          selected && "bg-accent-soft shadow-[inset_0_0_0_2px_var(--fd-accent-bright)]",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-body-sm font-semibold text-fg">{FORMAT_ID_META[format.id]?.label ?? format.name}</span>
          {recommended ? (
            <Badge tone="mint" size="sm">
              Fits
            </Badge>
          ) : null}
        </span>
        <span className="line-clamp-2 text-caption text-fg-muted">{format.summary}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={DIFFICULTY_META[format.difficulty].tone} size="sm">
            {DIFFICULTY_META[format.difficulty].label}
          </Badge>
          <Badge tone="neutral" size="sm">
            {format.min_duration_s} to {format.max_duration_s} s
          </Badge>
          {format.faceless ? (
            <Badge tone="neutral" size="sm">
              No face needed
            </Badge>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function StepBounty({ draft, setDraft, view }: { draft: StudioDraft; setDraft: SetDraft; view: CreatorBountyView | undefined }) {
  const feed = useFeed({ sort: "match", hide_locked: true });
  const saved = useSavedBounties();
  const templates = useTemplates();
  const [showAll, setShowAll] = useState(false);

  const choices = useMemo(() => {
    const matchOf = new Map(feed.items.map((i) => [i.bounty.id, i.score]));
    const seen = new Set<string>();
    const list: { bounty: BountyView; score: number | null }[] = [];
    for (const item of feed.items) if (!seen.has(item.bounty.id) && !item.submitted) (seen.add(item.bounty.id), list.push({ bounty: item.bounty, score: item.score }));
    for (const b of saved) if (!seen.has(b.id) && b.status === "live") (seen.add(b.id), list.push({ bounty: b, score: matchOf.get(b.id) ?? null }));
    return list;
  }, [feed.items, saved]);

  const recommendedIds = view?.bounty.format_ids ?? [];
  const recommended = recommendedIds.map((id) => templates.find((t) => t.id === id)).filter((f): f is FormatView => f !== undefined);
  const others = templates.filter((t) => !recommendedIds.includes(t.id));
  const shownBounties = showAll ? choices : choices.slice(0, 6);

  const pick = (bounty: BountyView): void => {
    const first = bounty.format_ids[0];
    setDraft({ bountyId: bounty.id, formatId: first ?? null, title: "", markers: { ...draft.markers, music: bounty.deliverables.music_policy === "original_only" ? "original" : "commercial_library" }, hook: draft.bountyId === bounty.id ? draft.hook : "", script: draft.bountyId === bounty.id ? draft.script : "", plan: draft.bountyId === bounty.id ? draft.plan : [] });
  };

  return (
    <div className="grid gap-8">
      <section aria-labelledby="pick-bounty" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="pick-bounty" className="font-display text-title-md text-fg">
            Which bounty is this take for?
          </h2>
          <p className="text-body-sm text-fg-muted">Funded bounties that fit you, best match first. Your saved ones are here too.</p>
        </div>
        {!feed.items.length && !saved.length ? (
          <Skeleton className="h-40 w-full rounded-[24px]" />
        ) : (
          <>
            <ul role="radiogroup" aria-label="Bounty" className="grid gap-2.5 md:grid-cols-2">
              {shownBounties.map(({ bounty, score }) => (
                <BountyChoice key={bounty.id} bounty={bounty} selected={draft.bountyId === bounty.id} onPick={() => pick(bounty)} matchLabel={score !== null ? `${Math.round(score)}% match` : undefined} />
              ))}
            </ul>
            {choices.length > 6 ? (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show fewer" : `Show ${choices.length - 6} more`}
              </Button>
            ) : null}
          </>
        )}
        {view && !view.can_submit ? (
          <Callout tone="sun" icon={<Lock />} title="You can't submit to this one right now">
            {view.blocked_reason}
          </Callout>
        ) : null}
      </section>

      {view ? (
        <section aria-labelledby="pick-format" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="pick-format" className="font-display text-title-md text-fg">
              Pick a format
            </h2>
            <p className="text-body-sm text-fg-muted">The formats that fit this brief come first. Each one is a proven structure: you fill it with your own words and footage.</p>
          </div>
          <ul role="radiogroup" aria-label="Format" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {[...recommended.slice(0, 6), ...(showAll ? [...recommended.slice(6), ...others] : [])].map((format) => (
              <FormatChoice key={format.id} format={format} selected={draft.formatId === format.id} recommended={recommendedIds.includes(format.id)} onPick={() => setDraft({ formatId: format.id })} />
            ))}
          </ul>
          {!showAll && others.length > 0 ? (
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll(true)}>
              Show all {templates.length} formats
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

// ── step 2: script ─────────────────────────────────────────────────────────────────────────────

interface FloOption {
  title: string;
  lines: string[];
  hook: string | null;
  formatName: string;
}

/** An option from Flo: "Option 1: Confession hook, about 20 s" then one line per beat. Its hook is the quoted text on the Hook line. */
function parseOption(text: string): FloOption {
  const [head = "", ...rest] = text.split("\n");
  const formatName = head.replace(/^Option \d+:\s*/, "").replace(/, about.*$/, "");
  const hookLine = rest.find((l) => /same words on screen|first slide/i.test(l)) ?? rest.find((l) => /"[^"]+"/.test(l));
  const hook = hookLine?.match(/"([^"]+)"/)?.[1] ?? null;
  return { title: head, lines: rest.filter((l) => !l.startsWith("Caption:") && !l.startsWith("Brief check:")), hook, formatName };
}

function FloPanel({ view, draft, setDraft, creatorCode, creatorId }: { view: CreatorBountyView; draft: StudioDraft; setDraft: SetDraft; creatorCode: string; creatorId: string }) {
  const flo = useFlo();
  const templates = useTemplates();
  const { bounty } = view;
  const format = templates.find((t) => t.id === draft.formatId);
  const options = flo.outputs.map(parseOption);

  const write = (): void => {
    void flo.run(scriptTask({ bounty, app: bounty.app, ...(format ? { format } : {}), formats: view.formats, creatorCode, creatorId, options: 3 }));
  };

  const use = (option: FloOption): void => {
    const match = templates.find((t) => (FORMAT_ID_META[t.id]?.label ?? t.name).toLowerCase() === option.formatName.toLowerCase() || t.name.toLowerCase() === option.formatName.toLowerCase());
    const hook = option.hook ?? draft.hook;
    setDraft({ ...(match ? { formatId: match.id } : {}), hook, script: defaultScript({ hook }, bounty), plan: option.lines });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[48ch] text-body-sm text-fg-muted">Flo writes three shooting scripts for this bounty: the format's beats with the brief's must-say points, the offer and one call to action built in.</p>
        <Button variant="secondary" size="sm" leadingIcon={flo.status === "done" ? <RefreshCw /> : <Sparkles />} loading={flo.status === "thinking"} onClick={flo.status === "done" ? () => void flo.regenerate() : write}>
          {flo.status === "done" ? "Write different options" : "Write 3 options"}
        </Button>
      </div>
      {flo.status === "error" ? <Callout tone="rose" role="alert" title="Flo couldn't answer">{flo.error}</Callout> : null}
      {flo.status === "thinking" && options.length === 0 ? (
        <div className="grid gap-3" role="status" aria-label="Flo is writing">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}
      <ol className="grid gap-3" aria-live="polite" aria-busy={flo.status === "streaming"}>
        {options.map((option, i) => (
          <li key={i} className="grid gap-3 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-sm font-semibold text-fg">{option.title}</p>
              <Button variant="primary" size="xs" disabled={flo.status === "streaming" || !option.hook} onClick={() => use(option)}>
                Use this
              </Button>
            </div>
            {option.hook ? <p className="rounded-xl bg-violet-soft px-3 py-2 text-body-sm font-medium text-fg">&ldquo;{option.hook}&rdquo;</p> : null}
            <details className="group text-caption text-fg-muted">
              <summary className="cursor-pointer rounded-sm font-semibold text-accent">Shot plan, beat by beat</summary>
              <ul className="mt-2 grid gap-1.5">
                {option.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
      {flo.result ? <p className="text-micro text-fg-subtle">{flo.result.label}</p> : null}
    </div>
  );
}

function HookLibrary({ bounty, draft, setDraft }: { bounty: BountyView; draft: StudioDraft; setDraft: SetDraft }) {
  const [type, setType] = useState<keyof typeof HOOK_TYPE_META | "all">("all");
  const hooks = useHooks({ ...(type === "all" ? {} : { type }), fill: { app: bounty.app.name, feature: bounty.app.features[0] ?? "the main feature" } });
  return (
    <div className="grid gap-3">
      <ChipGroup aria-label="Hook type">
        <Chip selected={type === "all"} onSelectedChange={() => setType("all")}>
          All
        </Chip>
        {(Object.keys(HOOK_TYPE_META) as (keyof typeof HOOK_TYPE_META)[]).map((t) => (
          <Chip key={t} selected={type === t} onSelectedChange={() => setType(t)}>
            {HOOK_TYPE_META[t].label}
          </Chip>
        ))}
      </ChipGroup>
      <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1">
        {hooks.slice(0, 24).map((hook) => (
          <li key={hook.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <span className="grid gap-0.5">
              <span className="text-body-sm font-medium text-fg">&ldquo;{hook.filled}&rdquo;</span>
              <span className="text-micro text-fg-subtle">{HOOK_TYPE_META[hook.hook_type].label}</span>
            </span>
            <Button variant={draft.hook === hook.filled ? "mint" : "secondary"} size="xs" onClick={() => setDraft({ hook: hook.filled })}>
              {draft.hook === hook.filled ? "In use" : "Use"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StepScript({ draft, setDraft, view, creatorCode, creatorId }: { draft: StudioDraft; setDraft: SetDraft; view: CreatorBountyView; creatorCode: string; creatorId: string }) {
  const bounty = view.bounty;
  const check = useMemo(() => scoreHookText(draft.hook), [draft.hook]);
  const words = draft.script.trim() ? draft.script.trim().split(/\s+/).length : 0;
  const readSeconds = Math.round(words / 2.5);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <GlassCard padding="lg" className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">Your hook and script</h2>
          <p className="text-body-sm text-fg-muted">The hook is the first line you say. It decides whether anyone stays, and the Hook Score reads it first.</p>
        </div>
        <Field label="Hook line" hint="Say it in about two seconds. Put the same words on screen.">
          <Textarea value={draft.hook} onChange={(event) => setDraft({ hook: event.target.value })} rows={2} maxLength={160} showCount placeholder={`I tried ${bounty.app.name} so you do not have to guess.`} />
        </Field>
        {draft.hook.trim() ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-field px-3.5 py-2.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <BandChip band={check.band} />
            <span>
              {check.rule.words} words, about {check.rule.est_seconds} s to say. {check.rule.passes ? "Lands inside 2 seconds." : `Aim for ${check.rule.target_words} words or fewer.`}
            </span>
            <span className="text-fg-subtle">Text-only check. Checklist score.</span>
          </div>
        ) : null}
        <Field label="Script" hint={words > 0 ? `${words} words, about ${readSeconds} s read aloud. One sentence per line.` : "One sentence per line. Start from the brief, then make it sound like you."}>
          <Textarea value={draft.script} onChange={(event) => setDraft({ script: event.target.value })} rows={9} placeholder="Open with your hook, show the app, say the offer once, end on one call to action." />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" leadingIcon={<Dices />} onClick={() => setDraft({ script: defaultScript(draft, bounty) })}>
            Start from the brief
          </Button>
          {draft.script.trim() && !draft.hook.trim() ? (
            <Button variant="ghost" size="sm" onClick={() => setDraft({ hook: firstLine(draft.script) })}>
              Use the first line as the hook
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-fg-subtle">Studio adds the spoken and on-screen #ad for you. It is locked on: every posting flow carries the disclosure.</p>
      </GlassCard>

      <GlassCard padding="lg" className="grid content-start gap-4">
        <div className="flex items-center gap-2">
          <Zap aria-hidden="true" className="size-4 text-accent" strokeWidth={2} />
          <h2 className="font-display text-title-sm text-fg">Need a hand?</h2>
        </div>
        <Tabs defaultValue="flo">
          <TabsList aria-label="Ways to get a script">
            <TabsTrigger value="flo" icon={<Sparkles />}>
              Flo
            </TabsTrigger>
            <TabsTrigger value="hooks">Hook library</TabsTrigger>
          </TabsList>
          <TabsContent value="flo">
            <FloPanel view={view} draft={draft} setDraft={setDraft} creatorCode={creatorCode} creatorId={creatorId} />
          </TabsContent>
          <TabsContent value="hooks">
            <HookLibrary bounty={bounty} draft={draft} setDraft={setDraft} />
          </TabsContent>
        </Tabs>
        {draft.plan.length > 0 ? (
          <div className="grid gap-1.5 rounded-2xl bg-surface-field p-3.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="font-semibold text-fg">Shot plan from Flo ({draft.plan.length} beats)</p>
            <p>It stays beside your clip in the next step as a checklist.</p>
          </div>
        ) : null}
        <p className="text-micro text-fg-subtle">Pay stays the same whichever script you use: {formatMoney(bounty.per_video_cap_cents, { cents: "never" })} cap per video, paid on verified views.</p>
      </GlassCard>
    </div>
  );
}
