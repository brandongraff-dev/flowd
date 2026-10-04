import type { ComponentPropsWithRef, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/components/ui/avatar";
import { inkAlphaForWhiteText, type ArtSeed } from "./art";
import { ArtSurface } from "./art-surface";

export interface AppIconProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** The app's generated icon seed (`icon` on an App). Never a real app icon. */
  art: ArtSeed;
  /** App name: read by assistive tech, and the source of the glyph when the seed has no label. */
  name: string;
  /** Edge in px. 20, 24, 32, 40 (default), 56, 80 are the system sizes. */
  size?: number;
  /** `true` when the name is printed next to the icon: hides it from assistive tech instead of repeating it. */
  decorative?: boolean;
}

/**
 * Generated app icon: a rounded-square tile of the seed's gradient and pattern (grid or spark for apps) with one glyph in
 * Bricolage 800 and a 1.5px inner rim. The glyph sits on an ink scrim sized so white clears AA on this particular art.
 * Fictional glyphs only: demo apps never borrow a real app icon (CONVENTIONS section 1).
 */
export function AppIcon({ art, name, size = 40, decorative = false, className, style, ...props }: AppIconProps) {
  const glyph = (art.label && art.label.length <= 2 ? art.label : initialsOf(name).slice(0, size >= 56 ? 2 : 1)).toUpperCase();
  const ink = inkAlphaForWhiteText(art);
  const vars = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.27),
    fontSize: Math.max(10, Math.round(size * (glyph.length > 1 ? 0.38 : 0.5))),
    ...style,
  } as CSSProperties;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden font-display leading-none font-extrabold tracking-[-0.03em] text-white select-none", className)}
      style={vars}
      {...props}
    >
      <ArtSurface art={art} aspect="1:1" className="absolute inset-0 block size-full" />
      {ink > 0 ? (
        <span aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(closest-side, rgb(1 4 20 / ${Math.min(ink + 0.08, 0.85)}), rgb(1 4 20 / ${(ink * 0.55).toFixed(2)}))` }} />
      ) : null}
      <span aria-hidden="true" className="relative [text-shadow:0_1px_3px_rgb(1_4_20/0.4)]">
        {glyph}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.26),inset_0_1px_0_rgb(255_255_255/0.3)]"
        style={{ borderRadius: "inherit" }}
      />
    </span>
  );
}
