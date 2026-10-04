"use client";

import { useEffect, useRef, type ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

/** Primitive-ramp variables for the pieces. Resolved at fire time, so the burst follows the active theme and never hard-codes a colour. */
const DEFAULT_COLORS = ["--fd-mint-400", "--fd-lagoon-400", "--fd-sun-400", "--fd-azure-400", "--fd-ultraviolet-400"] as const;

export interface ConfettiBurstProps extends Omit<ComponentPropsWithRef<"canvas">, "width" | "height"> {
  /** Fires one burst each time this number changes (increment it). 0 does nothing. */
  fire: number;
  /** Where the burst starts, as fractions of the canvas (default centre, a little above the middle). */
  origin?: { x: number; y: number };
  /** Number of pieces (default 64: the design-ux spec says 60). */
  count?: number;
  /** Custom property names of the colours (default: mint, lagoon, sun, azure, ultraviolet). */
  colors?: readonly string[];
  /** `container` fills the nearest positioned ancestor, `viewport` covers the screen (a full celebration). */
  mode?: "container" | "viewport";
  /** Called once the last piece has faded. */
  onDone?: () => void;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  w: number;
  h: number;
  round: boolean;
  color: string;
}

const GRAVITY = 1400;
const DURATION_MS = 1900;

/**
 * Confetti for creator earned outcomes ONLY: cleared money, approvals, tier-ups (DECISIONS section 5: asymmetric delight; funding,
 * bidding and spending get calm confirmations, never this). A one-shot canvas particle burst: about 64 mint, lagoon and
 * sun pieces fired up and out, pulled down by gravity, faded over 1.9 s. It does nothing under reduced motion (the figure's
 * own mint wash carries the moment instead), cleans up its frame loop, and never blocks input (`pointer-events: none`).
 *
 * ```tsx
 * const [burst, setBurst] = useState(0);
 * <div className="relative"><ConfettiBurst fire={burst} /> ... <Button onClick={() => setBurst((n) => n + 1)} /></div>
 * ```
 */
export function ConfettiBurst({ fire, origin = { x: 0.5, y: 0.42 }, count = 64, colors = DEFAULT_COLORS, mode = "container", onDone, className, ...props }: ConfettiBurstProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || fire <= 0 || reduced) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    context.scale(ratio, ratio);

    const style = getComputedStyle(canvas);
    const palette = colors.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
    const fallback = style.color || "currentColor";
    const ox = box.width * origin.x;
    const oy = box.height * origin.y;
    const pieces: Piece[] = Array.from({ length: count }, (_, index) => {
      // a fan biased upward, wide enough to read as a bloom
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const speed = 380 + Math.random() * 560;
      const round = index % 4 === 0;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 14,
        w: round ? 6 + Math.random() * 4 : 9 + Math.random() * 6,
        h: round ? 6 + Math.random() * 4 : 4.5 + Math.random() * 3,
        round,
        color: palette[index % Math.max(palette.length, 1)] ?? fallback,
      };
    });

    let frame = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.034);
      last = now;
      const elapsed = now - start;
      context.clearRect(0, 0, box.width, box.height);
      const fadeStart = DURATION_MS * 0.55;
      const alpha = elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (DURATION_MS - fadeStart));
      for (const piece of pieces) {
        piece.vx *= Math.pow(0.12, dt);
        piece.vy = piece.vy * Math.pow(0.18, dt) + GRAVITY * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.rotation += piece.spin * dt;
        context.save();
        context.globalAlpha = alpha;
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        if (piece.round) {
          context.beginPath();
          context.arc(0, 0, piece.w / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        }
        context.restore();
      }
      if (elapsed < DURATION_MS) {
        frame = window.requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, box.width, box.height);
        doneRef.current?.();
      }
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [fire, reduced, count, colors, origin.x, origin.y]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("pointer-events-none z-(--fd-z-toast)", mode === "viewport" ? "fixed inset-0 size-full" : "absolute inset-0 size-full", className)}
      {...props}
    />
  );
}
