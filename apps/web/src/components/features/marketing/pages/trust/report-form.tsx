"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, FileUp, ShieldCheck, X } from "lucide-react";
import { z } from "zod";
import type { ReportTargetKind, ScamReason } from "@/lib/contract/types";
import { formatDateTime } from "@/lib/format";
import { track } from "@/lib/analytics";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Button, Callout, CopyField, Field, Input, RadioGroup, RadioGroupItem, Select, Textarea, buttonVariants } from "@/components/ui";
import { FormAnnouncer } from "@/components/features/auth/auth-parts";
import { useZodForm } from "@/components/features/auth/use-zod-form";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REASONS: ReadonlyArray<{ value: ScamReason; label: string; hint: string }> = [
  { value: "pay_to_join", label: "Pay to join", hint: "Asked for a fee, deposit or purchase" },
  { value: "fake_brand", label: "Fake brand", hint: "Pretends to be a real company or app" },
  { value: "burner_account_demand", label: "Burner-account demand", hint: "Wants a new account or forced post counts" },
  { value: "off_platform_chat", label: "Off-platform contact", hint: "Wants to talk outside flowd" },
  { value: "no_escrow_claim", label: "Unfunded, called funded", hint: "Says an unfunded bounty is funded" },
  { value: "suspicious_link", label: "Suspicious link", hint: "A link that is not the App Store or flowd" },
  { value: "harassment", label: "Harassment", hint: "Threats, pressure or abuse" },
  { value: "other", label: "Something else", hint: "Anything that feels wrong" },
];

const TARGETS: ReadonlyArray<{ value: ReportTargetKind; label: string; placeholder: string }> = [
  { value: "brand", label: "A brand", placeholder: "The brand's name, or a link to its page" },
  { value: "bounty", label: "A bounty", placeholder: "The bounty's title or link" },
  { value: "creator", label: "A creator", placeholder: "Their @handle" },
  { value: "message", label: "A message", placeholder: "Who sent it, and roughly when" },
  { value: "offer", label: "A direct offer", placeholder: "The offer's title or who sent it" },
];

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  reason: z.string().min(1, "Pick the closest match. You can add detail below."),
  targetKind: z.string().min(1, "Say what this is about."),
  target: z.string().trim().min(2, "Tell us who or what it is: a name, a handle or a link."),
  description: z.string().trim().min(10, "Describe what happened in a sentence or two.").max(1500, "Keep it under 1,500 characters. You can add more when we reply."),
  contact: z.string().trim().refine((value) => value === "" || EMAIL.test(value), "Enter an email like name@example.com, or leave it empty."),
});

const INITIAL = { reason: "", targetKind: "", target: "", description: "", contact: "" };

interface Confirmation {
  caseId: string;
  dueAt: string;
  files: number;
}

const formatBytes = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * The no-login report form. A visitor picks what happened, says who or what it is about, describes it and optionally attaches evidence and a
 * contact address. The report goes to the Safety queue through the same store action the in-app report button uses, and the visitor gets a case
 * ID and the deadline by which a person triages it. Evidence files are a mock: their names travel with the case and nothing is uploaded.
 */
export function ReportForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const form = useZodForm(schema, INITIAL, {
    idPrefix: "report",
    order: ["reason", "targetKind", "target", "description", "contact"],
    labels: { reason: "What happened", targetKind: "About", target: "Who or what", description: "Description", contact: "Contact email" },
  });

  const addFiles = (list: FileList | null): void => {
    if (!list) return;
    const next = [...files];
    let message: string | null = null;
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        message = `You can attach up to ${MAX_FILES} files.`;
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        message = `${file.name} is over 10 MB. Try a smaller screenshot.`;
        continue;
      }
      if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) next.push(file);
    }
    setFiles(next);
    setFileProblem(message);
    if (picker.current) picker.current.value = "";
  };

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setProblem(null);
    const result = await actions.reportScam({
      target_kind: values.targetKind as ReportTargetKind,
      target_id: values.target.trim(),
      reason: values.reason as ScamReason,
      description: values.contact.trim() ? `${values.description.trim()}\n\nReporter contact: ${values.contact.trim()}` : values.description.trim(),
      evidence_refs: files.map((file) => file.name),
    });
    setBusy(false);
    if (!result.ok) {
      setProblem({ message: result.error.message, hint: result.error.hint });
      return;
    }
    track("scam_report_filed", { reason: values.reason, signed_in: false });
    setDone({ caseId: result.data.report.case_id, dueAt: result.data.report.sla_due_at, files: files.length });
  });

  if (done) {
    return (
      <GlassCard padding="lg" role="status" aria-live="polite" className="grid gap-7">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-mint-soft text-mint [&_svg]:size-7">
            <CircleCheck strokeWidth={1.75} />
          </span>
          <div className="grid gap-1.5">
            <h2 className="font-display text-title-lg text-fg">Report received</h2>
            <p className="max-w-[52ch] text-body text-fg-muted">A person will triage it by {formatDateTime(done.dueAt)}. You do not need to do anything else, and nothing about your account changes.</p>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Your case ID</p>
          <CopyField aria-label="Case ID" value={done.caseId} className="max-w-sm" />
          <p className="text-caption text-fg-subtle">Keep it. Quote it if you write to us at hello@joinflowd.io.</p>
        </div>
        {done.files > 0 ? <p className="text-caption text-fg-subtle">{done.files} {done.files === 1 ? "file name was" : "file names were"} attached to the case. Demo: nothing is uploaded.</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/trust" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Back to the Trust Center
          </Link>
          <Link href="/help#safety" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            Safety help
          </Link>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              form.reset();
              setFiles([]);
              setDone(null);
            }}
          >
            Report something else
          </Button>
        </div>
      </GlassCard>
    );
  }

  const target = TARGETS.find((item) => item.value === form.values.targetKind);

  return (
    <GlassCard padding="lg">
      <form onSubmit={submit} noValidate className="grid gap-7">
        <fieldset className="grid gap-3">
          <legend className="text-body-sm font-semibold text-fg">What happened?</legend>
          <RadioGroup aria-label="What happened" value={form.values.reason} onValueChange={(value) => form.set("reason", value)} className="grid gap-2 sm:grid-cols-2">
            {REASONS.map((reason, index) => (
              <RadioGroupItem key={reason.value} id={index === 0 ? form.fieldId("reason") : undefined} value={reason.value} label={reason.label} description={reason.hint} variant="card" />
            ))}
          </RadioGroup>
          {form.errors.reason ? (
            <p className="flex items-start gap-1.5 text-caption font-medium text-rose">
              <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              <span>{form.errors.reason}</span>
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <Field id={form.fieldId("targetKind")} label="It is about" error={form.errors.targetKind}>
            <Select options={TARGETS} placeholder="Pick one" value={form.values.targetKind} onValueChange={(value) => form.set("targetKind", value)} />
          </Field>
          <Field id={form.fieldId("target")} label="Who or what" error={form.errors.target}>
            <Input
              autoComplete="off"
              placeholder={target?.placeholder ?? "A name, a handle or a link"}
              value={form.values.target}
              onChange={(event) => form.set("target", event.target.value)}
              onBlur={() => form.blur("target")}
            />
          </Field>
        </div>

        <Field id={form.fieldId("description")} label="What happened, in your words" hint="Say what they asked for and where. Do not include passwords or card numbers." error={form.errors.description}>
          <Textarea
            rows={5}
            maxLength={1500}
            showCount
            value={form.values.description}
            onChange={(event) => form.set("description", event.target.value)}
            onBlur={() => form.blur("description")}
          />
        </Field>

        <div className="grid gap-3">
          <p className="text-caption font-semibold text-fg-muted">
            Evidence <span className="font-normal text-fg-subtle">Optional</span>
          </p>
          <input ref={picker} id="report-evidence" type="file" multiple accept="image/*,.pdf,.txt" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
          <label
            htmlFor="report-evidence"
            className={cn(
              buttonVariants({ variant: "secondary", size: "md" }),
              "w-fit cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              files.length >= MAX_FILES && "pointer-events-none opacity-50",
            )}
          >
            <FileUp aria-hidden="true" />
            Attach screenshots or a PDF
          </label>
          <p className="text-caption text-fg-subtle">Up to {MAX_FILES} files, 10 MB each. Demo: the file names travel with the report and nothing is uploaded.</p>
          {fileProblem ? (
            <p role="alert" className="flex items-start gap-1.5 text-caption font-medium text-rose">
              <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              {fileProblem}
            </p>
          ) : null}
          {files.length > 0 ? (
            <ul aria-label="Attached files" className="grid gap-2">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-2xl bg-surface-field py-2 pr-2 pl-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                  <p className="min-w-0 flex-1 truncate text-body-sm text-fg">{file.name}</p>
                  <p className="shrink-0 text-caption text-fg-subtle">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:size-11"
                  >
                    <X aria-hidden="true" className="size-4" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Field id={form.fieldId("contact")} label="Your email" optional hint="Only if you want a reply. We never share it with the person you are reporting." error={form.errors.contact}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.values.contact}
            onChange={(event) => form.set("contact", event.target.value)}
            onBlur={() => form.blur("contact")}
          />
        </Field>

        <FormAnnouncer message={form.summary} />
        {problem ? (
          <Callout tone="rose" role="alert" title={problem.message}>
            {problem.hint}
          </Callout>
        ) : null}

        <div className="grid gap-3">
          <Button type="submit" variant="primary" size="lg" className="w-full sm:w-fit" loading={busy} leadingIcon={<ShieldCheck />}>
            Send report
          </Button>
          <p className="max-w-[60ch] text-caption text-fg-subtle">A person reads every report and triages it within 24 hours. Reporting is free, needs no account and never changes your own account.</p>
        </div>
      </form>
    </GlassCard>
  );
}
