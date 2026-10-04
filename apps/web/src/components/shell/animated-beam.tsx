"use client";

import { useEffect, useId, useState, type ComponentPropsWithRef, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/utils";
import "./shell.css";

export interface AnimatedBeamProps {
  /** The positioned element both nodes live in (give it `relative`). The beam is drawn over it. */
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** Bend of the curve in px: positive bows up, negative down, 0 is straight. */
  curvature?: number;
  /** Travel from `to` to `from` instead. */
  reverse?: boolean;
  /** Seconds for one pass (default 3.2). */
  duration?: number;
  /** Seconds before the first pass, to stagger several beams. */
  delay?: number;
  /** Pulse colour: the Flow gradient (views, attention) or mint (money). */
  tone?: "flow" | "mint";
  className?: string;
}

interface Geometry {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

/**
 * A beam between two elements: a hairline path with a short bright pulse travelling along it, for marketing diagrams
 * ("brands, flowd, creators": money one way, views the other). It measures the nodes and re-measures when anything resizes,
 * the pulse is a compositor-friendly dash-offset animation, and under reduced motion only the static hairline remains.
 * Decorative: `aria-hidden`, the diagram's meaning must also be in its text.
 */
export function AnimatedBeam({ containerRef, fromRef, toRef, curvature = 0, reverse = false, duration = 3.2, delay = 0, tone = "flow", className }: AnimatedBeamProps) {
  const uid = `fd-beam-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!container || !from || !to) return;
    const measure = (): void => {
      const box = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.left - box.left + a.width / 2;
      const y1 = a.top - box.top + a.height / 2;
      const x2 = b.left - box.left + b.width / 2;
      const y2 = b.top - box.top + b.height / 2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 - curvature;
      setGeometry({ d: `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, x1, y1, x2, y2, width: box.width, height: box.height });
    };
    // Effects run after every ref in the tree is attached (a layout effect can run before the parent's ref exists), and the first
    // measurement waits one frame so fonts and layout have settled.
    const frame = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") return () => window.cancelAnimationFrame(frame);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(from);
    observer.observe(to);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerRef, fromRef, toRef, curvature]);

  if (!geometry) return null;
  const vars = { "--fd-sh-beam-dur": `${duration}s`, "--fd-sh-beam-delay": `${delay}s` } as CSSProperties;
  return (
    <svg aria-hidden="true" focusable="false" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} className={cn("pointer-events-none absolute inset-0 overflow-visible", className)} fill="none" style={vars}>
      <defs>
        <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2}>
          {tone === "mint" ? (
            <>
              <stop offset="0" stopColor="var(--fd-mint-500)" stopOpacity={0} />
              <stop offset="0.5" stopColor="var(--fd-mint-400)" />
              <stop offset="1" stopColor="var(--fd-lagoon-400)" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="var(--fd-ultraviolet-500)" />
              <stop offset="0.52" stopColor="var(--fd-azure-500)" />
              <stop offset="1" stopColor="var(--fd-lagoon-500)" />
            </>
          )}
        </linearGradient>
      </defs>
      <path d={geometry.d} stroke="var(--fd-rim-strong)" strokeWidth={1.5} strokeLinecap="round" />
      <path
        d={geometry.d}
        pathLength={1000}
        stroke={`url(#${uid})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        className="fd-sh-beam-pulse"
        style={reverse ? { animationDirection: "reverse" } : undefined}
      />
    </svg>
  );
}

export interface FlowLinesProps extends Omit<ComponentPropsWithRef<"svg">, "children"> {
  /** Number of lines (default 3). */
  lines?: number;
  tone?: "flow" | "mint";
}

/**
 * Decorative flow lines for marketing sections: a few long, soft curves with a slow pulse each, in the Flow gradient (or
 * mint for money sections). Absolute and `aria-hidden`; place it behind a hero or between sections. Static under reduced motion.
 */
export function FlowLines({ lines = 3, tone = "flow", className, ...props }: FlowLinesProps) {
  const uid = `fd-flow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 1200 400" preserveAspectRatio="none" className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", className)} fill="none" {...props}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="0">
          {tone === "mint" ? (
            <>
              <stop offset="0" stopColor="var(--fd-mint-500)" stopOpacity={0} />
              <stop offset="0.5" stopColor="var(--fd-mint-400)" stopOpacity={0.9} />
              <stop offset="1" stopColor="var(--fd-lagoon-400)" stopOpacity={0} />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="var(--fd-ultraviolet-500)" stopOpacity={0} />
              <stop offset="0.5" stopColor="var(--fd-azure-500)" stopOpacity={0.9} />
              <stop offset="1" stopColor="var(--fd-lagoon-500)" stopOpacity={0} />
            </>
          )}
        </linearGradient>
      </defs>
      {Array.from({ length: lines }, (_, index) => {
        const offset = (index - (lines - 1) / 2) * 70;
        const d = `M-40 ${200 + offset} C 260 ${40 + offset * 0.4}, 520 ${360 + offset * 0.2}, 820 ${190 + offset * 0.6} S 1140 ${130 + offset}, 1260 ${210 + offset}`;
        return (
          <g key={index} style={{ "--fd-sh-beam-dur": `${6 + index * 1.4}s`, "--fd-sh-beam-delay": `${index * 0.8}s` } as CSSProperties}>
            <path d={d} stroke="var(--fd-rim)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            <path d={d} pathLength={1000} stroke={`url(#${uid})`} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="fd-sh-beam-pulse" style={{ strokeDasharray: "260 740" }} />
          </g>
        );
      })}
    </svg>
  );
}
