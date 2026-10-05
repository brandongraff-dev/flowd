"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// The WebGL aurora is loaded as its own chunk and only after the first paint: the CSS aurora in the layout is what the visitor sees first
// (and keeps seeing without WebGL, under Reduce glass or on a lost context).
const AuroraShader = dynamic(() => import("@/components/glass/aurora-shader").then((module) => module.AuroraShader), { ssr: false });

/**
 * The hero's living background. Mounts the shader one idle moment after first paint; the shader itself pauses off-screen and in a hidden tab, draws a
 * single still frame under reduced motion and hands the pixels back to the CSS aurora when WebGL is missing. The mask dissolves its lower edge into the
 * page aurora, so there is no seam where the hero ends.
 */
export function HeroAurora() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let handle = 0;
    const start = (): void => setMounted(true);
    const frame = window.requestAnimationFrame(() => {
      handle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(start, { timeout: 1200 }) : window.setTimeout(start, 400);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
      window.clearTimeout(handle);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 [mask-image:linear-gradient(to_bottom,#000_58%,transparent_100%)]">
      {mounted ? <AuroraShader variant="contained" fps={30} quality={0.5} /> : null}
    </div>
  );
}
