"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BadgeCheck, Check, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFoundingSpots, useStoreReady, useWaitlist } from "@/lib/data";
import { actions } from "@/lib/store";
import { CONSTANTS } from "@/lib/engine";
import { NICHES, NICHE_META, type Niche } from "@/lib/contract/types";
import { ArtAvatar } from "@/components/brand/avatar";
import { Logo } from "@/components/brand/logo";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { DemoTag } from "@/components/shell/demo-banner";

/** The founding badge: a flat tile with the flat logo mark and a sun ring. The mark itself stays flat, as the logo rules require. */
export function FoundingBadge({ size = 120 }: { size?: number }) {
  return (
    <span
      role="img"
      aria-label="Founding creator badge"
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-[var(--fd-abyss-950)]"
      style={{ width: size, height: size, boxShadow: "inset 0 0 0 3px var(--fd-sun-500), inset 0 0 0 7px var(--fd-abyss-950), inset 0 0 0 8px color-mix(in oklab, var(--fd-sun-400) 60%, transparent), 0 14px 40px -12px color-mix(in oklab, var(--fd-sun-500) 55%, transparent)" }}
    >
      <Logo variant="mark" tone="on-dark" height={Math.round(size * 0.46)} decorative />
      <span className="absolute -bottom-2 rounded-pill bg-sun-solid px-2.5 py-0.5 font-display text-micro font-bold text-on-sun tabular-nums">200</span>
    </span>
  );
}

/** The true count of the 200 founding places, read from the same store the application writes to. */
export function FoundingCounter() {
  const ready = useStoreReady();
  const spots = useFoundingSpots();
  if (!ready) {
    return (
      <SkeletonGroup label="Loading the founding places" className="grid gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-3 w-full" />
      </SkeletonGroup>
    );
  }
  const pct = spots.total > 0 ? (spots.taken / spots.total) * 100 : 0;
  return (
    <div className="grid gap-3" aria-live="polite">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-figure-xl text-fg tabular-nums">{spots.left}</span>
        <span className="text-body text-fg-muted">
          of {spots.total} places left <DemoTag>Demo data</DemoTag>
        </span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-pill bg-surface-active" role="img" aria-label={`${spots.taken} of ${spots.total} places taken`}>
        <span className="block h-full rounded-pill bg-sun-solid" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-caption text-fg-subtle">A real count: it goes down when a creator is accepted, and up if a place frees up. No countdown, no fake scarcity.</p>
      {spots.creators.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Some founding creators">
          {spots.creators.slice(0, 8).map((creator) => (
            <li key={creator.id}>
              <ArtAvatar art={creator.avatar} name={`@${creator.handle}`} size={36} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const PERKS = [
  { icon: BadgeCheck, title: "The Founding badge", body: "On your profile and every earnings card, for good. It is not a tier and it does not change what a bounty pays." },
  { icon: Zap, title: "A tier head start", body: "A head start toward your tier: what you do in the founding programme carries over, so you reach the first tiers sooner." },
  { icon: Clock, title: `${CONSTANTS.founding.free_instant_months} months of free instant cash-out`, body: "Normally 1.5% (minimum $0.50, maximum $15). For a year it is free, with the weekly payout free as always." },
] as const;

export function FoundingPerks() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {PERKS.map((perk) => (
        <li key={perk.title}>
          <GlassCard padding="lg" className="grid h-full content-start gap-3 rounded-[28px]">
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-sun-soft text-sun [&_svg]:size-5 [&_svg]:stroke-[1.75]">
              <perk.icon />
            </span>
            <h3 className="text-title-sm text-fg">{perk.title}</h3>
            <p className="text-body-sm text-pretty text-fg-muted">{perk.body}</p>
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}

interface Errors {
  handle?: string;
  niche?: string;
  proof?: string;
  form?: string;
}

const NICHE_OPTIONS = NICHES.map((niche: Niche) => ({ value: niche, label: NICHE_META[niche].label }));

/**
 * The application: a handle, a niche and a link to work you have already made. It goes through the store action the product uses, which validates each field
 * and refuses a second application, and the page reads the outcome back, so a submitted application is still there after a reload.
 */
export function FoundingApplication() {
  const ready = useStoreReady();
  const wl = useWaitlist();
  const spots = useFoundingSpots();
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [proof, setProof] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the application" className="grid gap-3">
        <Skeleton className="h-80 rounded-[32px]" />
      </SkeletonGroup>
    );
  }

  const application = wl.founding_application;
  if (application) {
    return (
      <GlassCard padding="lg" className="grid gap-5 rounded-[32px]" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge tone="mint" size="lg" icon={<Check />}>
            Application received
          </Badge>
          <DemoTag>Demo data</DemoTag>
        </div>
        <h3 className="text-title-lg text-fg">Thanks, @{application.handle}.</h3>
        <p className="text-body text-pretty text-fg-muted">A person reads every application within 48 hours and replies by email. Your case id is below if you need to ask about it.</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["Case id", application.case_id],
            ["Status", "In review"],
            ["Places left", String(spots.left)],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <dt className="text-caption font-medium text-fg-muted">{label}</dt>
              <dd className={cn("text-body font-semibold text-fg", label === "Case id" && "font-mono text-code tabular-nums")}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-fg-subtle">Acceptance is not guaranteed, and being accepted is not a promise of earnings or of approval on any bounty.</p>
      </GlassCard>
    );
  }

  const full = spots.left <= 0;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await actions.applyFoundingCreator({ handle, niche, proof_url: proof });
    setBusy(false);
    if (!result.ok) {
      const { code, message, hint } = result.error;
      const text = hint ? `${message} ${hint}` : message;
      setErrors(code === "handle_invalid" ? { handle: text } : code === "niche_required" ? { niche: text } : code === "proof_invalid" ? { proof: text } : { form: text });
      return;
    }
    notify.success("Application received", { description: `Case ${result.data.application.case_id}. A person reads it within 48 hours.` });
  };

  return (
    <GlassCard padding="none" className="overflow-hidden rounded-[32px]">
      <form onSubmit={submit} noValidate className="grid gap-5 p-6 sm:p-8">
        <div className="grid gap-1.5">
          <h3 className="text-title-lg text-fg">Apply for a place.</h3>
          <p className="text-body-sm max-w-[56ch] text-fg-muted">Tell us where you post and show us work you have already made. There is no fee, and a person reads it.</p>
        </div>
        {full ? <p className="rounded-xl bg-sun-soft px-3.5 py-2.5 text-caption font-medium text-sun">All {spots.total} places are taken. Join the waitlist and we will tell you when the next group opens.</p> : null}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Your handle" required error={errors.handle} hint="The handle you post under.">
            <Input name="handle" autoComplete="username" leading="@" placeholder="your.handle" value={handle} onChange={(event) => setHandle(event.target.value)} />
          </Field>
          <Field label="Your niche" required error={errors.niche}>
            <Select options={NICHE_OPTIONS} value={niche} onValueChange={setNiche} placeholder="Pick one" aria-label="Your niche" />
          </Field>
        </div>
        <Field label="Proof of work" required error={errors.proof} hint="A link to videos you have already made: your channel, a portfolio or a folder. It must start with https://.">
          <Input type="url" name="proof" inputMode="url" autoComplete="url" placeholder="https://" value={proof} onChange={(event) => setProof(event.target.value)} />
        </Field>

        {errors.form ? (
          <p role="alert" className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-caption font-medium text-rose">
            {errors.form}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={full}>
            Send my application
          </Button>
          <p className="text-caption max-w-[52ch] text-fg-subtle">
            By applying you agree to the{" "}
            <Link href="/legal/creator-agreement" className="text-accent underline underline-offset-2">
              creator agreement
            </Link>{" "}
            and confirm you are 18 or over.
          </p>
        </div>
      </form>
    </GlassCard>
  );
}
