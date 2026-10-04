"use client";

import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Aurora } from "@/components/glass/aurora";

/** iPhone geometry (BRAND.md 13): 11px bezel, 58px outer radius (47px screen radius), 30px Dynamic Island. The screen is 390 x 844 CSS px. */
const BEZEL = 11;
const SCREEN_W = 390;
const SCREEN_H = 844;
const FRAME_W = SCREEN_W + BEZEL * 2;
const FRAME_H = SCREEN_H + BEZEL * 2;

export interface PhoneFrameProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** What is on the screen. Author it at 390 x 844 (an iPhone's logical size); the frame scales it to `width`. */
  children: ReactNode;
  /** Outer width in px (default 280). With `fluid` it is the maximum, and the frame shrinks to fit its container. */
  width?: number;
  fluid?: boolean;
  /** Show the status bar (9:41, signal, battery) and the Dynamic Island. Default true. */
  statusBar?: boolean;
  /** A faint aurora behind the screen content. Turn it off when your screen paints its own background. */
  aurora?: boolean;
  /** Class for the 390 x 844 screen surface (background, padding). */
  screenClassName?: string;
  /** Accessible description of what the mock-up shows. The frame itself is decoration. */
  label?: string;
}

/**
 * An iPhone mock-up built in CSS and SVG (never a screenshot of a real device): a titanium bezel, the Dynamic Island, a
 * status bar, a home indicator and a 390 x 844 screen that you fill with real components and fixture data. The screen is laid
 * out at its true size and scaled as a whole, so text, glass and charts keep their proportions at any width. Marketing and the
 * onboarding explainers use it; the content inside stays interactive only when you want it to (pass `inert` for pure art).
 */
export function PhoneFrame({ children, width = 280, fluid = false, statusBar = true, aurora = true, screenClassName, label, className, style, ...props }: PhoneFrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!fluid) return;
    const node = boxRef.current;
    if (!node) return;
    const read = (): void => setFitted(Math.min(width, Math.round(node.getBoundingClientRect().width)));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fluid, width]);

  const outer = fluid ? (fitted ?? width) : width;
  const scale = outer / FRAME_W;

  return (
    <div
      ref={boxRef}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative", fluid ? "w-full" : "shrink-0", className)}
      style={{ ...(fluid ? { maxWidth: width } : { width }), height: outer * (FRAME_H / FRAME_W), ...style }}
      {...props}
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})` }}>
        {/* titanium body: a deep abyss gradient, a bright outer edge, a dark inner edge */}
        <div
          className="absolute inset-0 rounded-[58px] bg-[linear-gradient(145deg,var(--fd-abyss-600),var(--fd-abyss-800)_38%,var(--fd-abyss-900)_70%,var(--fd-abyss-700))] shadow-[0_0_0_1.5px_rgb(255_255_255/0.22),inset_0_0_0_1.5px_rgb(255_255_255/0.14),0_40px_80px_-24px_rgb(1_4_20/0.7),0_18px_40px_-18px_color-mix(in_oklab,var(--fd-azure-500)_30%,transparent)]"
        />
        {/* side buttons */}
        <span aria-hidden="true" className="absolute top-[132px] -left-[3px] h-9 w-[3px] rounded-l-sm bg-(--fd-abyss-700)" />
        <span aria-hidden="true" className="absolute top-[188px] -left-[3px] h-14 w-[3px] rounded-l-sm bg-(--fd-abyss-700)" />
        <span aria-hidden="true" className="absolute top-[256px] -left-[3px] h-14 w-[3px] rounded-l-sm bg-(--fd-abyss-700)" />
        <span aria-hidden="true" className="absolute top-[200px] -right-[3px] h-24 w-[3px] rounded-r-sm bg-(--fd-abyss-700)" />

        <div
          className={cn("absolute isolate overflow-hidden rounded-[47px] bg-bg text-fg", screenClassName)}
          style={{ left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H }}
        >
          {aurora ? <Aurora variant="contained" drift={false} /> : null}
          <div className="relative size-full">{children}</div>

          {statusBar ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-(--fd-z-raised) flex h-[54px] items-start justify-between px-[34px] pt-[18px] text-fg">
              <span className="font-sans text-[15px] leading-none font-semibold tabular-nums">9:41</span>
              <span className="flex items-center gap-[5px]">
                {/* signal */}
                <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
                  <rect x="0" y="8" width="3" height="4" rx="0.8" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                  <rect x="10" y="3" width="3" height="9" rx="0.8" />
                  <rect x="15" y="0" width="3" height="12" rx="0.8" />
                </svg>
                {/* battery */}
                <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
                  <rect x="0.5" y="0.5" width="22" height="12" rx="3.6" stroke="currentColor" strokeOpacity="0.45" />
                  <rect x="2" y="2" width="16" height="9" rx="2.2" fill="currentColor" />
                  <path d="M24.5 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2Z" fill="currentColor" fillOpacity="0.45" />
                </svg>
              </span>
            </div>
          ) : null}
          {/* Dynamic Island */}
          <div aria-hidden="true" className="pointer-events-none absolute top-[11px] left-1/2 z-(--fd-z-raised) h-[30px] w-[104px] -translate-x-1/2 rounded-full bg-(--fd-abyss-1000) shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" />
          {/* home indicator */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 z-(--fd-z-raised) h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-fg opacity-70" />
        </div>

        {/* a soft diagonal glint across the glass */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[58px] bg-[linear-gradient(120deg,rgb(255_255_255/0.1),transparent_32%)]" />
      </div>
    </div>
  );
}
