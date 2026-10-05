"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Mail, Share2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoreReady, useWaitlist } from "@/lib/data";
import { actions } from "@/lib/store";
import { WAITLIST_JUMP_PER_INVITE } from "@/lib/engine";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { CopyButton, CopyField } from "@/components/ui/copy-button";
import { CountUp } from "@/components/ui/count-up";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { DemoTag } from "@/components/shell/demo-banner";

type Role = "creator" | "brand";

const ordinal = (n: number): string => `#${n.toLocaleString("en-US")}`;

interface Errors {
  email?: string;
  handle?: string;
  form?: string;
}

/** The place in line, the referral link, the invite counter and the position-based perks, once someone has joined. */
function Confirmed() {
  const wl = useWaitlist();
  const visitor = wl.visitor;
  if (!visitor) return null;
  const link = `https://${visitor.referral_link.replace(/^https?:\/\//, "")}`;
  const message = `Join me on the flowd waitlist: ${link}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const perks = [
    { label: "Invites go out in position order", met: true, detail: "The lower your number, the earlier your invite." },
    { label: "Positions 1 to 200: a fast lane to the founding creators", met: visitor.position <= 200, detail: "A badge, a tier head start and free instant payouts for a year. A person still reads every application." },
  ];

  return (
    <GlassCard padding="none" className="grid gap-0 overflow-hidden rounded-[32px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid content-start gap-4 p-6 sm:p-8" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge tone="mint" size="lg" icon={<Check />}>
            You&apos;re on the list
          </Badge>
          <DemoTag>Demo data</DemoTag>
        </div>
        <p className="text-caption font-medium text-fg-muted">Your place in line</p>
        <p className="font-display text-figure-hero text-fg tabular-nums">
          <CountUp value={visitor.position} animateOnMount format={ordinal} />
        </p>
        <p className="text-body-sm text-fg-muted">
          of {wl.total.toLocaleString("en-US")} on the list as a {visitor.role === "creator" ? "creator" : "brand"}
          {visitor.handle ? ` (@${visitor.handle})` : ""}. Every friend who joins with your link moves you up {WAITLIST_JUMP_PER_INVITE} places.
        </p>
        <dl className="grid grid-cols-2 gap-3">
          <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <dt className="text-caption font-medium text-fg-muted">Friends who joined</dt>
            <dd className="font-display text-figure-lg text-fg tabular-nums">{visitor.referrals}</dd>
          </div>
          <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <dt className="text-caption font-medium text-fg-muted">Invites accepted on flowd</dt>
            <dd className="font-display text-figure-lg text-fg tabular-nums">{wl.totals.invites_accepted.toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </div>

      <div className="grid content-start gap-5 border-t border-divider bg-surface-field/50 p-6 sm:p-8 lg:border-t-0 lg:border-l">
        <div className="grid gap-2">
          <p className="text-body-sm font-semibold text-fg">Your invite link</p>
          <CopyField aria-label="Your invite link" value={link} label="Copy link" copiedLabel="Link copied" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={message} label="Copy message" copiedLabel="Message copied" variant="secondary" size="md" />
          {canShare ? (
            <Button variant="secondary" leadingIcon={<Share2 />} onClick={() => void navigator.share({ title: "flowd", text: "Join me on the flowd waitlist.", url: link }).catch(() => undefined)}>
              Share
            </Button>
          ) : null}
          <a href={`mailto:?subject=${encodeURIComponent("Join me on flowd")}&body=${encodeURIComponent(message)}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <Mail aria-hidden="true" />
            Email a friend
          </a>
        </div>
        <ul className="grid gap-2.5">
          {perks.map((perk) => (
            <li key={perk.label} className={cn("flex items-start gap-3 rounded-2xl p-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]", perk.met ? "bg-mint-soft" : "bg-surface-field")}>
              <span aria-hidden="true" className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", perk.met ? "bg-mint-solid text-on-mint" : "bg-surface-active text-fg-subtle")}>
                {perk.met ? <Check className="size-3.5" strokeWidth={3} /> : <Users className="size-3" strokeWidth={2} />}
              </span>
              <span className="grid gap-0.5">
                <span className="text-body-sm font-semibold text-fg">
                  {perk.label}
                  <span className="sr-only">{perk.met ? ". You qualify." : ". You do not qualify yet."}</span>
                </span>
                <span className="text-caption text-fg-muted">{perk.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-caption text-fg-subtle">
          Applying as a creator?{" "}
          <Link href="/founding-creators" className="text-accent underline underline-offset-2">
            See the founding programme
          </Link>
          .
        </p>
      </div>
    </GlassCard>
  );
}

/**
 * The ranked waitlist. A visitor picks a role, gives an email (and a handle if they are a creator) and joins through the same store action the product uses;
 * the page then reads their place back from the store, so it survives a reload. Position is join order, each accepted invite moves you up 25 places, and perks depend
 * on position and are funded by flowd, never drawn by chance.
 */
export function WaitlistExperience() {
  const ready = useStoreReady();
  const wl = useWaitlist();
  const [role, setRole] = useState<Role>("creator");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the waitlist" className="grid gap-4">
        <Skeleton className="h-72 rounded-[32px]" />
      </SkeletonGroup>
    );
  }
  if (wl.visitor) return <Confirmed />;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await actions.joinWaitlist({ email, role, ...(role === "creator" && handle.trim() ? { handle } : {}) });
    setBusy(false);
    if (!result.ok) {
      const { code, message, hint } = result.error;
      const text = hint ? `${message} ${hint}` : message;
      setErrors(code === "email_invalid" ? { email: text } : code === "handle_invalid" ? { handle: text } : { form: text });
      return;
    }
    notify.success(`You're ${ordinal(result.data.position)} on the list`, { description: "Every friend who joins with your link moves you up." });
  };

  return (
    <GlassCard padding="none" className="grid overflow-hidden rounded-[32px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="grid content-start gap-5 p-6 sm:p-8">
        <div className="grid gap-1.5">
          <h3 className="text-title-lg text-fg">Get in line.</h3>
          <p className="text-body-sm text-fg-muted">
            {wl.total.toLocaleString("en-US")} people are on the list. Joining takes ten seconds and costs nothing.
          </p>
        </div>

        <div className="grid gap-2">
          <span id="waitlist-role" className="text-caption font-semibold text-fg-muted">
            I am joining as
          </span>
          <SegmentedControl<Role>
            aria-label="Joining as"
            value={role}
            onValueChange={setRole}
            fullWidth
            options={[
              { value: "creator", label: "A creator" },
              { value: "brand", label: "An app team" },
            ]}
          />
        </div>

        <Field label="Email" error={errors.email} required>
          <Input type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>

        {role === "creator" ? (
          <Field label="Handle" optional hint="Your TikTok, Instagram or YouTube handle." error={errors.handle}>
            <Input name="handle" autoComplete="username" leading="@" placeholder="your.handle" value={handle} onChange={(event) => setHandle(event.target.value)} />
          </Field>
        ) : null}

        {errors.form ? (
          <p role="alert" className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-caption font-medium text-rose">
            {errors.form}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          Join the waitlist
        </Button>
        <p className="text-caption text-fg-subtle">
          No purchase or payment. In this demo we keep only a masked version of your address, in this browser. By joining you agree to the{" "}
          <Link href="/legal/privacy" className="text-accent underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </form>

      <div className="grid content-start gap-4 border-t border-divider bg-surface-field/50 p-6 sm:p-8 lg:border-t-0 lg:border-l">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-title-sm text-fg">Who is at the front</h3>
          <DemoTag>Demo data</DemoTag>
        </div>
        <ol className="grid gap-2">
          {wl.leaders.slice(0, 5).map((leader) => (
            <li key={leader.handle} className="flex items-center gap-3 rounded-2xl bg-surface-field px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <span className="w-8 shrink-0 font-display text-body-sm font-bold text-fg-subtle tabular-nums">{leader.position}</span>
              <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg">@{leader.handle}</span>
              <Badge size="sm" tone="neutral" variant="outline">
                {leader.kind === "creator" ? "Creator" : "Brand"}
              </Badge>
              <span className="text-caption text-fg-muted tabular-nums">{leader.referrals} invited</span>
            </li>
          ))}
        </ol>
        <p className="text-caption text-fg-subtle">The top referrers, by friends who joined with their link. Handles are fictional in the demo.</p>
      </div>
    </GlassCard>
  );
}
