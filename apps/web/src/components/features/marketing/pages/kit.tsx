import type { ComponentPropsWithRef, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/shell/container";
import { SectionReveal, RevealItem } from "@/components/shell/section-reveal";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";

/**
 * The editorial kit every content page under (marketing) is built from, so /market, /trust, /developers and the rest read as one family with
 * the landing page: an eyebrow, a big display headline with one gradient phrase, a lede in plain English, then sections that each open with an
 * eyebrow, an H2 and one sentence. Server components; the only motion is the section reveal (rare, once, off under reduced motion).
 */

/** The one gradient phrase of a headline (BRAND.md 6.7: one per view, never body text). */
export function HeroAccent({ children }: { children: ReactNode }) {
  return <span className="fd-gradient-text light:[background-image:var(--fd-gradient-flowButton)]">{children}</span>;
}

export interface PageHeroProps {
  /** The area, in a few words ("Market", "Trust Center"). */
  eyebrow: ReactNode;
  /** The page's one H1. Wrap one phrase in `<HeroAccent>`. */
  title: ReactNode;
  /** One or two sentences under the headline. */
  lede: ReactNode;
  /** The primary action and at most one quiet alternative. */
  actions?: ReactNode;
  /** A row of chips or a line of proof under the actions. */
  meta?: ReactNode;
  /** Hero art: real components with real numbers. Sits right on desktop, under the copy on a phone. */
  art?: ReactNode;
  /** `xl` for short headlines, `lg` when the headline runs long. */
  size?: "xl" | "lg";
  id?: string;
}

/** The editorial page hero. The marketing layout gives `main` the top padding the floating nav needs, so the hero only adds its own rhythm. */
export function PageHero({ eyebrow, title, lede, actions, meta, art, size = "xl", id = "hero" }: PageHeroProps) {
  return (
    <header aria-labelledby={`${id}-title`} className="relative">
      <Container size="wide" className={cn("grid gap-10 pt-10 pb-12 md:pt-16 md:pb-20 lg:gap-14", art && "lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center")}>
        <SectionReveal as="div" className="grid min-w-0 content-start gap-6">
          <RevealItem index={0}>
            <p className="fd-eyebrow text-accent">{eyebrow}</p>
          </RevealItem>
          <RevealItem index={1}>
            <h1 id={`${id}-title`} className={cn("text-balance text-fg", size === "xl" ? "text-display-xl" : "text-display-lg")}>
              {title}
            </h1>
          </RevealItem>
          <RevealItem index={2}>
            <p className="max-w-[56ch] text-body-lg text-pretty text-fg-muted">{lede}</p>
          </RevealItem>
          {actions ? (
            <RevealItem index={3} className="flex flex-wrap items-center gap-3 pt-1">
              {actions}
            </RevealItem>
          ) : null}
          {meta ? (
            <RevealItem index={4} className="flex flex-wrap items-center gap-2">
              {meta}
            </RevealItem>
          ) : null}
        </SectionReveal>
        {art ? <div className="min-w-0">{art}</div> : null}
      </Container>
    </header>
  );
}

export interface PageSectionProps extends Omit<ComponentPropsWithRef<"section">, "title"> {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Right of the heading on desktop (a link, a control). */
  actions?: ReactNode;
  /** Container width: `content` (1200, default), `wide` (1360) or `prose` (680, for reading). */
  width?: "wide" | "content" | "prose";
  /** Tighter vertical rhythm for a section that follows its sibling closely. */
  compact?: boolean;
}

/** A page section: eyebrow, H2, a sentence, then the content. The gap between sections is more than twice the gap inside one. */
export function PageSection({ eyebrow, title, description, actions, width = "content", compact = false, id, className, children, ...props }: PageSectionProps) {
  const headingId = id && title ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-24", className)} {...props}>
      <Container size={width} className={cn(compact ? "py-10 md:py-14" : "py-16 md:py-24")}>
        <SectionReveal as="div" className="grid gap-10 md:gap-14">
          {title ? (
            <RevealItem index={0} className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="grid max-w-[58ch] min-w-0 gap-3">
                {eyebrow ? <p className="fd-eyebrow text-accent">{eyebrow}</p> : null}
                <h2 id={headingId} className="text-display-md text-balance text-fg">
                  {title}
                </h2>
                {description ? <p className="text-body-lg text-pretty text-fg-muted">{description}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
            </RevealItem>
          ) : null}
          <RevealItem index={1} className="min-w-0">
            {children}
          </RevealItem>
        </SectionReveal>
      </Container>
    </section>
  );
}

export interface FigureProps {
  /** Overline above the number ("Median decision time"). */
  label: ReactNode;
  /** The number, already formatted. */
  value: ReactNode;
  /** One line under it: the period, the sample, the target. */
  note?: ReactNode;
  /** Optional chip or glyph on the label row (a status). */
  trailing?: ReactNode;
  className?: string;
}

/** A headline figure: overline, the number in tabular Bricolage, one line of context. Numbers are heroes. */
export function Figure({ label, value, note, trailing, className }: FigureProps) {
  return (
    <div className={cn("grid min-w-0 content-start gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="fd-eyebrow text-fg-subtle">{label}</p>
        {trailing}
      </div>
      <p className="fd-figure text-figure-xl text-fg">{value}</p>
      {note ? <p className="max-w-[40ch] text-body-sm text-fg-muted">{note}</p> : null}
    </div>
  );
}

/** A small glass tile around a figure or a fact: the standard content surface of these pages. */
export function FactCard({ className, children, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <GlassCard padding="md" className={cn("grid min-w-0 content-start gap-3", className)} {...props}>
      {children}
    </GlassCard>
  );
}

export interface IconTileProps {
  children: ReactNode;
  tone?: "accent" | "mint" | "ember" | "sun" | "violet" | "info" | "rose";
  className?: string;
}

const TILE_TONE: Record<NonNullable<IconTileProps["tone"]>, string> = {
  accent: "bg-accent-soft text-accent",
  mint: "bg-mint-soft text-mint",
  ember: "bg-ember-soft text-ember",
  sun: "bg-sun-soft text-sun",
  violet: "bg-violet-soft text-violet",
  info: "bg-info-soft text-info",
  rose: "bg-rose-soft text-rose",
};

/** The rounded icon tile at the head of a card. Decorative: the heading beside it carries the meaning. */
export function IconTile({ children, tone = "accent", className }: IconTileProps) {
  return (
    <span aria-hidden="true" className={cn("grid size-11 shrink-0 place-items-center rounded-[14px] [&_svg]:size-5 [&_svg]:stroke-[1.75]", TILE_TONE[tone], className)}>
      {children}
    </span>
  );
}

export interface CtaBandProps {
  title: ReactNode;
  description?: ReactNode;
  /** The primary action and a quiet alternative. */
  actions: ReactNode;
  className?: string;
}

/** The closing call to action of a page: one sentence, two buttons, on a Flow-tinted quiet-glass panel. */
export function CtaBand({ title, description, actions, className }: CtaBandProps) {
  return (
    <Container size="content" className={cn("py-16 md:py-24", className)}>
      <GlassCard tint="flow" padding="lg" className="rounded-[36px] p-8 sm:p-12">
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6">
          <div className="grid max-w-[56ch] gap-3">
            <h2 className="text-display-sm text-balance text-fg">{title}</h2>
            {description ? <p className="text-body-lg text-pretty text-fg-muted">{description}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        </div>
      </GlassCard>
    </Container>
  );
}

/** The standard pair of sign-up buttons: creators first (it is free), brands second. */
export function SignupActions({ creatorLabel = "Start earning", brandLabel = "Fund a bounty" }: { creatorLabel?: string; brandLabel?: string }) {
  return (
    <>
      <Link href="/signup/creator" className={buttonVariants({ variant: "primary", size: "lg" })}>
        {creatorLabel}
      </Link>
      <Link href="/signup/brand" className={buttonVariants({ variant: "secondary", size: "lg" })}>
        {brandLabel}
      </Link>
    </>
  );
}

/** A text link with an arrow, for "see how it works" lines inside cards. */
export function ArrowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex min-h-8 items-center gap-1.5 text-body-sm font-semibold text-accent underline-offset-4 hover:underline", className)}>
      {children}
      <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-(--fd-dur-fast) ease-standard group-hover:translate-x-0.5" strokeWidth={2} />
    </Link>
  );
}

/** A footnote: the method, the source or the limit of a number. Small, honest and never hidden. */
export function Footnote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-[72ch] text-caption text-fg-subtle", className)}>{children}</p>;
}

/** Prose for policies and explainers: a readable measure with calm spacing. */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid max-w-[68ch] gap-4 text-body text-fg-muted [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold [&_strong]:text-fg", className)}>
      {children}
    </div>
  );
}
