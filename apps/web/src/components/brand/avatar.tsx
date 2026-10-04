import type { ComponentPropsWithRef, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/components/ui/avatar";
import { inkAlphaForWhiteText, type ArtSeed } from "./art";
import { ArtSurface } from "./art-surface";

export interface ArtAvatarProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** The person's or brand's generated `avatar` seed. Its `label` is the initials. */
  art: ArtSeed;
  /** Display name or handle: read by assistive tech, and the source of the initials when the seed has no label. */
  name: string;
  /** Diameter in px. 24, 32, 40 (default), 56, 80 are the system sizes. */
  size?: number;
  /** `circle` for people, `square` (a 28% rounded square) for brands and apps. */
  shape?: "circle" | "square";
  /** `true` when the name is printed right next to the avatar. */
  decorative?: boolean;
}

/**
 * Avatar drawn from an ArtSeed (orbs or rings), with two initials in Bricolage 800 at 42% of the diameter and a 1.5px inner
 * rim. The initials sit on an ink scrim sized per seed so they clear AA on any hue. Use this whenever the data carries an
 * `avatar: ArtSeed`; use `Avatar` from `@/components/ui` when you only have a name.
 */
export function ArtAvatar({ art, name, size = 40, shape = "circle", decorative = false, className, style, ...props }: ArtAvatarProps) {
  const initials = (art.label && art.label.length <= 3 ? art.label : initialsOf(name)).toUpperCase();
  const ink = inkAlphaForWhiteText(art);
  const vars = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    borderRadius: shape === "circle" ? "9999px" : `${Math.round(size * 0.28)}px`,
    ...style,
  } as CSSProperties;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden font-display leading-none font-extrabold tracking-[-0.02em] text-white select-none", className)}
      style={vars}
      {...props}
    >
      <ArtSurface art={art} aspect="1:1" className="absolute inset-0 block size-full" />
      {ink > 0 ? (
        <span aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(closest-side, rgb(1 4 20 / ${Math.min(ink + 0.06, 0.85)}), rgb(1 4 20 / ${(ink * 0.4).toFixed(2)}))` }} />
      ) : null}
      <span aria-hidden="true" className="relative [text-shadow:0_1px_3px_rgb(1_4_20/0.45)]">
        {initials}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)]" style={{ borderRadius: "inherit" }} />
    </span>
  );
}

export interface ArtAvatarStackProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  people: ReadonlyArray<{ name: string; art: ArtSeed }>;
  /** Avatars shown before the "+N" chip (default 4). */
  max?: number;
  size?: number;
  shape?: "circle" | "square";
}

/** Overlapping ArtAvatars with a "+N" chip: crews, submitters, collaborators. The group is labelled with the full list of names. */
export function ArtAvatarStack({ people, max = 4, size = 32, shape = "circle", className, ...props }: ArtAvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const overlap = Math.round(size * 0.14);
  return (
    <div role="group" aria-label={people.map((person) => person.name).join(", ")} className={cn("flex items-center", className)} {...props}>
      {shown.map((person, index) => (
        <ArtAvatar
          key={`${person.art.seed}-${index}`}
          art={person.art}
          name={person.name}
          size={size}
          shape={shape}
          decorative
          className="shadow-[0_0_0_2px_var(--fd-bg)]"
          // earlier avatars sit above later ones, so a later avatar tucks under the previous one and no initials are clipped
          style={{ zIndex: shown.length - index, marginLeft: index > 0 ? -overlap : undefined }}
        />
      ))}
      {extra > 0 ? (
        <span
          aria-hidden="true"
          className="relative inline-grid shrink-0 place-items-center bg-surface-raised font-display text-micro font-bold text-fg-muted tabular-nums shadow-[0_0_0_2px_var(--fd-bg),inset_0_0_0_1px_var(--fd-rim)]"
          style={{ width: size, height: size, marginLeft: -overlap, zIndex: 0, borderRadius: shape === "circle" ? 9999 : Math.round(size * 0.28) }}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
