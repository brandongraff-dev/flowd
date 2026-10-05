"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Apple, AtSign, Check, Clock, Mail, ShieldCheck, User, Wallet, X } from "lucide-react";
import type { AuthProvider } from "@/lib/contract/types";
import { formatMoney } from "@/lib/format";
import { track } from "@/lib/analytics";
import { actions } from "@/lib/store";
import { useSession } from "@/lib/session/use-session";
import { GlassCard } from "@/components/glass/glass";
import { Button, Callout, Checkbox, Field, Input, notify } from "@/components/ui";
import type { AuthSnapshot } from "./auth-data";
import { AuthHeading, Bullet, DemoNote, FormAnnouncer, OrDivider } from "./auth-parts";
import { creatorSignupSchema } from "./schemas";
import { useZodForm } from "./use-zod-form";

const INITIAL = { name: "", email: "", handle: "", confirm18: false, agreement: false };

/** The sample identity a mock Apple or Google sign-in fills in. Fictional, and editable. */
const MOCK_IDENTITY: Record<Exclude<AuthProvider, "email">, { name: string; email: string }> = {
  apple: { name: "Alex Rivera", email: "alex.rivera@privaterelay.example" },
  google: { name: "Alex Rivera", email: "alex.rivera@example.com" },
};

const normaliseHandle = (raw: string): string => raw.toLowerCase().replace(/^@/, "").replace(/\s+/g, "");

/** What the agreement says, in five lines. The full text is `/legal/creator-agreement`; this is the part people actually need before they tick the box. */
const AGREEMENT_POINTS = [
  "You own your videos. A brand gets organic posting for the bounty, and paid-ad use only as a priced, dated term shown on the Rights Card before you submit.",
  "Money clears 72 hours after you post, once views are checked. flowd claws back only for proven fraud.",
  "Posts carry #ad and the brand's wording. Original work only: no burner accounts, and nobody can ask you to pay to join.",
  "You are 18 or older. Your ID and tax form are collected just in time, before your first payout.",
] as const;

export function CreatorSignup({ snapshot }: { snapshot: AuthSnapshot }) {
  const { signIn } = useSession();
  const taken = useMemo(() => new Set(snapshot.takenHandles), [snapshot.takenHandles]);
  const schema = useMemo(() => creatorSignupSchema(taken), [taken]);
  const [provider, setProvider] = useState<AuthProvider>("email");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);

  const form = useZodForm(schema, INITIAL, {
    idPrefix: "creator-signup",
    order: ["name", "email", "handle", "confirm18", "agreement"],
    labels: { name: "Name", email: "Email", handle: "Handle", confirm18: "18 or older", agreement: "Creator agreement" },
  });

  const fillFrom = (which: "apple" | "google"): void => {
    setProvider(which);
    form.set("name", MOCK_IDENTITY[which].name);
    form.set("email", MOCK_IDENTITY[which].email);
    notify.info(`${which === "apple" ? "Apple" : "Google"} sign-in (demo)`, { description: "In production their own sheet opens here. We filled in a sample name and email you can change." });
  };

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setProblem(null);
    const result = await actions.signUpCreator({
      email: values.email,
      display_name: values.name,
      handle: values.handle,
      provider,
      confirm_18: values.confirm18,
      accept_agreement: values.agreement,
    });
    if (!result.ok) {
      setBusy(false);
      const { code, message, hint } = result.error;
      if (code.startsWith("handle")) form.setError("handle", hint ? `${message} ${hint}` : message);
      else if (code.startsWith("email")) form.setError("email", hint ? `${message} ${hint}` : message);
      else setProblem({ message, hint });
      return;
    }
    track("signup_completed", { role: "creator", provider });
    notify.success(`Welcome, @${result.data.creator.handle}`, { description: "Three quick steps to your first dollar. It starts with your niches." });
    signIn("creator", { redirectTo: result.data.next_path });
  });

  const handle = form.values.handle;
  const handleOk = /^[a-z0-9._]{2,30}$/.test(handle) && !taken.has(handle);
  const handleTaken = taken.has(handle);

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:content-start">
      <AuthHeading
        id="creator-signup-title"
        className="lg:col-start-1 lg:row-start-1"
        eyebrow="Create a creator account"
        title={
          <>
            Get paid for <span className="fd-gradient-text">videos that work.</span>
          </>
        }
        description="Open bounties for app UGC, paid on verified views, installs and trials. Your first video takes about three minutes, and creators never pay to join."
      />

      <div className="order-3 grid content-start gap-8 lg:col-start-1 lg:row-start-2">
        <ul className="grid gap-6">
          <Bullet icon={<Clock />} title="First dollar in 72 hours" tone="accent">
            Make one video for a flowd-funded starter bounty: a flat $5, a decision within 24 hours, cleared within 48 hours of approval. Approval isn&apos;t guaranteed: your video has to meet the brief.
          </Bullet>
          <Bullet icon={<Wallet />} title="Every dollar has a date" tone="mint">
            Pending money shows the day it clears and why. The weekly payout is free; instant cash-out shows its fee before you confirm.
          </Bullet>
          <Bullet icon={<ShieldCheck />} title="Safe by design" tone="violet">
            In-app chat only, verified brands, and a Scam Shield report button on every bounty.
          </Bullet>
        </ul>
        <p className="max-w-[52ch] rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <span className="font-semibold text-fg">
            Typical creator, last {snapshot.median.period}: {formatMoney(snapshot.median.typical_cents)}
          </span>{" "}
          (middle half {formatMoney(snapshot.median.p25_cents)} to {formatMoney(snapshot.median.p75_cents)}). The top 10% earned {formatMoney(snapshot.median.top_decile_cents)}. Results vary and there is no guaranteed income.
        </p>
      </div>

      <GlassCard padding="lg" className="order-2 grid content-start gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" size="lg" leadingIcon={<Apple />} onClick={() => fillFrom("apple")} disabled={busy}>
            Continue with Apple
          </Button>
          <Button variant="secondary" size="lg" leadingIcon={<span aria-hidden="true" className="font-display text-[17px] leading-none font-extrabold">G</span>} onClick={() => fillFrom("google")} disabled={busy}>
            Continue with Google
          </Button>
        </div>
        <OrDivider>or sign up with email</OrDivider>

        <form onSubmit={submit} noValidate className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={form.fieldId("name")} label="Your name" error={form.errors.name}>
              <Input
                autoComplete="name"
                placeholder="Maya Reyes"
                leading={<User />}
                value={form.values.name}
                onChange={(event) => form.set("name", event.target.value)}
                onBlur={() => form.blur("name")}
              />
            </Field>
            <Field id={form.fieldId("email")} label="Email" error={form.errors.email}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                leading={<Mail />}
                value={form.values.email}
                onChange={(event) => form.set("email", event.target.value)}
                onBlur={() => form.blur("email")}
              />
            </Field>
          </div>

          <Field
            id={form.fieldId("handle")}
            label="Handle"
            error={form.errors.handle}
            hint={
              <span>
                Your public link: <span className="font-mono text-fg-muted">joinflowd.io/c/{handle || "yourhandle"}</span>
                {handleOk ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-mint">
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                    Available
                  </span>
                ) : null}
              </span>
            }
          >
            <Input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="maya.makes"
              leading={<AtSign />}
              trailing={
                handleOk ? (
                  <Check aria-hidden="true" className="text-mint" strokeWidth={2.5} />
                ) : handleTaken ? (
                  <X aria-hidden="true" className="text-rose" strokeWidth={2.5} />
                ) : null
              }
              value={handle}
              onChange={(event) => form.set("handle", normaliseHandle(event.target.value))}
              onBlur={() => form.blur("handle")}
            />
          </Field>

          <div className="grid gap-1 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="text-body-sm font-semibold text-fg">The creator agreement, in short</p>
            <ul className="mt-1 grid gap-2 text-caption text-fg-muted">
              {AGREEMENT_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-subtle" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link href="/legal/creator-agreement" className="mt-1 text-caption font-semibold text-accent underline underline-offset-4">
              Read the full agreement
            </Link>
          </div>

          <div className="grid gap-1">
            <Field id={form.fieldId("confirm18")} error={form.errors.confirm18}>
              <Checkbox
                label="I am 18 or older"
                description="flowd creators are adults. We check ID before your first payout, not now."
                checked={form.values.confirm18}
                onCheckedChange={(checked) => form.set("confirm18", checked === true)}
                onBlur={() => form.blur("confirm18")}
              />
            </Field>
            <Field id={form.fieldId("agreement")} error={form.errors.agreement}>
              <Checkbox
                label="I accept the creator agreement"
                description="And the terms of service and privacy policy it links to."
                checked={form.values.agreement}
                onCheckedChange={(checked) => form.set("agreement", checked === true)}
                onBlur={() => form.blur("agreement")}
              />
            </Field>
          </div>

          <FormAnnouncer message={form.summary} />
          {problem ? (
            <Callout tone="rose" role="alert" title={problem.message}>
              {problem.hint}
            </Callout>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Create my account
          </Button>
          <p className="text-center text-body-sm text-fg-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
        <DemoNote>Demo: this creates a creator account inside this browser. Nothing is sent anywhere, and Reset demo removes it.</DemoNote>
      </GlassCard>
    </div>
  );
}
