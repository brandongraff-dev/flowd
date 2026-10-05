"use client";

import { useEffect, useState } from "react";
import { BellRing, CircleCheck, Mail } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Button, Field, Input, notify } from "@/components/ui";
import { DemoNote } from "@/components/features/auth/auth-parts";
import { useZodForm } from "@/components/features/auth/use-zod-form";

const schema = z.object({ email: z.string().trim().min(1, "Enter your email address.").regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Enter an email like name@example.com.") });
const KEY_PREFIX = "flowd-subscribed-";

function read(topic: string): string | null {
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${topic}`);
  } catch {
    return null;
  }
}

function write(topic: string, email: string | null): void {
  try {
    if (email) window.localStorage.setItem(`${KEY_PREFIX}${topic}`, email);
    else window.localStorage.removeItem(`${KEY_PREFIX}${topic}`);
  } catch {
    // Blocked storage only means the confirmation is not remembered on this device.
  }
}

export interface SubscribeCardProps {
  /** Which list: "changelog" or "status". Remembered per device under this key. */
  topic: string;
  title: string;
  description: string;
  /** What the list sends, in the button's words ("Email me releases"). */
  action?: string;
  className?: string;
}

/**
 * An email subscribe card. The demo has no mail service, so the address is kept on this device only and the card says so; the form itself
 * validates and confirms like the real one. A subscriber can undo it, and the confirmation is a polite live region.
 */
export function SubscribeCard({ topic, title, description, action = "Subscribe", className }: SubscribeCardProps) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useZodForm(schema, { email: "" }, { idPrefix: `subscribe-${topic}`, order: ["email"], labels: { email: "Email" } });

  useEffect(() => {
    setSaved(read(topic));
  }, [topic]);

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
    write(topic, values.email.trim());
    setSaved(values.email.trim());
    setBusy(false);
    notify.success("You are subscribed", { description: "Demo: the address is kept on this device only." });
  });

  return (
    <GlassCard padding="lg" className={cn("grid content-start gap-5", className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
          <BellRing />
        </span>
        <div className="grid gap-1">
          <h3 className="font-display text-title-md text-fg">{title}</h3>
          <p className="text-body-sm text-fg-muted">{description}</p>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {saved ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-body-sm font-medium text-fg">
              <CircleCheck aria-hidden="true" className="size-[18px] shrink-0 text-mint" strokeWidth={2} />
              <span className="break-all">Subscribed: {saved}</span>
            </p>
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                write(topic, null);
                setSaved(null);
                form.reset();
              }}
            >
              Unsubscribe
            </Button>
          </div>
        ) : null}
      </div>
      {!saved ? (
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
          <Button type="submit" variant="primary" size="md" loading={busy} className="sm:mt-0">
            {action}
          </Button>
        </form>
      ) : null}
      <DemoNote>Demo: nothing is emailed. Your address stays on this device, and Unsubscribe removes it.</DemoNote>
    </GlassCard>
  );
}
