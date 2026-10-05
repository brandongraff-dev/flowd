"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleCheck, CircleX, Clock, FlaskConical, LifeBuoy, LoaderCircle, ShieldAlert, ShieldCheck, ShieldQuestion, type LucideIcon } from "lucide-react";
import type { VerificationReason, VerificationStatus } from "@/lib/contract/types";
import { VERIFICATION_REASON_META } from "@/lib/contract/types";
import { formatClockEta } from "@/lib/format";
import { useSelect, useStoreReady } from "@/lib/data";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { RoleGate } from "@/components/shell/role-gate";
import { Badge, Button, Callout, Field, Progress, SegmentedControl, Select, Skeleton, SkeletonGroup, buttonVariants, notify, type Tone } from "@/components/ui";
import { AuthHeading, DemoNote } from "./auth-parts";
import { selectMyVerification, type VerifySubject } from "./verify-data";

type Outcome = "verified" | "pending" | "rejected";
type Phase = "idle" | "processing";

interface Check {
  id: string;
  label: string;
}

const CHECKS: Record<VerifySubject, readonly Check[]> = {
  creator: [
    { id: "document", label: "Photo ID" },
    { id: "selfie", label: "Selfie matches the ID" },
    { id: "age", label: "Age: 18 or older" },
  ],
  brand: [
    { id: "registration", label: "Business registration" },
    { id: "domain", label: "You control the domain" },
    { id: "contact", label: "A contact person" },
  ],
};

/** Which check a failure reason belongs to, so the list can show what passed before it and what never ran. */
const FAILED_AT: Record<VerifySubject, Partial<Record<VerificationReason, number>>> = {
  creator: { document_unreadable: 0, name_mismatch: 0, selfie_mismatch: 1, underage: 2, other: 0 },
  brand: { business_not_found: 0, document_unreadable: 0, name_mismatch: 0, other: 2 },
};

/** What to do about each reason, in plain words. */
const FIX: Partial<Record<VerificationReason, string>> = {
  document_unreadable: "We could not read the document. Retake the photo in good light with all four corners in view.",
  name_mismatch: "The name on the document does not match your account. Update your name, or use a document that matches it.",
  selfie_mismatch: "The selfie did not match the photo on the ID. Retake it facing the camera, with no hat or sunglasses.",
  underage: "flowd creators must be 18 or older, so this account cannot be verified. Nothing else about your account changes.",
  business_not_found: "We could not find a registration for that business name. Check the legal name and country, or send a certificate to our team.",
  other: "A person will explain by email. Reply to it and we will pick this up from there.",
};

const REASONS: Record<VerifySubject, readonly VerificationReason[]> = {
  creator: ["document_unreadable", "selfie_mismatch", "name_mismatch", "underage"],
  brand: ["business_not_found", "document_unreadable", "name_mismatch", "other"],
};

interface StateMeta {
  tone: Tone;
  badge: string;
  Icon: LucideIcon;
}

const STATE: Record<VerificationStatus, StateMeta> = {
  not_started: { tone: "neutral", badge: "Not started", Icon: ShieldQuestion },
  pending: { tone: "info", badge: "With a person", Icon: Clock },
  needs_info: { tone: "ember", badge: "More info needed", Icon: ShieldAlert },
  verified: { tone: "mint", badge: "Verified", Icon: ShieldCheck },
  rejected: { tone: "rose", badge: "Could not verify", Icon: CircleX },
  expired: { tone: "ember", badge: "Expired", Icon: ShieldAlert },
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

export function VerifyView({ kind }: { kind: VerifySubject }) {
  return (
    <RoleGate allow={kind === "brand" ? "brand_member" : "creator"} signedOut="screen" layout="inline">
      <VerifyBody kind={kind} />
    </RoleGate>
  );
}

function VerifyBody({ kind }: { kind: VerifySubject }) {
  const ready = useStoreReady();
  const mine = useSelect(selectMyVerification);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>("verified");
  const [reason, setReason] = useState<VerificationReason>(REASONS[kind][0] ?? "document_unreadable");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const checks = CHECKS[kind];
  const status: VerificationStatus = phase === "processing" ? "not_started" : mine.status;
  const meta = STATE[status];
  const failedAt = mine.reason ? (FAILED_AT[kind][mine.reason] ?? 0) : -1;
  const canRetry = status === "rejected" && mine.reason !== "underage";

  const start = async (): Promise<void> => {
    setPhase("processing");
    setStep(0);
    // The mock provider "reads" each check in turn. A real provider answers asynchronously, so the wait is part of the honest picture.
    for (let index = 0; index < checks.length; index += 1) {
      await wait(750);
      if (!alive.current) return;
      setStep(index + 1);
    }
    await wait(350);
    const result = await actions.submitVerification({ kind: kind === "creator" ? "identity" : "business", outcome, ...(outcome === "rejected" ? { reason } : {}) });
    if (!alive.current) return;
    setPhase("idle");
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    if (result.data.status === "verified") notify.success(kind === "creator" ? "You are verified" : "Your business is verified", { description: kind === "creator" ? "Payouts are no longer held for identity." : "Your bounties now show the Verified badge." });
  };

  if (!ready) {
    return (
      <SkeletonGroup label="Loading your verification" className="mx-auto grid w-full max-w-[1000px] gap-8">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-72 w-full rounded-[28px]" />
      </SkeletonGroup>
    );
  }

  const title =
    status === "verified"
      ? kind === "creator"
        ? "You are verified"
        : "Your business is verified"
      : status === "pending"
        ? "A person is looking at it"
        : status === "rejected"
          ? kind === "creator"
            ? "We could not verify you"
            : "We could not verify the business"
          : status === "needs_info"
            ? "We need a little more"
            : kind === "creator"
              ? "Verify your ID"
              : "Verify your business";

  const description =
    phase === "processing"
      ? "Checking now. This takes a few seconds in the demo; a real check usually decides within a minute."
      : status === "verified"
        ? kind === "creator"
          ? "Your identity and age are confirmed. Money you have earned is no longer held for identity, and your next weekly payout can go out."
          : "Creators now see the Verified badge on your bounties and your public Scorecard."
        : status === "pending"
          ? `Most checks decide at once. Yours needs a person, who reads it within 24 hours${mine.latest ? ` (by ${formatClockEta(mine.latest.sla_due_at)})` : ""}. We will tell you the moment it is decided.`
          : status === "rejected"
            ? (FIX[mine.reason ?? "other"] ?? FIX.other ?? "")
            : status === "needs_info"
              ? (mine.latest?.note ?? "Check your notifications for what we need, then resubmit. A person reads it within 24 hours.")
              : kind === "creator"
                ? "We check once, just before your first payout: a photo ID, a selfie and your age. It takes about two minutes. Until then you can keep making videos and earning; payouts wait."
                : "We confirm your company is real so creators can trust your bounties. We check the registration and that you control the domain.";

  return (
    <div className="mx-auto grid w-full max-w-[1000px] gap-8">
      <AuthHeading
        id="verify-title"
        eyebrow={kind === "creator" ? "Identity check" : "Business verification"}
        title={title}
        description={kind === "creator" ? "Just in time, never up front: nothing here blocks you from making videos." : "A verified brand is easier to trust, and creators filter for it."}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <GlassCard padding="lg" className="grid content-start gap-7" aria-live="polite" aria-busy={phase === "processing" || undefined}>
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-16 shrink-0 place-items-center rounded-[22px] [&_svg]:size-8 [&_svg]:stroke-[1.6]",
                status === "verified" && "bg-mint-soft text-mint",
                status === "rejected" && "bg-rose-soft text-rose",
                status === "pending" && "bg-info-soft text-info",
                (status === "needs_info" || status === "expired") && "bg-ember-soft text-ember",
                status === "not_started" && "bg-accent-soft text-accent",
              )}
            >
              {phase === "processing" ? <LoaderCircle className="fd-spinner" /> : <meta.Icon />}
            </span>
            <div className="grid gap-1.5 pt-1">
              <Badge tone={phase === "processing" ? "accent" : meta.tone} size="lg" className="w-fit">
                {phase === "processing" ? "Checking" : meta.badge}
              </Badge>
              <p className="max-w-[52ch] text-body text-fg-muted">{description}</p>
            </div>
          </div>

          {phase === "processing" ? <Progress value={Math.round((step / checks.length) * 100)} tone="flow" aria-label="Verification progress" valueText={`${step} of ${checks.length} checks done`} /> : null}

          <ol aria-label="Checks" className="grid gap-2.5">
            {checks.map((check, index) => {
              const state: "done" | "active" | "failed" | "todo" =
                phase === "processing"
                  ? index < step
                    ? "done"
                    : index === step
                      ? "active"
                      : "todo"
                  : status === "verified"
                    ? "done"
                    : status === "rejected"
                      ? index < failedAt
                        ? "done"
                        : index === failedAt
                          ? "failed"
                          : "todo"
                      : status === "pending"
                        ? "done"
                        : "todo";
              return (
                <li key={check.id} className="flex items-center gap-3 rounded-2xl bg-surface-field px-4 py-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                  <span
                    aria-hidden="true"
                    className={cn("grid size-6 shrink-0 place-items-center [&_svg]:size-5", state === "done" && "text-mint", state === "failed" && "text-rose", state === "active" && "text-accent", state === "todo" && "text-fg-subtle")}
                  >
                    {state === "done" ? <CircleCheck strokeWidth={2} /> : state === "failed" ? <CircleX strokeWidth={2} /> : state === "active" ? <LoaderCircle className="fd-spinner" strokeWidth={2} /> : <span className="size-3 rounded-full border-2 border-current" />}
                  </span>
                  <span className="text-body-sm font-medium text-fg">{check.label}</span>
                  <span className="ml-auto text-caption text-fg-subtle">{state === "done" ? (status === "pending" && phase !== "processing" ? "Sent" : "Passed") : state === "failed" ? "Did not pass" : state === "active" ? "Checking" : status === "rejected" ? "Not run" : "Waiting"}</span>
                </li>
              );
            })}
          </ol>

          {status === "rejected" && mine.reason ? (
            <Callout tone="rose" role="alert" title={VERIFICATION_REASON_META[mine.reason].label}>
              {FIX[mine.reason]} {mine.reason !== "underage" ? "Nothing is lost: payouts wait until you are verified, and everything else keeps working." : null}
            </Callout>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {status === "not_started" || canRetry || status === "needs_info" || status === "expired" ? (
              <Button variant="primary" size="lg" loading={phase === "processing"} onClick={() => void start()} trailingIcon={<ArrowRight />}>
                {status === "not_started" ? "Start verification" : "Try again"}
              </Button>
            ) : null}
            {status === "verified" ? (
              <Link href={kind === "creator" ? "/creator" : "/brand"} className={buttonVariants({ variant: "primary", size: "lg" })}>
                {kind === "creator" ? "Back to your home" : "Back to your overview"}
              </Link>
            ) : null}
            <Link href="/help#contact" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              <LifeBuoy aria-hidden="true" />
              Talk to a person
            </Link>
          </div>
        </GlassCard>

        <div className="grid content-start gap-5">
          <GlassCard padding="md" className="grid gap-3">
            <p className="fd-eyebrow text-fg-subtle">What happens</p>
            <ul className="grid gap-3 text-body-sm text-fg-muted">
              <li className="flex gap-2.5">
                <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} />
                <span>{kind === "creator" ? "You are asked once, before your first payout. Not at sign-up." : "You are asked once, before your first bounty goes live."}</span>
              </li>
              <li className="flex gap-2.5">
                <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} />
                <span>Most checks decide at once. When they cannot, a person reads yours within 24 hours.</span>
              </li>
              <li className="flex gap-2.5">
                <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2} />
                <span>{kind === "creator" ? "If it fails you get the reason and what to fix. Money you earned waits, safe, until you pass." : "If it fails you get the reason and what to fix. Your drafts and your wallet are untouched."}</span>
              </li>
            </ul>
          </GlassCard>

          {status === "not_started" || canRetry ? (
            <GlassCard padding="md" className="grid gap-4">
              <div className="flex items-center gap-2 text-fg-muted">
                <FlaskConical aria-hidden="true" className="size-4" strokeWidth={1.75} />
                <p className="fd-eyebrow">Demo controls</p>
              </div>
              <p className="text-caption text-fg-subtle">A mock provider decides here. Choose what it should answer, then start the check.</p>
              <SegmentedControl<Outcome>
                aria-label="What the mock provider answers"
                size="sm"
                fullWidth
                value={outcome}
                onValueChange={setOutcome}
                options={[
                  { value: "verified", label: "Verifies" },
                  { value: "pending", label: "Needs a person" },
                  { value: "rejected", label: "Fails" },
                ]}
              />
              {outcome === "rejected" ? (
                <Field label="Reason it fails">
                  <Select
                    size="sm"
                    value={reason}
                    onValueChange={(value) => setReason(value as VerificationReason)}
                    options={REASONS[kind].map((value) => ({ value, label: VERIFICATION_REASON_META[value].label }))}
                  />
                </Field>
              ) : null}
            </GlassCard>
          ) : null}
          <DemoNote>Demo: no document is read or stored. In production an identity partner runs these checks.</DemoNote>
        </div>
      </div>
    </div>
  );
}
