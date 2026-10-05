import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container, type ContainerProps } from "@/components/shell/container";
import { RevealItem, SectionReveal } from "@/components/shell/section-reveal";

/**
 * One gradient word or phrase per view (BRAND.md 6.7). Dark theme uses the full Flow gradient; light theme uses the deeper
 * violet-to-azure button gradient, because the cyan end of the Flow gradient fails contrast on pearl.
 */
export function GradientWord({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("fd-gradient-text light:[background-image:var(--fd-gradient-flowButton)]", className)}>{children}</span>;
}

/** Small uppercase label above a heading. */
export function Eyebrow({ children, className, ...props }: ComponentPropsWithRef<"p">) {
  return (
    <p className={cn("fd-eyebrow text-accent", className)} {...props}>
      {children}
    </p>
  );
}

export interface MarketingSectionProps {
  id?: string;
  eyebrow?: ReactNode;
  /** The section heading (an `h2`). */
  title: ReactNode;
  lede?: ReactNode;
  /** Right-hand actions beside the heading on wide screens. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Centre the header (pricing, closing sections). */
  align?: "start" | "center";
  size?: ContainerProps["size"];
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  /** Skip the scroll reveal (the first section on a page is already on screen). */
  reveal?: boolean;
}

/**
 * The marketing section frame: a width box, a heading block (eyebrow, h2, lede) and a body, revealed as the section scrolls into view
 * (14px rise, 40 ms stagger, once). Heading levels: the page owns the single `h1`; sections are `h2`, cards inside are `h3`.
 */
export function MarketingSection({
  id,
  eyebrow,
  title,
  lede,
  actions,
  children,
  align = "start",
  size = "wide",
  className,
  bodyClassName,
  headerClassName,
  reveal = true,
}: MarketingSectionProps) {
  const centred = align === "center";
  const header = (
    <>
      {eyebrow ? (
        <RevealItem index={0}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </RevealItem>
      ) : null}
      <RevealItem index={1} as="h2" className="text-display-md text-fg">
        {title}
      </RevealItem>
      {lede ? (
        <RevealItem index={2} className="text-body-lg max-w-[58ch] text-pretty text-fg-muted">
          {lede}
        </RevealItem>
      ) : null}
    </>
  );
  const body = children ? (
    <RevealItem index={3} className={cn("mt-10 md:mt-14", bodyClassName)}>
      {children}
    </RevealItem>
  ) : null;

  const inner = (
    <Container size={size} className={className}>
      <div className={cn("flex flex-col gap-x-10 gap-y-6 md:flex-row md:items-end md:justify-between", centred && "md:flex-col md:items-center", headerClassName)}>
        <div className={cn("grid gap-3", centred && "justify-items-center text-center")}>{header}</div>
        {actions ? (
          <RevealItem index={2} className="shrink-0">
            {actions}
          </RevealItem>
        ) : null}
      </div>
      {body}
    </Container>
  );

  if (!reveal) {
    return (
      <section id={id} className="scroll-mt-24 py-16 md:py-24">
        {inner}
      </section>
    );
  }
  return (
    <SectionReveal as="section" id={id} className="scroll-mt-24 py-16 md:py-24" amount={0.1}>
      {inner}
    </SectionReveal>
  );
}

/** A page-level header for the audience pages: eyebrow, `h1`, lede and optional actions, with the top padding the floating nav needs. */
export function PageHero({
  eyebrow,
  title,
  lede,
  actions,
  note,
  children,
  align = "start",
  className,
}: {
  eyebrow?: ReactNode;
  /** The page `h1`. */
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Small honest line under the actions (disclaimer, demo note). */
  note?: ReactNode;
  /** Right-hand art. */
  children?: ReactNode;
  align?: "start" | "center";
  className?: string;
}) {
  const centred = align === "center";
  return (
    <section className={cn("relative pt-10 pb-12 md:pt-16 md:pb-20", className)}>
      <Container size="wide" className={cn("grid items-center gap-10 lg:gap-14", children ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : "")}>
        <div className={cn("grid gap-6", centred && "justify-items-center text-center")}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className={cn("text-display-xl text-fg", centred && "max-w-[18ch]")}>{title}</h1>
          {lede ? <p className={cn("text-body-lg max-w-[56ch] text-pretty text-fg-muted", centred && "mx-auto")}>{lede}</p> : null}
          {actions ? <div className={cn("flex flex-wrap items-center gap-3", centred && "justify-center")}>{actions}</div> : null}
          {note ? <p className="text-caption max-w-[62ch] text-fg-subtle">{note}</p> : null}
        </div>
        {children ? <div className="relative">{children}</div> : null}
      </Container>
    </section>
  );
}
