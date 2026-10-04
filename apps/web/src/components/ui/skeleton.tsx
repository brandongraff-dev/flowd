import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

const SHAPE = {
  rect: "",
  text: "h-3.5 rounded-md",
  circle: "rounded-full",
  pill: "rounded-pill",
} as const;

export interface SkeletonProps extends ComponentPropsWithRef<"div"> {
  /** `rect` (default, 12px radius), `text` (a 14px line), `circle` (avatars) or `pill` (buttons, chips). Size it with classes. */
  shape?: keyof typeof SHAPE;
}

/**
 * Loading placeholder: a dim fill with a highlight band that sweeps across like light catching glass. The sweep is a
 * transform-only animation and stops under reduced motion (the fill stays, so the shape still reads).
 * Decorative: wrap a group in <SkeletonGroup> so assistive tech hears "Loading" once.
 */
export function Skeleton({ shape = "rect", className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("fd-skeleton", SHAPE[shape], className)} {...props} />;
}

export interface SkeletonTextProps extends ComponentPropsWithRef<"div"> {
  /** Number of lines (default 3). The last line is shorter, like real text. */
  lines?: number;
}

/** A paragraph of skeleton lines. */
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn("grid gap-2.5", className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} shape="text" className={index === lines - 1 && lines > 1 ? "w-3/5" : "w-full"} />
      ))}
    </div>
  );
}

export interface SkeletonGroupProps extends ComponentPropsWithRef<"div"> {
  /** What is loading, read once by screen readers ("Loading bounties"). */
  label?: string;
  children: ReactNode;
}

/** Marks a region as busy and announces `label` politely. Put the skeletons inside; swap the region for real content when ready. */
export function SkeletonGroup({ label = "Loading", className, children, ...props }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" className={className} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A list-row skeleton (avatar, two lines, trailing amount): the loading shape of bounty, submission and ledger rows. */
export function SkeletonRow({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-3.5", className)} {...props}>
      <Skeleton shape="circle" className="size-11 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-2">
        <Skeleton shape="text" className="w-2/5" />
        <Skeleton shape="text" className="h-3 w-3/4" />
      </div>
      <Skeleton shape="text" className="h-5 w-14 shrink-0" />
    </div>
  );
}
