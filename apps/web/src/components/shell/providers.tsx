"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { AnalyticsBoot } from "@/lib/analytics/analytics-boot";
import { StoreHydrator } from "@/lib/store/hydrator";
import { AppToaster } from "./app-toaster";
import { ThemeProvider } from "./theme-provider";

/** Client-side providers for the whole app. Mounted once in src/app/layout.tsx. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* "user": every motion component drops transform/layout animation when the OS asks for reduced motion */}
      <MotionConfig reducedMotion="user">
        {children}
        <AppToaster />
        {/* Analytics is the no-op adapter unless the environment configures one; Do Not Track switches it off either way. */}
        <AnalyticsBoot />
        {/* The demo store: renders nothing; data hooks (and dashboard layouts with `eager`) load the demo world and apply the saved demo on the client. */}
        <StoreHydrator />
      </MotionConfig>
    </ThemeProvider>
  );
}
