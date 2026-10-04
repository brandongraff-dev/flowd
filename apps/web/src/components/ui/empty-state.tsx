import type { ComponentPropsWithRef, CSSProperties, ElementType, ReactNode } from "react";
import {
  CloudOff,
  FileVideo,
  Inbox,
  LineChart,
  Lock,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  WalletMinimal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Glass } from "@/components/glass/glass";

export type EmptyArtName = "inbox" | "search" | "wallet" | "video" | "bounty" | "chart" | "locked" | "offline" | "error" | "flo";

interface ArtSpec {
  icon: LucideIcon;
  /** Primitive ramp variables for the three halo orbs and the satellites (generated art: tokens, never hex). */
  halo: readonly [string, string, string];
  /** Colour of the glyph on the tile (a text-safe token). */
  glyph: string;
}

const ART: Record<EmptyArtName, ArtSpec> = {
  inbox: { icon: Inbox, halo: ["--fd-ultraviolet-500", "--fd-azure-500", "--fd-lagoon-500"], glyph: "text-accent" },
  search: { icon: Search, halo: ["--fd-azure-500", "--fd-lagoon-500", "--fd-ultraviolet-500"], glyph: "text-accent" },
  wallet: { icon: WalletMinimal, halo: ["--fd-mint-500", "--fd-lagoon-500", "--fd-azure-500"], glyph: "text-mint" },
  video: { icon: FileVideo, halo: ["--fd-ultraviolet-500", "--fd-rose-500", "--fd-azure-500"], glyph: "text-violet" },
  bounty: { icon: Target, halo: ["--fd-azure-500", "--fd-ultraviolet-500", "--fd-lagoon-500"], glyph: "text-accent" },
  chart: { icon: LineChart, halo: ["--fd-lagoon-500", "--fd-azure-500", "--fd-ultraviolet-500"], glyph: "text-info" },
  locked: { icon: Lock, halo: ["--fd-sun-500", "--fd-ember-500", "--fd-rose-500"], glyph: "text-sun" },
  offline: { icon: CloudOff, halo: ["--fd-abyss-500", "--fd-azure-500", "--fd-lagoon-500"], glyph: "text-fg-muted" },
  error: { icon: ShieldAlert, halo: ["--fd-rose-500", "--fd-ember-500", "--fd-ultraviolet-500"], glyph: "text-rose" },
  flo: { icon: Sparkles, halo: ["--fd-ultraviolet-400", "--fd-ultraviolet-600", "--fd-azure-500"], glyph: "text-violet" },
};

export interface EmptyArtProps {
  /** Which illustration. The glyph and the halo colours follow the meaning (mint = money, rose = problem, violet = Flo). */
  name?: EmptyArtName;
  /** Replace the glyph with your own icon (lucide, sized by the tile). */
  icon?: ReactNode;
  /** `md` = the brand-board 92px tile; `sm` = 64px for table cells and small panels; `lg` = 120px. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TILE = { sm: 64, md: 92, lg: 120 } as const;

/**
 * Generated illustration for empty, error and zero states: a glass tile (28px radius, 40px glyph at stroke 1.6) over a
 * soft three-orb halo with an orbiting ring and two floating satellites. All CSS and SVG: no images, no fonts.
 * The tile is real L2 glass on the aurora and flattens to a fill when it sits inside a card (glass never samples glass).
 */
export function EmptyArt({ name = "inbox", icon, size = "md", className }: EmptyArtProps) {
  const spec = ART[name];
  const Icon = spec.icon;
  const tile = TILE[size];
  const box = Math.round(tile * 1.55);
  const [a, b, c] = spec.halo;
  return (
    <div aria-hidden="true" className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: box, height: box }}>
      {/* halo: three soft orbs behind the tile (gradients only, never blur-filtered) */}
      <span
        className="absolute inset-0 rounded-full opacity-90"
        style={{
          background: `radial-gradient(closest-side at 34% 38%, color-mix(in oklab, var(${a}) 38%, transparent), transparent 70%), radial-gradient(closest-side at 70% 36%, color-mix(in oklab, var(${b}) 30%, transparent), transparent 72%), radial-gradient(closest-side at 54% 74%, color-mix(in oklab, var(${c}) 26%, transparent), transparent 70%)`,
        }}
      />
      {/* orbit ring with a satellite on it */}
      <span className="fd-orbit absolute inset-[6%] rounded-full border border-dashed border-rim" style={{ "--fd-orbit-dur": "48s" } as CSSProperties}>
        <span className="absolute top-[8%] left-[14%] size-2 rounded-full" style={{ background: `var(${b})` }} />
      </span>
      <span className="fd-float absolute right-[7%] bottom-[16%] size-3.5 rounded-full shadow-rest" style={{ background: `var(${c})`, "--fd-float-delay": "-2s" } as CSSProperties} />
      <span className="fd-float absolute top-[14%] left-[10%] size-2.5 rounded-full" style={{ background: `var(${a})`, "--fd-float-delay": "-4s", "--fd-float-dur": "9s" } as CSSProperties} />
      <Glass layer={2} radius={Math.round(tile * 0.3)} className={cn("fd-float relative grid place-items-center", spec.glyph)} style={{ width: tile, height: tile }}>
        <span className="grid place-items-center [&_svg]:stroke-[1.6]" style={{ "--s": `${Math.round(tile * 0.435)}px` } as CSSProperties}>
          {icon ?? <Icon aria-hidden="true" className="size-(--s)" />}
        </span>
      </Glass>
    </div>
  );
}

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  /** Illustration name, or your own element. */
  art?: EmptyArtName | ReactNode;
  /** One line, in the voice of the product: say what is missing and why it is fine. */
  title: ReactNode;
  /** One sentence: the reason and what to do next. Never apologise twice. */
  description?: ReactNode;
  /** The primary next step (a `<Button variant="primary">`). */
  action?: ReactNode;
  /** A quieter alternative (a ghost button or link). */
  secondaryAction?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Heading element for the title (default h3: empty states live inside a section). */
  headingAs?: ElementType;
  /** Announce to assistive tech: `alert` for errors, `status` for results that just became empty. */
  announce?: "alert" | "status";
}

/**
 * Designed empty / zero / error state: art, a one-line headline, a one-line reason and a primary action. Never blank
 * (CONVENTIONS section 2.8). Centered, max 28rem copy, tabbable actions only.
 *
 * ```tsx
 * <EmptyState art="wallet" title="No earnings yet" description="Your first approved video clears 72 hours after it posts."
 *   action={<Button variant="primary">Browse bounties</Button>} />
 * ```
 */
export function EmptyState({
  art = "inbox",
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  headingAs: Heading = "h3",
  announce,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role={announce}
      className={cn("mx-auto flex w-full max-w-md flex-col items-center text-center", size === "sm" ? "gap-4 py-6" : "gap-5 py-10", className)}
      {...props}
    >
      {typeof art === "string" ? <EmptyArt name={art as EmptyArtName} size={size} /> : art}
      <div className="grid gap-1.5">
        <Heading className={cn("font-display text-fg", size === "sm" ? "text-title-sm" : "text-title-md")}>{title}</Heading>
        {description ? <p className="mx-auto max-w-[34ch] text-body-sm text-fg-muted">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
