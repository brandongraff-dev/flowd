import type { ComponentPropsWithRef, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The eight avatar gradients (BRAND.md 5.6): Flow, Violet, Azure, Lagoon, Rose carry a white label; Money, Sun and Ember
 * carry an ink label. Every end of every pair clears 4.5:1 with its label colour (checked when written; keep it that way).
 * Generated art, so it reads the primitive ramp variables rather than semantic tokens.
 */
const PAIRS: ReadonlyArray<{ from: string; to: string; ink: boolean }> = [
  { from: "--fd-ultraviolet-600", to: "--fd-azure-600", ink: false },
  { from: "--fd-ultraviolet-500", to: "--fd-ultraviolet-700", ink: false },
  { from: "--fd-azure-600", to: "--fd-azure-800", ink: false },
  { from: "--fd-lagoon-700", to: "--fd-lagoon-800", ink: false },
  { from: "--fd-rose-600", to: "--fd-rose-800", ink: false },
  { from: "--fd-mint-400", to: "--fd-lagoon-400", ink: true },
  { from: "--fd-sun-400", to: "--fd-ember-500", ink: true },
  { from: "--fd-ember-400", to: "--fd-rose-400", ink: true },
];

/** FNV-1a: tiny, stable across server and client, so the same handle always gets the same colours. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Two initials from a name or handle: "Maya K" -> MK, "@maya.k" -> MK, "nap_nest" -> NN, "Loafly" -> LO. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^@/, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return (letters || "?").toUpperCase();
}

export interface AvatarProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  /** Display name or handle. Drives the initials and, unless `seed` is set, the colours. */
  name: string;
  /** Colour seed when the name can change (use the stable id: `cr_maya`). */
  seed?: string;
  /** Diameter in px. 24, 32, 40 (default), 56, 80 are the system sizes. */
  size?: number;
  /** `circle` for people, `square` (a 28% rounded square) for brands and apps. Fictional glyphs only, never a real app icon. */
  shape?: "circle" | "square";
  /** `true` when the name is printed right next to the avatar: hides it from assistive tech instead of repeating it. */
  decorative?: boolean;
}

/**
 * Generated avatar: a gradient disc seeded by the handle, two initials in Bricolage 800 at 42% of the diameter, and a
 * 1.5px inner rim. No remote images, no photos, no real people. Initials always clear AA on their gradient.
 */
export function Avatar({ name, seed, size = 40, shape = "circle", decorative = false, className, style, ...props }: AvatarProps) {
  const pair = PAIRS[hash(seed ?? name) % PAIRS.length] ?? PAIRS[0]!;
  const vars = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    borderRadius: shape === "circle" ? "9999px" : `${Math.round(size * 0.28)}px`,
    backgroundImage: `linear-gradient(135deg, var(${pair.from}), var(${pair.to}))`,
    ...style,
  } as CSSProperties;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-grid shrink-0 place-items-center font-display leading-none font-extrabold tracking-[-0.02em] select-none",
        "shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)]",
        pair.ink ? "text-on-mint [text-shadow:none]" : "text-white [text-shadow:0_1px_2px_rgb(1_4_20/0.35)]",
        className,
      )}
      style={vars}
      {...props}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}

export interface AvatarStackProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  people: ReadonlyArray<{ name: string; seed?: string }>;
  /** Avatars shown before the "+N" chip (default 4). */
  max?: number;
  size?: number;
  shape?: "circle" | "square";
}

/** Overlapping avatars with a "+N" overflow chip: crews, submitters, collaborators. The group is labelled with the full list. */
export function AvatarStack({ people, max = 4, size = 32, shape = "circle", className, ...props }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const label = people.map((person) => person.name).join(", ");
  return (
    <div role="group" aria-label={label} className={cn("flex items-center", className)} {...props}>
      {shown.map((person, index) => (
        <Avatar
          key={`${person.seed ?? person.name}-${index}`}
          name={person.name}
          seed={person.seed}
          size={size}
          shape={shape}
          decorative
          className="relative shadow-[0_0_0_2px_var(--fd-bg),inset_0_0_0_1.5px_rgb(255_255_255/0.28)]"
          // earlier avatars sit above later ones, so a later avatar tucks under the previous one and no initials are ever clipped
          style={{ zIndex: shown.length - index, marginLeft: index > 0 ? -Math.round(size * 0.14) : undefined }}
        />
      ))}
      {extra > 0 ? (
        <span
          aria-hidden="true"
          className="relative inline-grid shrink-0 place-items-center bg-surface-raised font-display text-micro font-bold text-fg-muted tabular-nums shadow-[0_0_0_2px_var(--fd-bg),inset_0_0_0_1px_var(--fd-rim)]"
          style={{ width: size, height: size, marginLeft: -Math.round(size * 0.14), zIndex: 0, borderRadius: shape === "circle" ? 9999 : Math.round(size * 0.28) }}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
