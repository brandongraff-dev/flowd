"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Trash2 } from "lucide-react";
import { useBountyForCreator, useHooks, useMe, useStoreReady, useSubmission, useSubmissionAnalysis, useTemplates } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { useNow, useNowIso } from "@/lib/hooks/use-now";
import type { SubmitVideoResult } from "@/lib/store/core/submissions";
import { PageHeader } from "@/components/shell";
import { Button, Callout, Skeleton, Stepper, notify } from "@/components/ui";
import { GlassCard } from "@/components/glass";
import { applyFix, emptyDraft, readDrafts, removeDraft, scoreDraft, STUDIO_STEPS, writeDraft, type StudioDraft } from "./studio-state";
import { StepBounty, StepScript } from "./steps-bounty-script";
import { StepClip, StepScore, StepSubmit, Submitted } from "./steps-clip-score-submit";
import { ScoreRing } from "@/components/charts";
import type { ScoreFix } from "@/lib/engine";

/**
 * Studio-lite: pick a bounty and a format, write the script (Flo, the hook library or your own), upload or import a take, read the Hook Score and Flow Score
 * with timecoded reasons and one-tap fixes, run the brief check and pre-flight, and submit. Drafts autosave in this browser. The scores are the same
 * checklist code the brand's reviewer sees, and they are labelled checklist scores everywhere.
 */
export function StudioPage() {
  const ready = useStoreReady();
  const me = useMe();
  const params = useSearchParams();
  const nowIso = useNowIso();
  const now = useNow();
  const templates = useTemplates();

  const [draft, setDraftState] = useState<StudioDraft>(() => emptyDraft("2026-10-03T14:00:00Z"));
  const [drafts, setDrafts] = useState<Record<string, StudioDraft>>({});
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<SubmitVideoResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const initialised = useRef(false);

  const reviseId = params.get("revise") ?? undefined;
  const revising = useSubmission(reviseId);
  const revisingAnalysis = useSubmissionAnalysis(reviseId);
  const view = useBountyForCreator(draft.bountyId ?? undefined);
  const format = templates.find((t) => t.id === draft.formatId);
  const hookLibrary = useHooks(view ? { fill: { app: view.bounty.app.name, feature: view.bounty.app.features[0] ?? "the main feature" } } : undefined);

  // Read drafts and the URL once, after hydration (storage is not available on the server).
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const stored = readDrafts();
    setDrafts(stored);
    const bounty = params.get("bounty");
    const formatId = params.get("format");
    const hookText = params.get("text");
    if (bounty && !params.get("revise")) {
      const existing = stored[bounty];
      setDraftState(existing ? { ...existing, ...(formatId ? { formatId } : {}), ...(hookText ? { hook: hookText.slice(0, 160) } : {}) } : { ...emptyDraft(nowIso), bountyId: bounty, formatId, hook: hookText?.slice(0, 160) ?? "", step: 1 });
    }
    setHydrated(true);
  }, [params, nowIso]);

  // Revising a submission: start from what the last version said and showed, on the script step, with a new clip still to come.
  const reviseLoaded = useRef(false);
  const lastAnalysis = revisingAnalysis.current;
  useEffect(() => {
    if (!hydrated || reviseLoaded.current || !revising || !lastAnalysis) return;
    reviseLoaded.current = true;
    const spoken = lastAnalysis.transcript.filter((t) => !/paid partnership|#ad/i.test(t.text));
    setDraftState({
      ...emptyDraft(nowIso),
      bountyId: revising.bounty_id,
      formatId: revising.format_id ?? null,
      hook: lastAnalysis.hook.text,
      script: spoken.map((t) => t.text).join("\n"),
      title: revising.title,
      step: 1,
      rightsAccepted: true,
      markers: { speechStartMs: lastAnalysis.transcript[0]?.t_start_ms ?? 450, faceAtMs: lastAnalysis.hook.face_at_ms ?? 300, appAtMs: lastAnalysis.hook.app_at_ms ?? 2200, firstCutMs: null, hookOnScreen: lastAnalysis.hook.spoken_matches_onscreen, music: "commercial_library" },
    });
  }, [hydrated, revising, lastAnalysis, nowIso]);

  // A bounty picked from the URL or the feed: start with the format that fits it best.
  useEffect(() => {
    if (view && draft.bountyId && !draft.formatId && view.bounty.format_ids[0]) setDraftState((d) => ({ ...d, formatId: view.bounty.format_ids[0] ?? null }));
  }, [view, draft.bountyId, draft.formatId]);

  // Arriving with ?hook=<id> from the Remix library: fill that hook in once the library is ready.
  const hookId = params.get("hook");
  const hookApplied = useRef(false);
  useEffect(() => {
    if (!hookId || hookApplied.current || !hydrated || hookLibrary.length === 0) return;
    const found = hookLibrary.find((h) => h.id === hookId);
    if (found) {
      hookApplied.current = true;
      setDraftState((d) => ({ ...d, hook: found.filled }));
    }
  }, [hookId, hookLibrary, hydrated]);

  const setDraft = useCallback((patch: Partial<StudioDraft>): void => {
    setDraftState((previous) => ({ ...previous, ...patch }));
  }, []);

  // Autosave: a quiet "Draft saved" line, never a toast per keystroke.
  useEffect(() => {
    if (!hydrated || !draft.bountyId || result || reviseId) return;
    const id = window.setTimeout(() => {
      const next = { ...draft, updatedAt: nowIso };
      writeDraft(next);
      setDrafts((all) => ({ ...all, [draft.bountyId as string]: next }));
      setSaved(nowIso);
    }, 600);
    return () => window.clearTimeout(id);
  }, [draft, hydrated, nowIso, result, reviseId]);

  const score = useMemo(() => {
    if (!view || !me.creator) return null;
    return scoreDraft(draft, { bounty: view.bounty, app: view.bounty.app, brand: view.bounty.brand, ...(format ? { format } : {}), creatorId: me.creator.id });
  }, [view, me.creator, draft, format]);

  const apply = (fix: ScoreFix): void => {
    if (!score || !view) return;
    const next = applyFix(draft, fix, score, { bounty: view.bounty, hooks: hookLibrary.map((h) => h.filled) });
    if (!next) return;
    const after = scoreDraft(next, { bounty: view.bounty, app: view.bounty.app, brand: view.bounty.brand, ...(format ? { format } : {}), creatorId: me.creator?.id ?? "" });
    setDraftState(next);
    const hookBefore = score.analysis.hook.band;
    const hookAfter = after.analysis.hook.band;
    notify.success(hookBefore !== hookAfter ? `Hook Score ${hookBefore} to ${hookAfter}` : "Fix applied", { description: `${fix.label}. Checklist score: ${after.analysis.hook.points} for the hook, ${after.analysis.flow.points} for the flow.` });
  };

  const discard = (): void => {
    if (draft.bountyId) removeDraft(draft.bountyId);
    setDrafts((all) => {
      const next = { ...all };
      if (draft.bountyId) delete next[draft.bountyId];
      return next;
    });
    setDraftState(emptyDraft(nowIso));
    notify.message("Draft discarded");
  };

  const done = (data: SubmitVideoResult): void => {
    if (draft.bountyId) removeDraft(draft.bountyId);
    setResult(data);
  };

  const step = Math.min(Math.max(draft.step, 0), STUDIO_STEPS.length - 1);

  // A new step starts at the top of the page, like a new screen.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const canContinue =
    step === 0 ? Boolean(view?.can_submit && draft.formatId) : step === 1 ? draft.hook.trim().length > 0 : step === 2 ? draft.file !== null : true;
  const reason =
    step === 0 && !draft.bountyId
      ? "Pick a bounty to continue."
      : step === 0 && view && !view.can_submit
        ? view.blocked_reason
        : step === 0 && !draft.formatId
          ? "Pick a format to continue."
          : step === 1 && draft.hook.trim().length === 0
            ? "Write or pick a hook line to continue."
            : step === 2 && draft.file === null
              ? "Choose a video, or try the sample take."
              : undefined;

  if (!ready || !hydrated) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-24 w-full max-w-xl" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full rounded-[28px]" />
      </div>
    );
  }

  if (result && view) {
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow="Studio" title="Sent for review" description={`${view.bounty.title} · ${view.bounty.app.name}`} />
        <Submitted result={result} view={view} />
      </div>
    );
  }

  const otherDrafts = Object.values(drafts).filter((d) => d.bountyId !== draft.bountyId);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Studio"
        title={revising ? `Revise "${revising.title}"` : view ? `Make a take for ${view.bounty.app.name}` : "Make a take"}
        description={view ? view.bounty.title : "Pick a bounty, write the script, upload your take and see how it scores before you submit."}
        meta={
          draft.bountyId && !reviseId ? (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-caption text-fg-subtle">
              <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              {saved ? `Draft saved ${formatRelative(saved, now, { style: "short" })}` : "Autosaves in this browser"}
            </span>
          ) : undefined
        }
        actions={
          draft.bountyId && !reviseId ? (
            <Button variant="ghost" size="sm" leadingIcon={<Trash2 />} onClick={discard}>
              Discard draft
            </Button>
          ) : undefined
        }
      />

      {step === 0 && otherDrafts.length > 0 ? (
        <GlassCard padding="sm" className="grid gap-2">
          <h2 className="px-1 text-body-sm font-semibold text-fg">Pick up a draft</h2>
          <ul className="grid gap-1">
            {otherDrafts.map((d) => (
              <li key={d.bountyId}>
                <button type="button" onClick={() => setDraftState(d)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-body-sm transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
                  <span className="truncate font-medium text-fg">{d.title || d.hook || d.bountyId}</span>
                  <span className="shrink-0 text-caption text-fg-subtle">
                    Step {d.step + 1} of {STUDIO_STEPS.length} · {formatRelative(d.updatedAt, now, { style: "short" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      <Stepper steps={STUDIO_STEPS.map((s) => ({ id: s.id, label: s.label, description: s.description }))} current={step} aria-label="Studio progress" onStepSelect={(i) => setDraft({ step: i })} />

      {step >= 3 && score ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-field px-4 py-2.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)] md:hidden">
          <ScoreRing name="Hook Score" score={score.analysis.hook.points} size={40} checklist={false} />
          Hook {score.analysis.hook.band} · Flow {score.analysis.flow.band} · checklist score
        </div>
      ) : null}

      {step === 0 ? <StepBounty draft={draft} setDraft={setDraft} view={view} /> : null}
      {step === 1 && view && me.creator ? <StepScript draft={draft} setDraft={setDraft} view={view} creatorCode={me.creator.referral_code} creatorId={me.creator.id} /> : null}
      {step === 2 && view ? <StepClip draft={draft} setDraft={setDraft} view={view} format={format} /> : null}
      {step === 3 && score ? <StepScore score={score} onApply={apply} /> : null}
      {step === 4 && score && view ? <StepSubmit draft={draft} setDraft={setDraft} view={view} format={format} score={score} onDone={done} revise={revising} /> : null}

      {step > 0 && !view ? (
        <Callout tone="sun" title="That bounty isn't available">
          It may have been filled or ended since you started. Go back and pick another; your script is kept.
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {reviseId && step <= 1 ? (
            <Link href={`/creator/submissions/${reviseId}`} className="text-body-sm font-semibold text-fg-muted hover:text-fg">
              Back to the submission
            </Link>
          ) : step > 0 ? (
            <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => setDraft({ step: step - 1 })}>
              Back
            </Button>
          ) : (
            <Link href="/creator/feed" className="text-body-sm font-semibold text-fg-muted hover:text-fg">
              Browse the feed instead
            </Link>
          )}
        </div>
        {step < STUDIO_STEPS.length - 1 ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!canContinue && reason ? <p className="text-caption text-fg-muted">{reason}</p> : null}
            <Button variant="primary" size="lg" disabled={!canContinue} trailingIcon={<ArrowRight />} onClick={() => setDraft({ step: step + 1 })}>
              {step === 2 ? "Score my take" : "Continue"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
