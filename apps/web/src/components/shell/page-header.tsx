import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<ComponentPropsWithRef<"header">, "title"> {
  /** Small caps line above the title: the area ("Bounties", "Wallet"). */
  eyebrow?: ReactNode;
  /** The page's one H1. App pages use `display-md`; the brand dashboard is calm, so keep it to a few words. */
  title: ReactNode;
  /** One or two sentences. Capped at 62ch so it never runs the width of a 1200px page. */
  description?: ReactNode;
  /** Breadcrumb trail above the title (a `<Breadcrumbs/>`). */
  breadcrumbs?: ReactNode;
  /** Right-aligned actions. The primary one is a single gradient button; the rest stay neutral. Wraps under the title on phones. */
  actions?: ReactNode;
  /** A row of chips under the description: status, plan, "Funded", dates. */
  meta?: ReactNode;
  /** Page tabs or a segmented control, flush under the header. */
  tabs?: ReactNode;
  /** Heading element id, so a `<main aria-labelledby>` can point at it. */
  titleId?: string;
}

/**
 * The top of an app page: breadcrumbs, eyebrow, H1, description, actions, meta and tabs, in one rhythm. Numbers are heroes,
 * so the title stays short and the figures below carry the page. Server-renderable.
 */
export function PageHeader({ eyebrow, title, description, breadcrumbs, actions, meta, tabs, titleId, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("grid gap-5 pb-2", className)} {...props}>
      {breadcrumbs}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid min-w-0 flex-1 basis-80 gap-2.5">
          {eyebrow ? <p className="fd-eyebrow text-accent">{eyebrow}</p> : null}
          <h1 id={titleId} className="font-display text-display-md text-balance text-fg">
            {title}
          </h1>
          {description ? <p className="max-w-[62ch] text-body text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      {tabs ? <div className="-mb-2">{tabs}</div> : null}
    </header>
  );
}

export interface SectionProps extends Omit<ComponentPropsWithRef<"section">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right of the heading: a link ("View all"), a segmented control. */
  actions?: ReactNode;
  /** Heading level of the title (default 2). The page's H1 lives in `PageHeader`. */
  level?: 2 | 3;
  /** Gap between the header and the content (default 20px, the system rhythm). */
  gap?: "sm" | "md" | "lg";
}

const GAPS = { sm: "gap-3", md: "gap-5", lg: "gap-8" } as const;

/**
 * A page section: an H2 (or H3), an optional description and actions, then the content. Spacing between sections is twice the
 * spacing inside one (the "gap between groups is at least twice the gap within" rule), so place sections in a `grid gap-10`.
 */
export function Section({ title, description, actions, level = 2, gap = "md", className, children, id, ...props }: SectionProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const headingId = id && title ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", GAPS[gap], className)} {...props}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="grid min-w-0 gap-1">
            {title ? (
              <Heading id={headingId} className={cn("font-display text-fg", level === 2 ? "text-title-md" : "text-title-sm")}>
                {title}
              </Heading>
            ) : null}
            {description ? <p className="max-w-[62ch] text-body-sm text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
