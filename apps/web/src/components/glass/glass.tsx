"use client";

import {
  createElement,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ElementType,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { useMergedRef } from "@/lib/hooks/use-merged-ref";
import { usePointerSheen } from "@/lib/hooks/use-pointer-sheen";
import { useReduceGlass } from "@/lib/hooks/use-reduce-glass";
import { GlassNestingProvider, useGlassNesting, type GlassLayer } from "./glass-context";
import { GlassDefs } from "./lens/glass-defs";
import { useLiquidLens, type LensOptions } from "./lens/use-liquid-lens";

export type { GlassLayer } from "./glass-context";
export type { LensOptions } from "./lens/use-liquid-lens";

/** Colour wash for the glass itself. Tint the glass, never the label; tint only the primary action. */
export type GlassTint = "none" | "accent" | "flow" | "violet" | "mint" | "ember" | "sun" | "rose" | "info";

export type GlassTag = "div" | "section" | "article" | "aside" | "nav" | "header" | "footer" | "ul" | "ol" | "li" | "form" | "span" | "figure";

export interface GlassProps extends Omit<ComponentPropsWithRef<"div">, "color"> {
  /**
   * 1 = quiet content glass (cards, panels; low blur, high fill, always AA).
   * 2 = floating controls (nav, tab bar, toolbars, pills, toasts): real glass.
   * 3 = sheets, modals, popovers: thick real glass.
   * Glass never samples glass: inside another `<Glass>` this renders as a fill (`data-flat`).
   */
  layer?: GlassLayer;
  /** Colour wash over the fill. */
  tint?: GlassTint;
  /** Pointer-tracking sheen and rim hot spot. L2/L3 only; mouse only; off under reduced motion. */
  interactive?: boolean;
  /**
   * Chromium-only SVG refraction lens. L2/L3 hero surfaces only (wallet hero card, Daily Drop, marketing hero); at most 3
   * per page (extra ones stay plain glass). Keep text at least `bezel` px (default 28) from the edges. Ignored with `asChild`.
   */
  lens?: boolean | LensOptions;
  /** Heavier fill for surfaces over media or generated thumbnails (instead of less blur). */
  media?: boolean;
  /** Clear glass (L2 only): ONLY over media-rich content under large bold content, never body text. */
  clear?: boolean;
  /** Corner radius in px. Prefer a `rounded-*` class when it is a token; this exists for computed radii. */
  radius?: number;
  /** Semantic element to render (`nav`, `header`, `section`...). */
  as?: GlassTag;
  /** Render the glass onto the single child (a link or button) instead of a wrapper element. */
  asChild?: boolean;
  /** Overlays rendered in a portal (popover, dialog) are separate floating layers: ignore the React ancestor's glass. */
  portal?: boolean;
  /** Smaller shadow and lighter blur, for tooltips. */
  compact?: boolean;
}

/**
 * The Liquid Glass material. Use the presets (`GlassCard`, `GlassBar`, `GlassPill`, `GlassPanel`) in feature code and
 * this component for anything bespoke.
 *
 * Anatomy (bottom to top): backdrop blur + saturate, tint, sheen, fill (the legibility scrim), inset highlight and
 * lowlight, 1px specular rim, soft coloured shadow. All values come from `--fd-glass-*` tokens, so Reduce glass,
 * increased contrast, forced colours and both themes are handled in CSS (see styles/glass.css).
 */
export function Glass({
  layer = 1,
  tint = "none",
  interactive = false,
  lens = false,
  media = false,
  clear = false,
  radius,
  as = "div",
  asChild = false,
  portal = false,
  compact = false,
  className,
  style,
  ref,
  onPointerEnter,
  onPointerMove,
  children,
  ...rest
}: GlassProps) {
  const parent = useGlassNesting();
  const flat = !portal && parent > 0;
  const { reduced } = useReduceGlass();

  const sheenEnabled = interactive && layer >= 2 && !flat;
  const sheen = usePointerSheen<HTMLElement>(sheenEnabled);
  const mergedRef = useMergedRef<HTMLElement>(sheen.ref, ref as Ref<HTMLElement> | undefined);

  const lensEnabled = Boolean(lens) && layer >= 2 && !flat && !reduced && !asChild;
  const lensState = useLiquidLens(sheen.ref, lensEnabled, typeof lens === "object" ? lens : undefined);

  const vars: Record<string, string> = {};
  if (radius !== undefined) vars["--glass-radius"] = `${radius}px`;
  if (lensState) vars["--glass-lens"] = `url(#${lensState.id})`;

  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>): void => {
    onPointerEnter?.(event);
    if (sheenEnabled) sheen.onPointerEnter(event);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    onPointerMove?.(event);
    if (sheenEnabled) sheen.onPointerMove(event);
  };

  const props = {
    ...rest,
    ref: mergedRef,
    className: cn("glass", className),
    style: { ...vars, ...style } as CSSProperties,
    "data-layer": layer,
    "data-tint": tint === "none" ? undefined : tint,
    "data-interactive": sheenEnabled ? "" : undefined,
    "data-media": media ? "" : undefined,
    "data-clear": clear && layer === 2 ? "" : undefined,
    "data-flat": flat ? "" : undefined,
    "data-compact": compact ? "" : undefined,
    "data-lens": lensState ? "" : undefined,
    onPointerEnter: handlePointerEnter,
    onPointerMove: handlePointerMove,
  };

  const content = asChild ? (
    <Slot {...props}>{children}</Slot>
  ) : (
    createElement(as as ElementType, props, lensState ? <GlassDefs key="defs" id={lensState.id} maps={lensState.maps} /> : null, children)
  );

  // A flat (nested) glass keeps the ancestor's layer, so everything below it stays flat too.
  return <GlassNestingProvider value={flat ? parent : layer}>{content}</GlassNestingProvider>;
}

/* ---------------------------------------------------------------------------------------------------------- */

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6 sm:p-8",
} as const;

export type GlassPadding = keyof typeof PADDING;

export interface GlassCardProps extends Omit<GlassProps, "layer" | "lens" | "clear" | "compact"> {
  /** Inner padding. A 28px card with `md` (20px) padding holds an 8px inner radius (concentric: child = parent - padding). */
  padding?: GlassPadding;
}

/**
 * L1 quiet glass: the content surface (cards, panels, list groups). Low blur, high ink fill, hairline rim, soft shadow.
 * Holds content, not controls. Inside it use fills (`bg-surface-field`), not more glass.
 */
export function GlassCard({ padding = "md", className, ...props }: GlassCardProps) {
  return <Glass layer={1} className={cn(PADDING[padding], className)} {...props} />;
}

export interface GlassPanelProps extends Omit<GlassProps, "layer" | "clear"> {
  padding?: GlassPadding;
}

/**
 * L3 thick glass: sheets, modals, popovers and docked panels. Pair with a scrim when it is modal (Dialog and Sheet do).
 * Content inside uses fills (`surface-field`), not more glass. Radius 36 by default (rounded-3xl).
 */
export function GlassPanel({ padding = "md", className, portal, ...props }: GlassPanelProps) {
  return <Glass layer={3} portal={portal} className={cn(PADDING[padding], className)} {...props} />;
}

export interface GlassBarProps extends Omit<GlassProps, "layer" | "clear"> {
  /**
   * `inline` sits in the flow. `top` / `bottom` float fixed with a 12px gutter (safe-area aware), centred, max content width:
   * the marketing header, the dashboard bottom bar below 768px.
   */
  placement?: "inline" | "top" | "bottom";
}

/**
 * L2 floating bar: navigation, tab bar, toolbar. Pill-shaped real glass with pointer sheen. Never put another L2/L3
 * inside it (it would flatten); put fills inside it instead.
 */
export function GlassBar({ placement = "inline", interactive = true, as = "div", className, ...props }: GlassBarProps) {
  return (
    <Glass
      layer={2}
      as={as}
      interactive={interactive}
      className={cn(
        placement === "top" && "fixed inset-x-3 top-3 z-(--fd-z-nav) mx-auto max-w-(--fd-content-max)",
        placement === "bottom" && "pb-safe fixed inset-x-3 bottom-3 z-(--fd-z-nav) mx-auto max-w-(--fd-content-max)",
        className,
      )}
      {...props}
    />
  );
}

export interface GlassPillProps extends Omit<GlassProps, "layer" | "clear" | "lens"> {
  size?: "sm" | "md";
}

/**
 * L2 pill: a small floating chip over content or media ("Daily Drop 02:14:09", a score, a status). 32px (sm: 28px).
 * Tint it to signal a single state; the label stays `fg`.
 */
export function GlassPill({ size = "md", className, ...props }: GlassPillProps) {
  return (
    <Glass
      layer={2}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 text-caption font-semibold whitespace-nowrap",
        size === "md" ? "h-8" : "h-7 px-3 text-micro",
        className,
      )}
      {...props}
    />
  );
}

export interface MediaScrimProps extends ComponentPropsWithRef<"div"> {
  /** Tailwind classes for placement; the gradient itself is fixed (80% ink at the bottom to 0). */
  className?: string;
}

/**
 * The mandatory scrim under any text that sits on generated thumbnails or media (BRAND.md 6.6): 80% ink at the bottom
 * fading to 0. Place it absolutely inside the media, below the text.
 */
export function MediaScrim({ className, ...props }: MediaScrimProps) {
  return <div aria-hidden="true" className={cn("fd-media-scrim pointer-events-none absolute inset-0", className)} {...props} />;
}
