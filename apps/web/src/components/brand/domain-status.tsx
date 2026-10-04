import {
  ArrowUpRight,
  Ban,
  BadgeCheck,
  Banknote,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Eye,
  Flag,
  Hourglass,
  Lock,
  Minus,
  Pause,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { StatusPill, type StatusPillProps, type Tone } from "@/components/ui/badge";

/**
 * The shape of one entry of the contract's enum maps (`BOUNTY_STATUS_META.live`, `POST_STATUS_META.cleared`, ... in
 * `src/lib/contract/types.ts`, synced from packages/contract): a UI label and a colour tone, plus the plain-English meaning.
 * Declared structurally so ANY of the contract's 164 enum meta maps feeds the pill without an import (and without a cycle).
 */
export interface EnumMetaLike {
  label: string;
  tone: Tone;
  meaning?: string;
}

/** Glyphs for the enum values that carry money, review or lifecycle meaning. Colour is never the only cue, so every status has an icon. */
const VALUE_ICON: Record<string, LucideIcon> = {
  // money
  accruing: Timer,
  pending: Clock,
  cleared: Check,
  paid: Banknote,
  held: Pause,
  reversed: Minus,
  clawed_back: Minus,
  refunded: RotateCcw,
  escrowed: Lock,
  in_transit: ArrowUpRight,
  processing: RefreshCw,
  failed: CircleX,
  // review and posting
  qa_pending: Clock,
  submitted: Clock,
  in_review: Eye,
  changes_requested: RotateCcw,
  approved: CircleCheck,
  posted: BadgeCheck,
  rejected: CircleX,
  appealed: Scale,
  withdrawn: Undo2,
  expired: Hourglass,
  released: Sparkles,
  window_open: Timer,
  window_closed: Hourglass,
  // bounties
  draft: Pencil,
  awaiting_funding: Lock,
  funded: ShieldCheck,
  scheduled: CalendarClock,
  live: Zap,
  paused: Pause,
  filled: Check,
  ended: Ban,
  settled: CheckCheck,
  cancelled: Ban,
  closed: Ban,
  // trust
  verified: BadgeCheck,
  flagged: Flag,
  disputed: Scale,
  featured: Sparkles,
};

/** Fallback glyph by tone, for enums that are not in the table above. */
const TONE_ICON: Record<Tone, LucideIcon> = {
  mint: Check,
  info: Clock,
  accent: CircleDot,
  ember: CircleAlert,
  rose: CircleX,
  sun: Star,
  violet: Sparkles,
  neutral: CircleDot,
};

/** The glyph of an enum value: a specific one when the value is known, else one that matches the tone. */
export function statusGlyph(value: string | undefined, tone: Tone): LucideIcon {
  return (value ? VALUE_ICON[value] : undefined) ?? TONE_ICON[tone];
}

export interface DomainStatusPillProps extends Omit<StatusPillProps, "status" | "label" | "tone" | "meta"> {
  /** The enum's meta entry from the contract: `<DomainStatusPill meta={BOUNTY_STATUS_META[b.status]} value={b.status} />`. */
  meta: EnumMetaLike;
  /** The enum value (snake_case). Picks a specific glyph; omit it to get one by tone. */
  value?: string;
}

/**
 * A status pill driven by the contract's enum maps. The label and tone come from the single source of truth
 * (`packages/contract`), the glyph from `statusGlyph`, and the pill itself is the design system's `StatusPill`, so money
 * states keep their clock-versus-check distinction everywhere. The plain-English `meaning` becomes the pill's `title`.
 *
 * ```tsx
 * import { BOUNTY_STATUS_META } from "@/lib/contract/types";
 * <DomainStatusPill meta={BOUNTY_STATUS_META[bounty.status]} value={bounty.status} />
 * ```
 */
export function DomainStatusPill({ meta, value, title, ...props }: DomainStatusPillProps) {
  return <StatusPill status={value ?? meta.label} meta={{ tone: meta.tone, label: meta.label, icon: statusGlyph(value, meta.tone) }} title={title ?? meta.meaning} {...props} />;
}
