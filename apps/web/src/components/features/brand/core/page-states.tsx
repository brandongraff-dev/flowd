import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonGroup, SkeletonRow } from "@/components/ui/skeleton";

/** The page heading in skeleton form: eyebrow, title, description and one action. */
export function HeaderSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="grid basis-80 gap-3">
        <Skeleton shape="text" className="h-3 w-24" />
        <Skeleton className="h-10 w-3/5 max-w-md" />
        <Skeleton shape="text" className="w-full max-w-xl" />
      </div>
      <Skeleton shape="pill" className="h-11 w-36" />
    </div>
  );
}

/** Four stat tiles in loading form, the same shape as `KpiRow` so nothing jumps when data arrives. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <GlassCard key={index} padding="md" className="grid gap-3">
          <Skeleton shape="text" className="w-1/3" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton shape="text" className="w-1/2" />
          <Skeleton className="h-9 w-full" />
        </GlassCard>
      ))}
    </div>
  );
}

/** A card of list rows in loading form. */
export function ListCardSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <GlassCard padding="md" className={className}>
      <div aria-hidden="true" className="grid gap-5">
        <Skeleton shape="text" className="h-5 w-40" />
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </div>
    </GlassCard>
  );
}

/**
 * The loading shape of a brand page: header, a stat row and two cards. Used by the route group's `loading.tsx` (it shows while a page loads,
 * inside the shell, so the navigation never flashes) and by pages while the demo world is still loading.
 */
export function BrandPageSkeleton({ label = "Loading the page", kpis = true }: { label?: string; kpis?: boolean }) {
  return (
    <SkeletonGroup label={label} className="grid gap-10">
      <HeaderSkeleton />
      {kpis ? <KpiSkeleton /> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ListCardSkeleton rows={4} />
        <ListCardSkeleton rows={3} />
      </div>
    </SkeletonGroup>
  );
}

/**
 * A designed "that does not exist" state for a dynamic route (a bounty, an app or an invoice that is not in this workspace). It says what is
 * missing and offers the way back; it never leaves a blank page.
 */
export function BrandNotFoundState({ title, description, backHref, backLabel, action }: { title: string; description: string; backHref: string; backLabel: string; action?: ReactNode }) {
  return (
    <GlassCard padding="lg" className="mx-auto w-full max-w-2xl">
      <EmptyState
        art="search"
        title={title}
        description={description}
        action={
          <Link href={backHref} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Link>
        }
        secondaryAction={action}
      />
    </GlassCard>
  );
}
