"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck, Mail } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Button, EmptyArt, Field, Input, buttonVariants } from "@/components/ui";
import { AuthHeading, DemoNote, FormAnnouncer } from "./auth-parts";
import { forgotSchema } from "./schemas";
import { useZodForm } from "./use-zod-form";

/**
 * `/forgot`: ask for the email, then give one answer whether or not an account exists, so the form cannot be used to find out who has an account.
 * The demo sends nothing and has no passwords; it says so under the confirmation.
 */
export function ForgotView() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useZodForm(forgotSchema, { email: "" }, { idPrefix: "forgot", order: ["email"], labels: { email: "Email" } });

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    // The real service answers in the same shape and time for every address. A short wait stands in for that round trip.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
    setBusy(false);
    setSentTo(values.email.trim());
  });

  return (
    <div className="mx-auto grid w-full max-w-[520px] gap-8">
      {sentTo ? (
        <GlassCard padding="lg" className="grid justify-items-center gap-6 text-center" role="status" aria-live="polite">
          <EmptyArt name="inbox" icon={<MailCheck />} size="md" />
          <div className="grid gap-2">
            <h1 id="forgot-title" className="font-display text-display-sm text-balance text-fg">
              Check your inbox
            </h1>
            <p className="text-body text-fg-muted">
              If an account uses <span className="font-semibold break-all text-fg">{sentTo}</span>, a reset link is on its way. It works once and expires in 30 minutes.
            </p>
            <p className="text-body-sm text-fg-subtle">Nothing there after a few minutes? Check spam, or try the address you signed up with.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Back to sign in
            </Link>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                form.reset();
                setSentTo(null);
              }}
            >
              Use a different email
            </Button>
          </div>
          <DemoNote className="text-left">Demo: no email is sent, and the demo has no passwords to reset. Pick a persona on the sign-in page.</DemoNote>
        </GlassCard>
      ) : (
        <>
          <AuthHeading id="forgot-title" eyebrow="Password reset" title="Forgot your password?" description="Enter the email you signed up with and we will send a link to choose a new one." />
          <GlassCard padding="lg" className="grid gap-6">
            <form onSubmit={submit} noValidate className="grid gap-5">
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
              <FormAnnouncer message={form.summary} />
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                Send reset link
              </Button>
            </form>
            <DemoNote>Demo: no email is sent. The demo has no passwords, so you can also pick a persona on the sign-in page.</DemoNote>
          </GlassCard>
          <Link href="/login" className="inline-flex min-h-11 items-center gap-2 text-body-sm font-semibold text-accent underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2} />
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}
