import { cn } from "@/lib/utils";

export interface AuroraProps {
  /**
   * `fixed` (default): the page background, behind everything (z -1). Mount once per page, normally in a layout.
   * `contained`: fills the nearest positioned ancestor (give it `relative isolate`), for a hero or a framed stage.
   */
  variant?: "fixed" | "contained";
  /** `calm` lowers the orbs to 60% for dense data screens (tables, dashboards). */
  intensity?: "full" | "calm";
  /** Set false to freeze the drift (dense screens, or when many glass surfaces are visible). Reduced motion freezes it anyway. */
  drift?: boolean;
  className?: string;
}

/**
 * L0: the aurora. Four soft radial-gradient orbs on the canvas colour (violet, azure, lagoon, rose; pastel in light
 * theme), a 90 s drift (transform only, so it stays on the compositor) and a hint of grain. All numbers live in the
 * tokens (`--fd-aurora*`), so light/dark, Reduce glass and reduced motion need no JS. Server component.
 *
 * Never blur-filter the orbs, never animate their size, one aurora per page (BRAND.md 10). Glass samples it, so keep
 * `opacity`, `filter` and `mask` off every ancestor of the glass (they would break the backdrop).
 */
export function Aurora({ variant = "fixed", intensity = "full", drift = true, className }: AuroraProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("fd-aurora", className)}
      data-variant={variant}
      data-intensity={intensity}
      data-static={drift ? undefined : ""}
    />
  );
}
