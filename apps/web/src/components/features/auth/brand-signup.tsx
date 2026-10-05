"use client";

import { useState } from "react";
import Link from "next/link";
import { Apple, BadgeCheck, Briefcase, Building2, CircleAlert, Gauge, Lock, Mail, User } from "lucide-react";
import type { AuthProvider } from "@/lib/contract/types";
import { CONSTANTS, planBreakEven } from "@/lib/engine";
import { formatHours, formatMoney, formatPct } from "@/lib/format";
import { track } from "@/lib/analytics";
import { actions } from "@/lib/store";
import { useSession } from "@/lib/session/use-session";
import { GlassCard } from "@/components/glass/glass";
import { Button, Callout, Field, Input, RadioGroup, RadioGroupItem, Select, notify } from "@/components/ui";
import type { AuthSnapshot } from "./auth-data";
import { AuthHeading, Bullet, DemoNote, FormAnnouncer, OrDivider } from "./auth-parts";
import { brandSignupSchema, type UaBandValue } from "./schemas";
import { useZodForm } from "./use-zod-form";

const INITIAL = { name: "", email: "", company: "", role: "", uaBand: "" };

const ROLES = [
  { value: "Founder or CEO", label: "Founder or CEO" },
  { value: "Growth lead", label: "Growth lead" },
  { value: "User acquisition manager", label: "User acquisition manager" },
  { value: "Marketing manager", label: "Marketing manager" },
  { value: "Creator partnerships", label: "Creator partnerships" },
  { value: "Agency or consultant", label: "Agency or consultant" },
  { value: "Other", label: "Other" },
] as const;

const BANDS: ReadonlyArray<{ value: UaBandValue; label: string }> = [
  { value: "under_5k", label: "Under $5K" },
  { value: "5k_25k", label: "$5K to $25K" },
  { value: "25k_100k", label: "$25K to $100K" },
  { value: "over_100k", label: "Over $100K" },
];

/** The one-line plan advice for a spend band: what the Free plan costs, and the real break-even where a paid plan starts to win. Never a sales push. */
function planAdvice(band: UaBandValue | ""): string {
  const free = `Free is 12% of bounty spend with no monthly fee, and your first bounty has the fee waived.`;
  const proFrom = formatMoney(planBreakEven("free", "pro") ?? 0, { cents: "never" });
  const scaleFrom = formatMoney(planBreakEven("pro", "scale") ?? 0, { cents: "never" });
  if (band === "") return `${free} Pick a range and we will say when a paid plan starts to pay for itself.`;
  if (band === "under_5k") return `${free} At your size Free is the right plan.`;
  if (band === "5k_25k") return `${free} Pro (${formatMoney(CONSTANTS.plans.pro.price_cents_month, { cents: "never" })} a month, 10%) pays for itself above about ${proFrom} a month in bounty spend, so start on Free.`;
  if (band === "25k_100k") return `${free} Pro pays for itself above about ${proFrom} a month in bounty spend, and Scale (8%) beats Pro above ${scaleFrom}. You can switch any month.`;
  return `${free} At this volume Scale (8%, ${formatMoney(CONSTANTS.plans.scale.price_cents_month, { cents: "never" })} a month) beats Pro above ${scaleFrom} and adds agency workspaces, roles and a finance pack.`;
}

export function BrandSignup({ snapshot }: { snapshot: AuthSnapshot }) {
  const { signIn } = useSession();
  const [provider, setProvider] = useState<AuthProvider>("email");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);

  const form = useZodForm(brandSignupSchema, INITIAL, {
    idPrefix: "brand-signup",
    order: ["name", "email", "company", "role", "uaBand"],
    labels: { name: "Name", email: "Work email", company: "Company", role: "Role", uaBand: "Monthly spend" },
  });

  const fillFrom = (which: "apple"): void => {
    setProvider(which);
    form.set("name", "Jamie Okoye");
    form.set("email", "jamie.okoye@privaterelay.example");
    notify.info("Apple sign-in (demo)", { description: "In production Apple's own sheet opens here. We filled in a sample name and email you can change." });
  };

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setProblem(null);
    const result = await actions.signUpBrand({
      email: values.email,
      name: values.name,
      company: values.company,
      job_title: values.role,
      ua_band: values.uaBand as UaBandValue,
      provider,
    });
    if (!result.ok) {
      setBusy(false);
      const { code, message, hint } = result.error;
      if (code.startsWith("email")) form.setError("email", hint ? `${message} ${hint}` : message);
      else if (code.startsWith("company")) form.setError("company", message);
      else setProblem({ message, hint });
      return;
    }
    track("signup_completed", { role: "brand", provider, plan: "free" });
    notify.success(`${result.data.brand.name} is ready`, { description: "Free plan, first bounty fee waived. Next: connect your app." });
    signIn("brand", { redirectTo: result.data.next_path });
  });

  const advice = planAdvice(form.values.uaBand as UaBandValue | "");

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:content-start">
      <AuthHeading
        id="brand-signup-title"
        className="lg:col-start-1 lg:row-start-1"
        eyebrow="Create a brand workspace"
        title={
          <>
            Fund the videos that <span className="fd-gradient-text">move installs.</span>
          </>
        }
        description="Set a rate, escrow the pool, and pay only for the views, installs and trials that clear. Connect your app, fund a first bounty and creators can start the same day."
      />

      <div className="order-3 grid content-start gap-8 lg:col-start-1 lg:row-start-2">
        <ul className="grid gap-6">
          <Bullet icon={<Lock />} title="Funded or not live" tone="info">
            A bounty goes live only when the whole pool is in escrow. Approved videos are paid even if the pool runs out.
          </Bullet>
          <Bullet icon={<Gauge />} title="Decisions in 72 hours, with a reason" tone="accent">
            A review deadline on every submission, timecoded feedback, and a public Scorecard so creators know how you treat them.
          </Bullet>
          <Bullet icon={<BadgeCheck />} title="Your first bounty is on us" tone="mint">
            The platform fee is waived and flowd matches up to {formatMoney(CONSTANTS.fees.matched_first_bounty_cap_cents, { cents: "never" })} of the pool.
          </Bullet>
        </ul>
        <p className="max-w-[52ch] rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <span className="font-semibold text-fg">Median decision time: {formatHours(snapshot.trust.medianDecisionHours)}.</span> {formatPct(snapshot.trust.fundedLiveRatio, 0)} of live bounties were fully funded at go-live. Creators in the market reach their first dollar in a median of {Math.round(snapshot.trust.firstDollarMedianHours)} hours.
        </p>
      </div>

      <GlassCard padding="lg" className="order-2 grid content-start gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Button variant="secondary" size="lg" leadingIcon={<Apple />} onClick={() => fillFrom("apple")} disabled={busy}>
          Continue with Apple
        </Button>
        <OrDivider>or sign up with your work email</OrDivider>

        <form onSubmit={submit} noValidate className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={form.fieldId("name")} label="Your name" error={form.errors.name}>
              <Input
                autoComplete="name"
                placeholder="Jordan Ellis"
                leading={<User />}
                value={form.values.name}
                onChange={(event) => form.set("name", event.target.value)}
                onBlur={() => form.blur("name")}
              />
            </Field>
            <Field id={form.fieldId("email")} label="Work email" error={form.errors.email}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@yourapp.com"
                leading={<Mail />}
                value={form.values.email}
                onChange={(event) => form.set("email", event.target.value)}
                onBlur={() => form.blur("email")}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={form.fieldId("company")} label="Company or app" error={form.errors.company}>
              <Input
                autoComplete="organization"
                placeholder="Lumi"
                leading={<Building2 />}
                value={form.values.company}
                onChange={(event) => form.set("company", event.target.value)}
                onBlur={() => form.blur("company")}
              />
            </Field>
            <Field id={form.fieldId("role")} label="Your role" error={form.errors.role}>
              <Select
                options={ROLES}
                placeholder="Pick one"
                leading={<Briefcase />}
                value={form.values.role}
                onValueChange={(value) => form.set("role", value)}
              />
            </Field>
          </div>

          <fieldset className="grid gap-2.5" aria-describedby="brand-signup-band-help">
            <legend className="text-caption font-semibold text-fg-muted">Monthly spend on user acquisition</legend>
            <RadioGroup
              aria-label="Monthly spend on user acquisition"
              value={form.values.uaBand}
              onValueChange={(value) => form.set("uaBand", value)}
              className="grid gap-2 min-[480px]:grid-cols-2"
            >
              {BANDS.map((band, index) => (
                <RadioGroupItem key={band.value} id={index === 0 ? form.fieldId("uaBand") : undefined} value={band.value} label={band.label} variant="card" />
              ))}
            </RadioGroup>
            {form.errors.uaBand ? (
              <p className="flex items-start gap-1.5 text-caption font-medium text-rose">
                <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
                <span>{form.errors.uaBand}</span>
              </p>
            ) : null}
            <p id="brand-signup-band-help" aria-live="polite" className="text-caption text-fg-subtle">
              {advice}
            </p>
          </fieldset>

          <FormAnnouncer message={form.summary} />
          {problem ? (
            <Callout tone="rose" role="alert" title={problem.message}>
              {problem.hint}
            </Callout>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Create my workspace
          </Button>
          <p className="text-center text-caption text-fg-subtle">
            By continuing you agree to the{" "}
            <Link href="/legal/brand-terms" className="font-semibold text-accent underline underline-offset-4">
              brand terms
            </Link>{" "}
            and the{" "}
            <Link href="/legal/privacy" className="font-semibold text-accent underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>
          <p className="text-center text-body-sm text-fg-muted">
            Already have a workspace?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
        <DemoNote>Demo: this creates a brand workspace inside this browser, on the Free plan with an empty wallet. Nothing is sent anywhere.</DemoNote>
      </GlassCard>
    </div>
  );
}
