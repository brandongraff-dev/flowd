import { GlassCard } from "@/components/glass";
import { Skeleton, SkeletonGroup, SkeletonRow, SkeletonText } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The shape of a PageHeader while data loads: eyebrow, a short title, two lines of description. */
export function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3">
      <Skeleton shape="text" className="h-3 w-24" />
      <Skeleton className="h-10 w-2/3 max-w-sm" />
      <SkeletonText lines={2} className="max-w-[62ch]" />
    </div>
  );
}

/** A glass card holding skeleton lines: the loading shape of a panel. */
export function PanelSkeleton({ lines = 4, className, title = true }: { lines?: number; className?: string; title?: boolean }) {
  return (
    <GlassCard aria-hidden="true" className={cn("grid content-start gap-4", className)}>
      {title ? <Skeleton shape="text" className="h-5 w-1/3" /> : null}
      <SkeletonText lines={lines} />
    </GlassCard>
  );
}

/** A glass card of list rows (avatar, two lines, a figure). */
export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <GlassCard aria-hidden="true" className={cn("grid gap-5", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </GlassCard>
  );
}

export type SocialSkeletonLayout = "list" | "grid" | "split" | "hero";

export interface SocialSkeletonProps {
  /** What is loading, read once by screen readers ("Loading leaderboard"). */
  label: string;
  layout?: SocialSkeletonLayout;
}

/**
 * The loading state of a creator social page: the header, then the shape of the content. Used by every `loading.tsx` and as the
 * Suspense fallback, so the page never jumps when real data arrives.
 */
export function SocialSkeleton({ label, layout = "list" }: SocialSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="grid gap-8">
      <HeaderSkeleton />
      {layout === "hero" ? (
        <>
          <Skeleton className="h-56 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-3">
            <PanelSkeleton lines={3} />
            <PanelSkeleton lines={3} />
            <PanelSkeleton lines={3} />
          </div>
        </>
      ) : null}
      {layout === "list" ? <RowsSkeleton rows={7} /> : null}
      {layout === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <PanelSkeleton key={index} lines={3} />
          ))}
        </div>
      ) : null}
      {layout === "split" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <RowsSkeleton rows={5} />
          <PanelSkeleton lines={9} />
        </div>
      ) : null}
    </SkeletonGroup>
  );
}
