"use client";

import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./shell.css";

export interface MarqueeProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  children: ReactNode;
  /** Speed in px per second (default 36: slow enough to read a logo, fast enough to feel alive). */
  speed?: number;
  /** Scroll left to right instead of right to left. */
  reverse?: boolean;
  /** Space between items in px (default 20). */
  gap?: number;
  /** Pause while hovered or while anything inside has focus (default true), so a link can be read and clicked. */
  pauseOnHover?: boolean;
  /** Fade the left and right edges instead of cutting items off. */
  fade?: boolean;
}

/**
 * An infinite horizontal marquee for logo rows, proof strips and the payout ticker. The track holds as many identical copies
 * as it takes to fill the width (the extra copies are `aria-hidden` and `inert`), slides by exactly one copy so the loop is
 * seamless, and pauses on hover or focus. Under reduced motion it stops and becomes a plain scrollable row. The animation is
 * a compositor-only transform; nothing re-renders while it runs.
 */
export function Marquee({ children, speed = 36, reverse = false, gap = 20, pauseOnHover = true, fade = true, className, style, ...props }: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ copies: 2, copyWidth: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const copy = copyRef.current;
    if (!container || !copy) return;
    const measure = (): void => {
      const copyWidth = copy.getBoundingClientRect().width;
      if (copyWidth <= 0) return;
      const copies = Math.max(2, Math.ceil(container.getBoundingClientRect().width / copyWidth) + 1);
      setMetrics((previous) => (previous.copies === copies && Math.abs(previous.copyWidth - copyWidth) < 0.5 ? previous : { copies, copyWidth }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [children, gap]);

  const duration = metrics.copyWidth > 0 ? metrics.copyWidth / speed : 40;
  const vars = {
    "--fd-sh-dur": `${duration.toFixed(2)}s`,
    "--fd-sh-shift": metrics.copyWidth > 0 ? `${-metrics.copyWidth}px` : "-50%",
    "--fd-sh-dir": reverse ? "reverse" : "normal",
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      data-pause={pauseOnHover ? "" : undefined}
      className={cn("fd-sh-marquee overflow-hidden", fade && "[mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]", className)}
      style={vars}
      {...props}
    >
      <div className="fd-sh-marquee-track flex w-max">
        {Array.from({ length: metrics.copies }, (_, index) => (
          <div
            key={index}
            ref={index === 0 ? copyRef : undefined}
            aria-hidden={index > 0 ? true : undefined}
            inert={index > 0 ? true : undefined}
            className="fd-sh-marquee-copy flex shrink-0 items-center"
            style={{ gap, paddingRight: gap }}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
