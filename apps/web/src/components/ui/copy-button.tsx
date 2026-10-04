"use client";

import type { ComponentPropsWithRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconSwap } from "@/lib/motion";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { Button, type ButtonProps } from "./button";
import { IconButton, type IconButtonProps } from "./icon-button";

/** Copy -> check swap: scale 0.25 to 1, opacity 0 to 1, blur 4px to 0, spring with no bounce (BRAND.md 11). */
function SwapIcon({ state }: { state: "idle" | "copied" | "failed" }) {
  const Icon = state === "copied" ? Check : state === "failed" ? TriangleAlert : Copy;
  return (
    <span className="relative grid size-[18px] place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={state}
          initial={iconSwap.initial}
          animate={iconSwap.animate}
          exit={iconSwap.exit}
          transition={iconSwap.transition}
          className={cn("absolute inset-0 grid place-items-center", state === "copied" && "text-mint", state === "failed" && "text-rose")}
        >
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface CopyCommon {
  /** The text that lands on the clipboard. */
  value: string;
  /** Idle label, also the tooltip / accessible name. Default "Copy". */
  label?: string;
  copiedLabel?: string;
  /** Called after a successful copy. */
  onCopied?: (value: string) => void;
}

export interface CopyIconButtonProps extends CopyCommon, Omit<IconButtonProps, "label" | "icon" | "onClick" | "tooltip" | "value"> {}

/**
 * Icon-only copy button. The icon swaps to a mint check for 1.8 s and the accessible name and tooltip change to "Copied"
 * (announced politely). Falls back to a hidden textarea where the async clipboard is blocked, and says so on failure.
 */
export function CopyIconButton({ value, label = "Copy", copiedLabel = "Copied", onCopied, variant = "plain", size = "sm", ...props }: CopyIconButtonProps) {
  const { copied, failed, copy } = useCopyToClipboard();
  const state = copied ? "copied" : failed ? "failed" : "idle";
  const current = copied ? copiedLabel : failed ? "Couldn't copy. Select and copy manually." : label;
  return (
    <>
      <IconButton
        label={current}
        icon={<SwapIcon state={state} />}
        variant={variant}
        size={size}
        onClick={async () => {
          if (await copy(value)) onCopied?.(value);
        }}
        {...props}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}

export interface CopyButtonProps extends CopyCommon, Omit<ButtonProps, "onClick" | "children" | "leadingIcon" | "trailingIcon" | "asChild" | "loading" | "value"> {}

/** Text copy button ("Copy link" becomes "Copied"). Same behaviour as `CopyIconButton`, for places with room for words. */
export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", onCopied, variant = "secondary", size = "sm", ...props }: CopyButtonProps) {
  const { copied, failed, copy } = useCopyToClipboard();
  const state = copied ? "copied" : failed ? "failed" : "idle";
  return (
    <>
      <Button
        variant={variant}
        size={size}
        leadingIcon={<SwapIcon state={state} />}
        onClick={async () => {
          if (await copy(value)) onCopied?.(value);
        }}
        {...props}
      >
        {copied ? copiedLabel : failed ? "Copy failed" : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}

export interface CopyFieldProps extends CopyCommon, Omit<ComponentPropsWithRef<"div">, "children"> {
  /** What the value is, read before it ("Short link"). Required for screen readers: the value alone is not a label. */
  "aria-label": string;
}

/**
 * A read-only value in a mono chip with a copy button: short links (`joinflowd.io/c/maya`), codes (`MAYA10`),
 * tracking URLs, API keys. Mono is for IDs and codes only; money never uses it.
 */
export function CopyField({ value, label = "Copy", copiedLabel = "Copied", onCopied, className, "aria-label": ariaLabel, ...props }: CopyFieldProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("fd-field flex min-h-11 items-center gap-1 rounded-lg py-1 pr-1 pl-3.5", className)}
      {...props}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-code text-fg select-all" title={value}>
        {value}
      </code>
      <CopyIconButton value={value} label={label} copiedLabel={copiedLabel} onCopied={onCopied} />
    </div>
  );
}
