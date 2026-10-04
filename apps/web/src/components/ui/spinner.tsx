import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
  /** Pixel size (default 18, the button icon size). */
  size?: number;
  /** Screen-reader text. Omit when the surrounding control already says it is busy. */
  label?: string;
  className?: string;
}

/**
 * Loading indicator. A fast spin (0.8 s) reads as quicker loading. It keeps turning under prefers-reduced-motion
 * (essential, non-vestibular motion; see globals.css). Pair with `aria-busy` on the thing that is loading.
 */
export function Spinner({ size = 18, label, className }: SpinnerProps) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex" aria-hidden={label ? undefined : true}>
      <LoaderCircle aria-hidden="true" width={size} height={size} strokeWidth={2} className={cn("fd-spinner", className)} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
