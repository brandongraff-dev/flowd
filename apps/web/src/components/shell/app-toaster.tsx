"use client";

import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

// Sonner reads these variables; values are semantic tokens so toasts follow both themes.
// The scrim keeps text at AA contrast over the blurred layer behind it.
const scrim = "color-mix(in oklab, var(--surface-solid) 78%, transparent)";

const toasterStyle = {
  "--normal-bg": scrim,
  "--normal-border": "var(--rim)",
  "--normal-text": "var(--fg)",
  "--success-bg": scrim,
  "--success-border": "color-mix(in oklab, var(--mint) 55%, transparent)",
  "--success-text": "var(--fg)",
  "--error-bg": scrim,
  "--error-border": "color-mix(in oklab, var(--rose) 55%, transparent)",
  "--error-text": "var(--fg)",
  "--warning-bg": scrim,
  "--warning-border": "color-mix(in oklab, var(--sun) 55%, transparent)",
  "--warning-text": "var(--fg)",
  "--info-bg": scrim,
  "--info-border": "color-mix(in oklab, var(--azure) 55%, transparent)",
  "--info-text": "var(--fg)",
  "--border-radius": "16px",
} as CSSProperties;

/** Global toast host. Fire toasts anywhere with `import { toast } from "sonner"`. */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      position="top-center"
      offset={16}
      mobileOffset={12}
      visibleToasts={4}
      closeButton
      style={toasterStyle}
      toastOptions={{ duration: 4000 }}
    />
  );
}
