import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export type PlatformKey = "tiktok" | "instagram" | "youtube" | "meta";

interface PlatformSpec {
  name: string;
  /** Two-letter text mark. Generic on purpose: no trademarked logo, shape or colour (CONVENTIONS section 1). */
  mark: string;
}

const PLATFORMS: Record<PlatformKey, PlatformSpec> = {
  tiktok: { name: "TikTok", mark: "TT" },
  instagram: { name: "Instagram", mark: "IG" },
  youtube: { name: "YouTube", mark: "YT" },
  meta: { name: "Meta", mark: "Mt" },
};

/** Display name of a platform ("TikTok"). */
export function platformName(platform: PlatformKey): string {
  return PLATFORMS[platform].name;
}

export interface PlatformGlyphProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  platform: PlatformKey;
  /** Edge in px (default 24). */
  size?: number;
  /** `true` when the platform name is printed next to the glyph. */
  decorative?: boolean;
}

/**
 * A generic platform mark: a rounded tile with the platform's two-letter text mark in neutral ink. The letters carry the
 * identity (never the colour), so the glyph is safe next to colour-blind-safe series colours and never imitates a logo.
 */
export function PlatformGlyph({ platform, size = 24, decorative = false, className, style, ...props }: PlatformGlyphProps) {
  const spec = PLATFORMS[platform];
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : spec.name}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-grid shrink-0 place-items-center bg-surface-active font-sans leading-none font-bold tracking-[-0.01em] text-fg-muted select-none shadow-[inset_0_0_0_1px_var(--fd-rim)]",
        className,
      )}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.max(10, Math.round(size * 0.42)), ...style }}
      {...props}
    >
      <span aria-hidden="true">{spec.mark}</span>
    </span>
  );
}

export interface PlatformLabelProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  platform: PlatformKey;
  size?: number;
}

/** Glyph plus the platform name as text: the form to use in tables and chips. */
export function PlatformLabel({ platform, size = 20, className, ...props }: PlatformLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-body-sm font-medium text-fg", className)} {...props}>
      <PlatformGlyph platform={platform} size={size} decorative />
      {PLATFORMS[platform].name}
    </span>
  );
}
