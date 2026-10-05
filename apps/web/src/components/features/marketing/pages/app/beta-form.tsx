"use client";

import { useState } from "react";
import { CircleCheck, Mail, Smartphone } from "lucide-react";
import { z } from "zod";
import { actions } from "@/lib/store";
import { track } from "@/lib/analytics";
import { GlassCard } from "@/components/glass/glass";
import { Button, Callout, CopyField, Field, Input } from "@/components/ui";
import { DemoNote } from "@/components/features/auth/auth-parts";
import { useZodForm } from "@/components/features/auth/use-zod-form";

const schema = z.object({ email: z.string().trim().min(1, "Enter your email address.").regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter an email like name@example.com.") });

interface Placed {
  position: number;
  total: number;
  link: string;
  already: boolean;
}

/**
 * Request a TestFlight invite. iOS beta invites go out in waitlist order, so this joins the real ranked waitlist through the same store action as
 * `/waitlist`: the visitor gets a true place in line and a referral link, and each friend who joins moves them up 25 places.
 */
export function BetaForm() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint?: string } | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const form = useZodForm(schema, { email: "" }, { idPrefix: "beta", order: ["email"], labels: { email: "Email" } });

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setProblem(null);
    const result = await actions.joinWaitlist({ email: values.email.trim(), role: "creator" });
    setBusy(false);
    if (!result.ok) {
      if (result.error.code === "email_invalid") form.setError("email", result.error.message);
      else setProblem({ message: result.error.message, hint: result.error.hint });
      return;
    }
    track("waitlist_joined", { role: "creator", source: "app_page" });
    setPlaced({ position: result.data.position, total: result.data.total, link: result.data.referral_link, already: result.data.already_joined });
  });

  if (placed) {
    return (
      <GlassCard padding="lg" role="status" aria-live="polite" className="grid gap-5">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mint-soft text-mint [&_svg]:size-6">
            <CircleCheck strokeWidth={1.75} />
          </span>
          <div className="grid gap-1">
            <h3 className="font-display text-title-md text-fg">{placed.already ? "You are already on the list" : "You are on the list"}</h3>
            <p className="text-body-sm text-fg-muted">
              <span className="fd-figure text-body font-semibold text-fg">#{placed.position.toLocaleString("en-US")}</span> of {placed.total.toLocaleString("en-US")}. TestFlight invites go out in order.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-caption font-semibold text-fg-muted">Move up 25 places for each friend who joins</p>
          <CopyField aria-label="Your invite link" value={placed.link} />
        </div>
        <DemoNote>Demo: the place is real inside this browser. No email is sent.</DemoNote>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg" className="grid content-start gap-5">
      <div className="grid gap-1">
        <h3 className="font-display text-title-md text-fg">Request a TestFlight invite</h3>
        <p className="text-body-sm text-fg-muted">We send invites in waitlist order. Add your email and you get a real place in line.</p>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <Field id={form.fieldId("email")} label="Email" labelHidden error={form.errors.email}>
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
        <Button type="submit" variant="primary" size="md" loading={busy} leadingIcon={<Smartphone />}>
          Join the beta
        </Button>
      </form>
      {problem ? (
        <Callout tone="rose" role="alert" title={problem.message}>
          {problem.hint}
        </Callout>
      ) : null}
      <p className="text-caption text-fg-subtle">Free for creators. We only use your email for the invite and payout updates.</p>
    </GlassCard>
  );
}
