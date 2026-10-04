import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge that knows the flowd theme. Without this it treats `text-figure-hero` / `text-caption` as text COLOURS
 * (any unknown `text-*` is), so `cn("text-caption text-fg-muted")` silently drops the size. The names below are the
 * `--text-*`, `--shadow-*`, `--radius-*` and `--ease-*` keys of the generated tokens (packages/tokens -> tokens.css).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display-2xl",
        "display-xl",
        "display-lg",
        "display-md",
        "display-sm",
        "title-lg",
        "title-md",
        "title-sm",
        "body-lg",
        "body",
        "body-sm",
        "caption",
        "micro",
        "overline",
        "button",
        "figure-hero",
        "figure-xl",
        "figure-lg",
        "figure-md",
        "figure-sm",
        "code",
      ],
      shadow: ["rest", "raised", "float", "overlay", "glow-flow", "glow-mint", "glow-ember", "glow-sun", "glow-violet", "glass", "pop"],
      radius: ["pill"],
      ease: ["standard", "emphasized", "decelerate", "accelerate", "spring-tap", "spring-snappy", "spring-smooth", "spring-sheet", "spring-gentle", "spring-bouncy", "glass", "spring"],
    },
  },
});

/** Merge conditional class names, resolving Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
