"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { CircleCheck, Info, OctagonAlert, ShieldCheck, Sparkles, TriangleAlert, X, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./badge";

const ICON: Record<Tone, LucideIcon> = {
  neutral: Info,
  accent: Info,
  info: Info,
  violet: Sparkles,
  mint: CircleCheck,
  ember: Zap,
  sun: TriangleAlert,
  rose: OctagonAlert,
};

/** The wash and 1px ring of each tone: soft token fill, ring a mix of the AA-safe text colour. */
const WASH: Record<Tone, string> = {
  neutral: "bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]",
  accent: "bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_32%,transparent)]",
  info: "bg-info-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-info)_32%,transparent)]",
  violet: "bg-violet-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-violet)_32%,transparent)]",
  mint: "bg-mint-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-mint)_32%,transparent)]",
  ember: "bg-ember-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-ember)_32%,transparent)]",
  sun: "bg-sun-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_32%,transparent)]",
  rose: "bg-rose-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-rose)_32%,transparent)]",
};

const TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  accent: "text-accent",
  info: "text-info",
  violet: "text-violet",
  mint: "text-mint",
  ember: "text-ember",
  sun: "text-sun",
  rose: "text-rose",
};

export interface CalloutProps extends Omit<ComponentPropsWithRef<"div">, "title" | "role"> {
  /** Colour meaning: info/accent = neutral news, mint = done/good, sun = heads-up, ember = time-boxed, rose = problem, violet = Flo. */
  tone?: Tone;
  /** Bold first line. Say the thing; skip "Note:". */
  title?: ReactNode;
  /** Replace the default icon for the tone (lucide). Pass `null` to hide it. */
  icon?: ReactNode;
  /** An inline action (a `<Button size="sm" variant="secondary">` or a link), right-aligned on desktop, under the text on a phone. */
  action?: ReactNode;
  /** Shows a dismiss button that calls this. The callout does not hide itself: remove it from your state. */
  onDismiss?: () => void;
  /**
   * Live-region role. `alert` interrupts (use for errors that block), `status` is polite (use for results). Default none:
   * a callout that is simply on the page is just content.
   */
  role?: "alert" | "status";
}

/**
 * Inline message on a surface: a tinted fill with a ring (a fill, not glass, so it works inside cards, sheets and
 * toasts alike). Always has an icon and words, never colour alone. Radius 20 with 16px padding gives a concentric 4px
 * corner on the icon chip's container, and the chip is 28px.
 */
export function Callout({ tone = "info", title, icon, action, onDismiss, role, className, children, ...props }: CalloutProps) {
  const Glyph = ICON[tone];
  return (
    <div role={role} className={cn("flex items-start gap-3 rounded-[20px] p-4", WASH[tone], className)} {...props}>
      {icon === null ? null : (
        <span aria-hidden="true" className={cn("mt-px grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[2]", toneClasses(tone, "soft"))}>
          {icon ?? <Glyph />}
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-1 sm:flex sm:items-center sm:gap-4">
        <div className="grid min-w-0 flex-1 gap-0.5 text-body-sm">
          {title ? <p className="font-semibold text-fg">{title}</p> : null}
          {children ? <div className="text-fg-muted [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
        </div>
        {action ? <div className="mt-1.5 flex shrink-0 items-center gap-2 sm:mt-0">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:size-11"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

export interface BannerProps extends Omit<ComponentPropsWithRef<"div">, "title" | "role"> {
  tone?: Tone;
  icon?: ReactNode;
  /** Trailing action (a link or small button). */
  action?: ReactNode;
  onDismiss?: () => void;
  role?: "alert" | "status";
}

/**
 * A slim, full-width strip for page-level notices (a maintenance window, a verification reminder, a Reduce-glass hint).
 * One line on desktop, wraps on a phone. Sit it at the top of the content area, never over the header.
 */
export function Banner({ tone = "accent", icon, action, onDismiss, role, className, children, ...props }: BannerProps) {
  const Glyph = tone === "mint" ? ShieldCheck : ICON[tone];
  return (
    <div role={role} className={cn("flex min-h-11 items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-body-sm", WASH[tone], className)} {...props}>
      <span aria-hidden="true" className={cn("grid shrink-0 place-items-center [&_svg]:size-4 [&_svg]:stroke-[2]", TEXT[tone])}>
        {icon ?? <Glyph />}
      </span>
      <div className="min-w-0 flex-1 font-medium text-fg [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">{children}</div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:size-11"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
