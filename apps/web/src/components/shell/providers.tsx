"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
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
      </MotionConfig>
    </ThemeProvider>
  );
}
