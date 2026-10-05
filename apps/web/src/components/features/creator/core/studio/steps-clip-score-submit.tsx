"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileVideo, Film, Lock, Smartphone, Upload } from "lucide-react";
import type { Format, SubmissionSource } from "@/lib/contract/types";
import type { CreatorBountyView, SubmissionView } from "@/lib/data/selectors";
import type { ScoreFix } from "@/lib/engine";
import { formatClockEta, formatDuration, formatMoney } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { actions } from "@/lib/store";
import type { SubmitVideoResult } from "@/lib/store/core/submissions";
import { cn } from "@/lib/utils";
import { ArtSurface } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, Checkbox, Field, Input, Select, Slider, Switch, Textarea, buttonVariants, notify } from "@/components/ui";
import { BriefCheck, Preflight, ScorePanel } from "./score-panel";
import { buildClip, type MusicKind, type StudioDraft, type StudioScore } from "./studio-state";

type SetDraft = (patch: Partial<StudioDraft>) => void;

const SOURCES: readonly { value: SubmissionSource; label: string }[] = [
  { value: "web_studio", label: "Uploaded here" },
  { value: "camera_roll", label: "Camera roll" },
  { value: "capcut", label: "CapCut export" },
];

const MUSIC: readonly { value: MusicKind; label: string }[] = [
  { value: "commercial_library", label: "Commercial library track" },
  { value: "original", label: "Original audio, no music" },
  { value: "trending_sound", label: "A trending sound" },
];

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

function Marker({ label, hint, value, max, onChange, disabled }: { label: string; hint: string; value: number; max: number; onChange: (ms: number) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body-sm font-medium text-fg">{label}</p>
        <p className="text-body-sm font-semibold text-fg tabular-nums">{seconds(value)}</p>
      </div>
      <Slider aria-label={label} min={0} max={max} step={50} value={[value]} onValueChange={(v) => onChange(v[0] ?? value)} format={seconds} tone="neutral" disabled={disabled} />
      <p className="text-caption text-fg-subtle">{hint}</p>
    </div>
  );
}

// ── step 3: the clip ───────────────────────────────────────────────────────────────────────────

export function StepClip({ draft, setDraft, view, format }: { draft: StudioDraft; setDraft: SetDraft; view: CreatorBountyView; format: Format | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const faceless = format?.faceless ?? false;
  const m = draft.markers;
  const shots = draft.plan.length > 0 ? draft.plan : (format?.shot_list ?? []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const choose = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      notify.error("That file isn't a video", { description: "Choose an MP4 or MOV, 9:16, up to 60 seconds." });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setDraft({ file: { name: file.name, sizeBytes: file.size, durationS: null, sample: false } });
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => setDraft({ file: { name: file.name, sizeBytes: file.size, durationS: Number.isFinite(probe.duration) ? Math.round(probe.duration * 10) / 10 : null, sample: false } });
    probe.src = url;
  };

  const sample = (): void => {
    setPreviewUrl(null);
    setDraft({ file: { name: "sample-take.mp4", sizeBytes: 21_800_000, durationS: 24, sample: true } });
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-72 overflow-hidden rounded-[28px] bg-bg-sunken shadow-[inset_0_0_0_1px_var(--fd-rim),var(--fd-elevation-2)]">
          {previewUrl ? (
            <video src={previewUrl} controls playsInline className="absolute inset-0 size-full object-cover" aria-label="Preview of your clip. It stays on this device." />
          ) : draft.file ? (
            <>
              <ArtSurface art={view.bounty.art} aspect="9:16" className="absolute inset-0 block size-full" />
              <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0" />
              <div className="absolute inset-x-5 bottom-5 grid gap-1 text-white">
                <p className="font-display text-title-md leading-tight [text-shadow:0_2px_14px_rgb(1_4_20/0.55)]">{draft.hook || "Your take"}</p>
                <p className="text-caption text-white/85">{draft.file.sample ? "Sample take" : draft.file.name}</p>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="absolute inset-0 grid place-items-center gap-3 p-6 text-center text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
              <span className="grid justify-items-center gap-3">
                <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                  <Upload className="size-6" strokeWidth={1.75} />
                </span>
                <span className="text-body-sm font-semibold text-fg">Upload or import a take</span>
                <span className="text-caption">MP4 or MOV, 9:16, up to 60 seconds</span>
              </span>
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="video/*" className="sr-only" tabIndex={-1} onChange={choose} aria-label="Choose a video file" />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant={draft.file ? "secondary" : "primary"} size="sm" leadingIcon={<FileVideo />} onClick={() => input.current?.click()}>
            {draft.file ? "Choose another" : "Choose a video"}
          </Button>
          {!draft.file ? (
            <Button variant="ghost" size="sm" leadingIcon={<Film />} onClick={sample}>
              Try a sample take
            </Button>
          ) : null}
        </div>
        {draft.file ? (
          <p className="text-center text-caption text-fg-muted">
            {draft.file.sample ? "Sample take" : draft.file.name} · {draft.file.durationS ? formatDuration(draft.file.durationS) : "length from your script"} · {(draft.file.sizeBytes / 1_000_000).toFixed(1)} MB
          </p>
        ) : null}
        <Callout tone="accent" icon={<Smartphone />} title="Record in the iOS app for the teleprompter">
          The app puts your script next to the lens, ticks the checklist as you speak, and reads the first 3 seconds on your device.{" "}
          <Link href="/app" className="font-semibold">
            Get the app
          </Link>
        </Callout>
      </div>

      <div className="grid gap-5">
        <GlassCard padding="lg" className="grid gap-6">
          <div className="grid gap-1">
            <h2 className="font-display text-title-md text-fg">What we found in the first seconds</h2>
            <p className="text-body-sm text-fg-muted">The web demo scores your script and these markers. The iOS app measures them from the video itself. Adjust anything that is wrong and the score follows.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Marker label="First word" hint="When you start speaking." value={m.speechStartMs} max={3000} onChange={(ms) => setDraft({ markers: { ...m, speechStartMs: ms } })} />
            {!faceless ? <Marker label="Your face on screen" hint="Open on your face, then cut to the app." value={m.faceAtMs} max={4000} onChange={(ms) => setDraft({ markers: { ...m, faceAtMs: ms } })} /> : <p className="self-center text-caption text-fg-muted">This format doesn&rsquo;t need a face, so face timing is skipped.</p>}
            <Marker label="The app on screen" hint="Show the app inside the first 3 seconds." value={m.appAtMs} max={8000} onChange={(ms) => setDraft({ markers: { ...m, appAtMs: ms } })} />
            <div className="grid gap-2">
              <Switch
                label="A cut or zoom early on"
                description="A pattern interrupt in the first 1.5 seconds resets attention."
                checked={m.firstCutMs !== null}
                onCheckedChange={(on) => setDraft({ markers: { ...m, firstCutMs: on ? 1000 : null } })}
                containerClassName="px-0"
              />
              {m.firstCutMs !== null ? <Marker label="First cut or zoom" hint="" value={m.firstCutMs} max={4000} onChange={(ms) => setDraft({ markers: { ...m, firstCutMs: Math.max(100, ms) } })} /> : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Switch label="Hook text on screen" description="The words you say, burned in during the first second." checked={m.hookOnScreen} onCheckedChange={(on) => setDraft({ markers: { ...m, hookOnScreen: on } })} />
            <Field label="Music" hint={`This bounty: ${view.bounty.deliverables.music_policy === "original_only" ? "original audio only, no music tracks" : "commercial-library music is fine"}.`}>
              <Select value={m.music} onValueChange={(value) => setDraft({ markers: { ...m, music: value as MusicKind } })} options={MUSIC.map((o) => ({ value: o.value, label: o.label }))} />
            </Field>
            <Field label="Where it came from">
              <Select value={draft.source} onValueChange={(value) => setDraft({ source: value as SubmissionSource })} options={SOURCES.map((o) => ({ value: o.value, label: o.label }))} />
            </Field>
          </div>
        </GlassCard>

        {shots.length > 0 ? (
          <GlassCard className="grid gap-3">
            <h3 className="text-body-sm font-semibold text-fg">Shot checklist</h3>
            <ul className="grid gap-0.5">
              {shots.map((shot) => (
                <li key={shot}>
                  <Checkbox
                    label={shot}
                    checked={checked.has(shot)}
                    onCheckedChange={(on) =>
                      setChecked((previous) => {
                        const next = new Set(previous);
                        if (on === true) next.add(shot);
                        else next.delete(shot);
                        return next;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-micro text-fg-subtle">Ticks stay on this page. In the iOS app they tick themselves as you speak.</p>
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}

// ── step 4: score ──────────────────────────────────────────────────────────────────────────────

export function StepScore({ score, onApply }: { score: StudioScore; onApply: (fix: ScoreFix) => void }) {
  const a = score.analysis;
  return (
    <div className="grid gap-6">
      <GlassCard padding="lg">
        <ScorePanel hook={a.hook} flow={a.flow} hookFixes={score.hookFixes} flowFixes={score.flowFixes} onApply={onApply} />
      </GlassCard>
      <GlassCard padding="lg" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-title-md text-fg">Brief check</h2>
          <Badge tone={score.brief.band === "A" || score.brief.band === "B" ? "mint" : "sun"} size="md">
            {score.brief.points} of 100 · {score.brief.band}
          </Badge>
        </div>
        <p className="text-body-sm text-fg-muted">How closely the video follows what the brief asked for. This is the same checklist the brand's reviewer sees. Checklist score, not a verdict.</p>
        <BriefCheck brief={score.brief} />
      </GlassCard>
    </div>
  );
}

// ── step 5: pre-flight and submit ──────────────────────────────────────────────────────────────

export function StepSubmit({ draft, setDraft, view, format, score, onDone, revise }: { draft: StudioDraft; setDraft: SetDraft; view: CreatorBountyView; format: Format | undefined; score: StudioScore; onDone: (result: SubmitVideoResult) => void; revise?: SubmissionView }) {
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState("");
  const [error, setError] = useState<string | undefined>();
  const now = useNow();
  const { bounty } = view;
  const blocking = score.analysis.analysis.checks.filter((c) => c.blocks_settlement && c.result === "fail");
  const failures = score.analysis.analysis.checks.filter((c) => c.result === "fail").length;
  const title = draft.title || `${format?.name ?? "Take"} v1`;
  const caption = `${bounty.brief.disclosure_text} ${bounty.brief.hashtags.join(" ")}`.trim();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    if (revise) {
      const revised = await actions.reviseSubmission({
        submission_id: revise.id,
        clip: buildClip(draft, format?.faceless ?? false),
        ...(changes.trim() ? { changes_summary: changes.trim() } : {}),
        file: { size_bytes: draft.file?.sizeBytes ?? 20_000_000 },
      });
      setBusy(false);
      if (!revised.ok) {
        setError(`${revised.error.message}${revised.error.hint ? ` ${revised.error.hint}` : ""}`);
        return;
      }
      onDone({ submission: revised.data.submission, analysis: revised.data.analysis, reserved_cents: revised.data.submission.reserved_cents, status: revised.data.submission.status, auto_approved: revised.data.auto_approved });
      return;
    }
    const result = await actions.submitVideo({
      bounty_id: bounty.id,
      title,
      ...(format ? { format_id: format.id } : {}),
      source: draft.source,
      clip: buildClip(draft, format?.faceless ?? false),
      accept_rights: draft.rightsAccepted,
      file: { name: draft.file?.name ?? "take.mp4", ...(draft.file ? { size_bytes: draft.file.sizeBytes } : {}) },
    });
    setBusy(false);
    if (!result.ok) {
      setError(`${result.error.message}${result.error.hint ? ` ${result.error.hint}` : ""}`);
      return;
    }
    onDone(result.data);
  };

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <GlassCard padding="lg" className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">Pre-flight</h2>
          <p className="text-body-sm text-fg-muted">The same checks run again when the brand reviews. Fix a failure now and nothing waits on a revision.</p>
        </div>
        <Preflight checks={score.analysis.analysis.checks} />
        <p className="flex items-start gap-2 text-caption text-fg-subtle">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          The spoken and on-screen #ad is added to every take and cannot be turned off. It is the law and it protects you.
        </p>
      </GlassCard>

      <div className="grid gap-5">
        <GlassCard padding="lg" className="grid gap-4">
          <h2 className="font-display text-title-md text-fg">Send it</h2>
          {revise ? (
            <Field label="What changed since the last version" optional hint="One or two sentences. The reviewer sees it next to your previous notes.">
              <Textarea value={changes} onChange={(event) => setChanges(event.target.value)} rows={3} maxLength={240} showCount placeholder="Moved the app reveal to 0:02 and put the hook on screen." />
            </Field>
          ) : (
            <Field label="Title only you and the brand see">
              <Input value={draft.title} onChange={(event) => setDraft({ title: event.target.value })} placeholder={title} maxLength={60} />
            </Field>
          )}
          <div className="grid gap-1 rounded-2xl bg-surface-field p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="text-micro font-medium text-fg-subtle">Caption, with the disclosure first</p>
            <p className="text-body-sm text-fg">{caption}</p>
          </div>
          {revise ? (
            <p className="text-caption text-fg-muted">Your licence stays the one you accepted on the first version. This is revision round {revise.revision_round + 1} of 2 free rounds.</p>
          ) : (
            <Checkbox
              label="I accept this bounty's Rights Card"
              description={`${view.rights.summary.split(". ").slice(0, 2).join(". ")}. A copy is saved when you submit.`}
              checked={draft.rightsAccepted}
              onCheckedChange={(on) => setDraft({ rightsAccepted: on === true })}
            />
          )}
          <p className="text-caption text-fg-muted">
            Submitting reserves up to {formatMoney(bounty.per_video_cap_cents, { cents: "auto" })} from the pool for you.{" "}
            {bounty.is_starter
              ? `flowd decides within 24 hours and the flat ${formatMoney(bounty.flat_fee_cents, { cents: "auto" })} clears within 48 hours of approval. Approval isn't guaranteed.`
              : `${bounty.brand.name} decides by ${formatClockEta(new Date(now + bounty.review_sla_hours * 3_600_000).toISOString(), { now })} UTC.`}
          </p>
          {blocking.length > 0 ? (
            <Callout tone="rose" role="alert" title="Fix this before you submit">
              {blocking.map((c) => c.message).join(" ")}
            </Callout>
          ) : failures > 0 ? (
            <Callout tone="sun" title="Some checks failed">
              You can still submit, but the brand will see the same flags. Go back and fix them to be reviewed faster.
            </Callout>
          ) : null}
          {error ? (
            <Callout tone="rose" role="alert" title="That didn't go through">
              {error}
            </Callout>
          ) : null}
          <Button variant="primary" size="lg" loading={busy} disabled={(!draft.rightsAccepted && !revise) || blocking.length > 0 || (!view.can_submit && !revise)} onClick={() => void submit()} trailingIcon={<ArrowRight />}>
            {revise ? "Submit revision" : "Submit for review"}
          </Button>
          {!draft.rightsAccepted && !revise ? <p className="text-caption text-fg-subtle">Accept the Rights Card to submit.</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}

export function Submitted({ result, view }: { result: SubmitVideoResult; view: CreatorBountyView }) {
  const now = useNow();
  const status = result.status;
  const due = result.submission.sla_due_at;
  return (
    <GlassCard padding="lg" className="mx-auto grid max-w-2xl justify-items-center gap-5 text-center" role="status">
      <span aria-hidden="true" className={cn("grid size-16 place-items-center rounded-full", status === "rejected" ? "bg-rose-soft text-rose" : "bg-mint-soft text-mint")}>
        <Check className="size-8" strokeWidth={2.5} />
      </span>
      <div className="grid gap-2">
        <h2 className="font-display text-title-lg text-fg">{status === "rejected" ? "Not accepted into review" : status === "approved" ? "Approved right away" : "Submitted"}</h2>
        <p className="text-body text-fg-muted">
          {status === "in_review" && due
            ? `${view.bounty.brand.name} decides by ${formatClockEta(due, { now })} UTC. We'll tell you the moment they do.`
            : status === "approved"
              ? "A guarded auto-approve rule passed it. Post it with the disclosure and your link to start the 72-hour view window."
              : (result.submission.decision?.summary ?? "It failed a hard check. Open it to see which one and fix it.")}
        </p>
        <p className="text-caption text-fg-subtle">{formatMoney(result.reserved_cents, { cents: "auto" })} is reserved for you in the pool while it is reviewed. If it is approved you are paid even if the pool empties.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link href={`/creator/submissions/${result.submission.id}`} className={buttonVariants({ variant: "primary" })}>
          See your submission
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/creator/feed" className={buttonVariants({ variant: "ghost" })}>
          Back to the feed
        </Link>
      </div>
    </GlassCard>
  );
}
