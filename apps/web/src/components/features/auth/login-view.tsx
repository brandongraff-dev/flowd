"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Apple, Building2, Lock, Mail, ShieldCheck, Video } from "lucide-react";
import type { Role } from "@/lib/contract/types";
import { PERSONA_LIST, PERSONA_TO_ROLE, ROLE_LABEL, postLoginTarget, type DemoPersona, type PersonaKey } from "@/lib/session";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { ArtAvatar } from "@/components/brand/avatar";
import { artFromName, type ArtSeed } from "@/components/brand/art";
import { Badge, Button, Callout, Field, Input, Spinner, buttonVariants, notify } from "@/components/ui";
import { AuthHeading, DemoNote, FormAnnouncer, OrDivider } from "./auth-parts";
import { loginSchema } from "./schemas";
import { useZodForm } from "./use-zod-form";

const ROLE_ICON: Record<PersonaKey, typeof Building2> = { brand: Building2, creator: Video, admin: ShieldCheck };

/** What each persona sees first, in the product's own words (the picker is a tour, so it names the places you will land). */
const SEES: Record<PersonaKey, readonly string[]> = {
  brand: ["Review queue", "Funnel to paid", "Escrow wallet"],
  creator: ["Daily Drop", "Money Clock", "Studio"],
  admin: ["Fraud queue", "Weekly payout", "90-day targets"],
};

type Pending = PersonaKey | "apple" | "email" | null;

export interface LoginViewProps {
  /** The personas' avatar art from the demo world (the picker falls back to a name-seeded avatar). */
  art?: Partial<Record<PersonaKey, ArtSeed | null>>;
  /** `?next=` from the guard that sent the visitor here. Checked again with `postLoginTarget`, which refuses anything off-site. */
  next?: string;
  /** Set when the visitor opened the picker on purpose while signed in (`?switch=1`). */
  signedInAs?: Role | null;
}

/**
 * The demo persona picker. Three cards, one click each: Jordan (a brand team at Lumi), Maya (a creator) and Sam (flowd Ops). Underneath, an
 * email and password form and a mock Sign in with Apple, for people who expect a normal sign-in; the demo has no passwords, so the form
 * matches the email to a persona and says so. Signing in sets the role cookie and sends the person to their home (or to `next`).
 */
export function LoginView({ next, signedInAs, art }: LoginViewProps) {
  const { signIn } = useSession();
  const [pending, setPending] = useState<Pending>(null);
  const busy = pending !== null;

  const enter = (key: PersonaKey, via: Pending): void => {
    if (busy) return;
    setPending(via ?? key);
    signIn(key, { redirectTo: postLoginTarget(PERSONA_TO_ROLE[key], next) });
  };

  const form = useZodForm(loginSchema, { email: "", password: "" }, { idPrefix: "login", order: ["email", "password"], labels: { email: "Email", password: "Password" } });
  const submit = form.handleSubmit((values) => {
    const match = PERSONA_LIST.find((persona) => persona.email.toLowerCase() === values.email.trim().toLowerCase());
    if (!match) {
      form.setError("email", "No demo account uses that address. Pick a persona above, or create an account.");
      return;
    }
    enter(match.key, "email");
  });

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-10">
      <AuthHeading
        id="login-title"
        eyebrow="Demo personas"
        title={
          <>
            Sign in to <span className="fd-gradient-text">flowd</span>
          </>
        }
        description="Pick who you want to be and walk the whole product. Every brand, creator and dollar here is fictional, and it lives only in this browser."
      />

      {signedInAs ? (
        <Callout tone="info" title={`You are signed in as ${ROLE_LABEL[signedInAs].toLowerCase()} ${PERSONA_LIST.find((persona) => PERSONA_TO_ROLE[persona.key] === signedInAs)?.firstName ?? ""}`.trim()}>
          Choosing another persona switches you over. Your changes in the demo are kept.
        </Callout>
      ) : null}

      <ul aria-label="Demo personas" className="grid gap-4 md:grid-cols-3">
        {PERSONA_LIST.map((persona) => (
          <PersonaCard key={persona.key} persona={persona} art={art?.[persona.key] ?? undefined} pending={pending} onChoose={() => enter(persona.key, persona.key)} />
        ))}
      </ul>

      <OrDivider>or sign in with an email</OrDivider>

      <GlassCard padding="lg" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-12">
        <form onSubmit={submit} noValidate className="grid gap-5" aria-describedby="login-form-note">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={form.fieldId("email")} label="Email" error={form.errors.email}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="jordan.ellis@example.com"
                leading={<Mail />}
                value={form.values.email}
                onChange={(event) => form.set("email", event.target.value)}
                onBlur={() => form.blur("email")}
              />
            </Field>
            <Field id={form.fieldId("password")} label="Password" error={form.errors.password}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Any password works"
                leading={<Lock />}
                value={form.values.password}
                onChange={(event) => form.set("password", event.target.value)}
                onBlur={() => form.blur("password")}
              />
            </Field>
          </div>
          <FormAnnouncer message={form.summary} />
          <p id="login-form-note" className="text-caption text-fg-subtle">
            Demo accounts: jordan.ellis@example.com (brand), maya.reyes@example.com (creator) and sam@joinflowd.io (admin). The demo has no passwords, so any value works.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" loading={pending === "email"} disabled={busy && pending !== "email"}>
              Sign in
            </Button>
            <Link href="/forgot" className={buttonVariants({ variant: "plain", size: "lg" })}>
              Forgot password?
            </Link>
          </div>
        </form>

        <div className="grid content-start gap-4 lg:border-l lg:border-divider lg:pl-12">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            leadingIcon={pending === "apple" ? <Spinner /> : <Apple />}
            disabled={busy}
            onClick={() => {
              notify.info("Sign in with Apple (demo)", { description: "In production Apple's own sheet opens here. The demo signs you in as Maya." });
              enter("creator", "apple");
            }}
          >
            Sign in with Apple
          </Button>
          <p className="text-caption text-fg-subtle">Mock. No Apple account is used and nothing leaves this browser.</p>
          <p className="text-body-sm text-fg-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-accent underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </div>
      </GlassCard>

      <DemoNote>Demo data. Changes you make are saved in this browser only, and Reset demo in the account menu starts over.</DemoNote>
    </div>
  );
}

function PersonaCard({ persona, art, pending, onChoose }: { persona: DemoPersona; art?: ArtSeed; pending: Pending; onChoose: () => void }) {
  const Icon = ROLE_ICON[persona.key];
  const loading = pending === persona.key;
  const disabled = pending !== null && !loading;
  return (
    <li className="min-w-0">
      <GlassCard padding="md" className={cn("group flex h-full flex-col gap-5 transition-opacity duration-(--fd-dur-base) ease-standard", disabled && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <ArtAvatar art={art ?? artFromName(persona.displayName, "avatar", persona.initials)} name={persona.displayName} size={64} decorative />
          <Badge tone="accent" size="lg" icon={<Icon aria-hidden="true" />}>
            {persona.roleLabel}
          </Badge>
        </div>
        <div className="grid gap-1">
          <p className="font-display text-title-md text-fg">{persona.displayName}</p>
          <p className="text-body-sm text-fg-muted">{persona.title}</p>
        </div>
        <p className="text-body-sm text-fg-muted">{persona.summary}</p>
        <ul aria-label="First stops" className="flex flex-wrap gap-1.5">
          {SEES[persona.key].map((item) => (
            <li key={item} className="rounded-pill bg-surface-field px-2.5 py-1 text-caption font-medium text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onChoose}
          disabled={disabled}
          aria-busy={loading || undefined}
          className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-auto w-full justify-between")}
        >
          <span>Continue as {persona.firstName}</span>
          {loading ? <Spinner /> : <ArrowRight aria-hidden="true" className="transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" />}
        </button>
      </GlassCard>
    </li>
  );
}
