import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass";

/** A gallery section: anchor, eyebrow, display title, one-paragraph brief, then the specimens. */
export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 py-10 sm:py-14">
      <header className="mb-7 grid max-w-3xl gap-3">
        <p className="fd-eyebrow text-accent">{eyebrow}</p>
        <h2 id={`${id}-title`} className="font-display text-display-sm text-fg">
          {title}
        </h2>
        {description ? <p className="text-body-lg text-fg-muted">{description}</p> : null}
      </header>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

/** A quiet-glass (L1) card holding one family of specimens. Children use fills, never more glass. */
export function Panel({
  title,
  note,
  children,
  className,
  padding = "md",
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}) {
  return (
    <GlassCard padding={padding} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5", className)}>
      {title ? (
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">{title}</h3>
          {note ? <p className="text-caption text-fg-subtle">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </GlassCard>
  );
}

/** A labelled row of specimens. */
export function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid gap-2.5">
      {label ? <p className="fd-eyebrow text-fg-subtle">{label}</p> : null}
      <div className={cn("flex flex-wrap items-center gap-2.5", className)}>{children}</div>
    </div>
  );
}

/** One specimen with a caption underneath (state matrices). */
export function Spec({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 justify-items-start gap-2", className)}>
      {children}
      <p className="text-micro text-fg-subtle">{caption}</p>
    </div>
  );
}

/** A responsive grid of panels. */
export function Cols({ children, n = 2, className }: { children: ReactNode; n?: 2 | 3; className?: string }) {
  return <div className={cn("grid gap-5", n === 2 ? "lg:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}

/** Inline code chip for token and prop names in captions. */
export function Code({ children, ...props }: ComponentPropsWithRef<"code">) {
  return (
    <code className="rounded-md bg-surface-field px-1.5 py-0.5 font-mono text-code text-fg-muted" {...props}>
      {children}
    </code>
  );
}
