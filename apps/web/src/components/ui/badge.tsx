import type { ComponentPropsWithRef, ReactNode } from "react";
import {
  Ban,
  BadgeCheck,
  Banknote,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  Flag,
  Hourglass,
  Lock,
  Minus,
  Pause,
  Pencil,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "violet" | "mint" | "ember" | "sun" | "rose" | "info";

/**
 * Soft tints are painted over the SOLID surface, not over whatever glass or aurora is behind the pill. That keeps the label
 * contrast deterministic (the AA numbers in BRAND.md 6.3 assume the base surface); a translucent tint over a violet orb
 * measured 4.1 to 4.4 in the light theme.
 */
const SOFT: Record<Tone, string> = {
  neutral: "bg-surface-hover text-fg-muted",
  accent: "bg-surface bg-[image:linear-gradient(var(--fd-accent-soft),var(--fd-accent-soft))] text-accent",
  violet: "bg-surface bg-[image:linear-gradient(var(--fd-violet-soft),var(--fd-violet-soft))] text-violet",
  mint: "bg-surface bg-[image:linear-gradient(var(--fd-mint-soft),var(--fd-mint-soft))] text-mint",
  ember: "bg-surface bg-[image:linear-gradient(var(--fd-ember-soft),var(--fd-ember-soft))] text-ember",
  sun: "bg-surface bg-[image:linear-gradient(var(--fd-sun-soft),var(--fd-sun-soft))] text-sun",
  rose: "bg-surface bg-[image:linear-gradient(var(--fd-rose-soft),var(--fd-rose-soft))] text-rose",
  info: "bg-surface bg-[image:linear-gradient(var(--fd-info-soft),var(--fd-info-soft))] text-info",
};

const SOLID: Record<Tone, string> = {
  neutral: "bg-fg text-fg-inverse",
  accent: "bg-accent-solid text-on-accent",
  violet: "bg-violet-solid text-on-violet",
  mint: "bg-mint-solid text-on-mint",
  ember: "bg-ember-solid text-on-ember",
  sun: "bg-sun-solid text-on-sun",
  rose: "bg-rose-solid text-on-rose",
  info: "bg-info-solid text-on-info",
};

const OUTLINE: Record<Tone, string> = {
  neutral: "text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]",
  accent: "text-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-accent)_45%,transparent)]",
  violet: "text-violet shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-violet)_45%,transparent)]",
  mint: "text-mint shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-mint)_45%,transparent)]",
  ember: "text-ember shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-ember)_45%,transparent)]",
  sun: "text-sun shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-sun)_45%,transparent)]",
  rose: "text-rose shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-rose)_45%,transparent)]",
  info: "text-info shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-info)_45%,transparent)]",
};

/** Tone classes for any chip-like element (also used by Chip, Callout and Stepper). `soft` is the default tinted pill. */
export function toneClasses(tone: Tone, variant: "soft" | "solid" | "outline" = "soft"): string {
  return variant === "solid" ? SOLID[tone] : variant === "outline" ? OUTLINE[tone] : SOFT[tone];
}

const badgeVariants = cva("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-pill tabular-nums [&_svg]:shrink-0", {
  variants: {
    size: {
      /** 20px: counts and compact labels. */
      sm: "h-5 min-w-5 gap-1 px-1.5 text-micro font-semibold [&_svg]:size-3",
      /** 24px */
      md: "h-6 gap-1.5 px-2.5 text-caption font-semibold [&_svg]:size-3.5",
      /** 28px: the brand-board pill. */
      lg: "h-7 gap-1.5 px-3 text-caption font-semibold [&_svg]:size-3.5",
    },
  },
  defaultVariants: { size: "md" },
});

export interface BadgeProps extends Omit<ComponentPropsWithRef<"span">, "color">, VariantProps<typeof badgeVariants> {
  /** Colour meaning: mint = money earned, info = pending, ember = urgency, sun = featured/Elite, rose = danger, violet = Flo, accent = interactive. */
  tone?: Tone;
  /** `soft` (default): tinted fill with a text-safe colour. `solid`: filled with its `on-*` label. `outline`: ring only. */
  variant?: "soft" | "solid" | "outline";
  /** Leading icon (lucide). Colour is never the only cue: pair status tones with an icon or a word. */
  icon?: ReactNode;
  /** Leading dot instead of an icon. */
  dot?: boolean;
}

/**
 * Compact label or count. 20 / 24 / 28 px. Text colours are the AA-verified base tokens (`text-mint`, `text-rose`...);
 * solid fills carry their own `on-*` colour.
 */
export function Badge({ tone = "neutral", variant = "soft", size, icon, dot, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ size }), toneClasses(tone, variant), className)} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : icon}
      {children}
    </span>
  );
}

/** The brand-board pill: a 28px tinted status tag with an optional icon (`<Pill tone="mint" icon={<Check />}>Cleared</Pill>`). */
export function Pill({ size = "lg", ...props }: BadgeProps) {
  return <Badge size={size} {...props} />;
}

export interface StatusMeta {
  tone: Tone;
  label: string;
  icon: LucideIcon;
}

/**
 * Status vocabulary for StatusPill. Money: pending (lagoon + clock) and cleared (mint + check) are always distinct in
 * glyph as well as colour. Extend it from your feature area with `<StatusPill meta={...}>` for one-offs.
 */
export const STATUS_META: Record<string, StatusMeta> = {
  // Money (the Money Clock)
  pending: { tone: "info", label: "Pending", icon: Clock },
  cleared: { tone: "mint", label: "Cleared", icon: Check },
  paid: { tone: "mint", label: "Paid out", icon: Banknote },
  held: { tone: "sun", label: "On hold", icon: Pause },
  refunded: { tone: "rose", label: "Refunded", icon: RotateCcw },
  clawed_back: { tone: "rose", label: "Clawed back", icon: Minus },
  escrowed: { tone: "neutral", label: "In escrow", icon: Lock },
  // Review and posting
  submitted: { tone: "info", label: "Submitted", icon: Clock },
  in_review: { tone: "accent", label: "In review", icon: Eye },
  approved: { tone: "mint", label: "Approved", icon: CircleCheck },
  revision_requested: { tone: "sun", label: "Changes requested", icon: RotateCcw },
  rejected: { tone: "rose", label: "Not approved", icon: CircleX },
  appealed: { tone: "violet", label: "Appealed", icon: Scale },
  posted: { tone: "accent", label: "Posted", icon: BadgeCheck },
  window_open: { tone: "info", label: "Views counting", icon: Timer },
  window_closed: { tone: "neutral", label: "Window closed", icon: Hourglass },
  // Bounties
  draft: { tone: "neutral", label: "Draft", icon: Pencil },
  unfunded: { tone: "ember", label: "Needs funding", icon: Lock },
  funded: { tone: "mint", label: "Funded", icon: ShieldCheck },
  live: { tone: "accent", label: "Live", icon: Zap },
  paused: { tone: "sun", label: "Paused", icon: Pause },
  filled: { tone: "violet", label: "Filled", icon: Check },
  closed: { tone: "neutral", label: "Closed", icon: Ban },
  // Trust
  verified: { tone: "accent", label: "Verified", icon: BadgeCheck },
  flagged: { tone: "rose", label: "Flagged", icon: Flag },
  disputed: { tone: "ember", label: "Disputed", icon: Scale },
  featured: { tone: "sun", label: "Featured", icon: Sparkles },
};

function humanize(status: string): string {
  const spaced = status.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : status;
}

export interface StatusPillProps extends Omit<BadgeProps, "tone" | "icon" | "dot" | "children"> {
  /** A key of `STATUS_META` (snake_case). Unknown keys render a neutral pill with a humanised label. */
  status: string;
  /** Override the label (keep it to a word or two). */
  label?: string;
  /** Override the mapped tone. */
  tone?: Tone;
  /** `false` hides the glyph. Do that only where the label is enough on its own. */
  icon?: ReactNode | false;
  /** Pulse the leading dot (live states). Static under reduced motion. */
  pulse?: boolean;
  /** One-off meta for a status that is not in `STATUS_META`. */
  meta?: StatusMeta;
}

/**
 * Status tag driven by the status colour tokens: a glyph, a word and a tone, so state never rests on colour alone.
 * `<StatusPill status="cleared" />`, `<StatusPill status="in_review" />`, `<StatusPill status="live" pulse />`.
 */
export function StatusPill({ status, label, tone, icon, pulse, meta, size = "lg", className, ...props }: StatusPillProps) {
  const resolved = meta ?? STATUS_META[status];
  const Glyph = resolved?.icon;
  const text = label ?? resolved?.label ?? humanize(status);
  const mapped = tone ?? resolved?.tone ?? "neutral";
  return (
    <Badge tone={mapped} size={size} className={className} {...props}>
      {pulse ? (
        <span aria-hidden="true" className="fd-pulse relative inline-flex size-2">
          <span className="relative size-2 rounded-full bg-current" />
        </span>
      ) : icon === false ? null : icon ?? (Glyph ? <Glyph aria-hidden="true" strokeWidth={2} /> : null)}
      {text}
    </Badge>
  );
}
