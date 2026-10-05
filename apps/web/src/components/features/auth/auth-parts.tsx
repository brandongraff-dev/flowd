import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** The heading block of an auth page: an eyebrow, the one H1 (display size), and a sentence. Server component. */
export function AuthHeading({ eyebrow, title, description, className, id = "auth-title" }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {eyebrow ? <p className="fd-eyebrow text-accent">{eyebrow}</p> : null}
      <h1 id={id} className="font-display text-display-md text-balance text-fg">
        {title}
      </h1>
      {description ? <p className="max-w-[58ch] text-body-lg text-fg-muted">{description}</p> : null}
    </div>
  );
}

/** A one-line demo caveat: quiet, with a flask glyph, and only where it is true (the account lives in this browser). */
export function DemoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-caption text-fg-subtle", className)}>
      <FlaskConical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

/**
 * A polite live region for form feedback. Always rendered (stable and empty first), so a message that appears after a failed submit is
 * announced; visually hidden when it only repeats what the field errors already show.
 */
export function FormAnnouncer({ message, visible = false }: { message: string; visible?: boolean }) {
  return (
    <p role="status" aria-live="polite" className={visible && message ? "text-body-sm font-medium text-rose" : "sr-only"}>
      {message}
    </p>
  );
}

/** A divider with a word in the middle ("or continue with email"). */
export function OrDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-caption text-fg-subtle" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-divider" />
      <span>{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-divider" />
    </div>
  );
}

export interface BulletProps {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
  tone?: "accent" | "mint" | "info" | "ember" | "violet" | "sun";
}

const TONE: Record<NonNullable<BulletProps["tone"]>, string> = {
  accent: "bg-accent-soft text-accent",
  mint: "bg-mint-soft text-mint",
  info: "bg-info-soft text-info",
  ember: "bg-ember-soft text-ember",
  violet: "bg-violet-soft text-violet",
  sun: "bg-sun-soft text-sun",
};

/** A value point beside a sign-up form: an icon tile, a bold line, a sentence. Lists of these carry the "why" without a wall of text. */
export function Bullet({ icon, title, children, tone = "accent" }: BulletProps) {
  return (
    <li className="flex items-start gap-4">
      <span aria-hidden="true" className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5 [&_svg]:stroke-[1.75]", TONE[tone])}>
        {icon}
      </span>
      <div className="grid gap-0.5">
        <p className="text-body font-semibold text-fg">{title}</p>
        <p className="max-w-[48ch] text-body-sm text-fg-muted">{children}</p>
      </div>
    </li>
  );
}
