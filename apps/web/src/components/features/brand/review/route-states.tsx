"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonGroup, SkeletonRow } from "@/components/ui/skeleton";

export type LoadingShape = "queue" | "focus" | "dashboard" | "table" | "cards" | "split";

function HeaderSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <Skeleton shape="pill" className="h-3.5 w-20" />
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton shape="text" className="w-full max-w-lg" />
    </div>
  );
}

function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <GlassCard key={index} padding="md" className="grid gap-3">
          <Skeleton shape="text" className="w-1/2" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton shape="text" className="h-3 w-1/3" />
        </GlassCard>
      ))}
    </div>
  );
}

function Body({ shape }: { shape: LoadingShape }) {
  if (shape === "queue") {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
        <GlassCard padding="md">
          <div className="grid gap-6">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </GlassCard>
        <GlassCard padding="md" className="hidden lg:block">
          <Skeleton className="mx-auto aspect-[9/16] w-52 rounded-3xl" />
        </GlassCard>
      </div>
    );
  }
  if (shape === "focus") {
    return (
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <GlassCard padding="md" className="grid content-start gap-4">
          <Skeleton className="mx-auto aspect-[9/16] w-56 rounded-3xl" />
          <Skeleton className="h-11 w-full" />
        </GlassCard>
        <div className="grid content-start gap-4">
          <GlassCard padding="lg" className="grid gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-28 w-full" />
          </GlassCard>
          <GlassCard padding="lg" className="grid gap-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full" />
          </GlassCard>
        </div>
      </div>
    );
  }
  if (shape === "dashboard") {
    return (
      <div className="grid gap-6">
        <StatRowSkeleton />
        <GlassCard padding="lg">
          <Skeleton className="h-64 w-full" />
        </GlassCard>
      </div>
    );
  }
  if (shape === "table") {
    return (
      <GlassCard padding="none" className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-divider p-4">
          <Skeleton className="h-10 w-64 max-w-full" />
          <Skeleton shape="pill" className="h-9 w-24" />
        </div>
        <div className="grid gap-5 p-4">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex items-center gap-3.5">
              <Skeleton shape="circle" className="size-10 shrink-0" />
              <Skeleton shape="text" className="w-1/4" />
              <Skeleton shape="text" className="hidden w-1/6 md:block" />
              <Skeleton shape="text" className="ml-auto w-16" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }
  if (shape === "split") {
    return (
      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <GlassCard padding="md" className="grid content-start gap-5">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonRow key={index} />
          ))}
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-5">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </GlassCard>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <GlassCard key={index} padding="md" className="grid gap-4">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton shape="text" className="w-2/3" />
          <Skeleton shape="text" className="h-3 w-1/2" />
        </GlassCard>
      ))}
    </div>
  );
}

/** The loading state of a route in this area: the header and a body in the shape of the real page, so nothing jumps when data arrives. */
export function RouteLoading({ shape, label, header = true }: { shape: LoadingShape; label: string; header?: boolean }) {
  return (
    <SkeletonGroup label={label} className="grid gap-8">
      {header ? <HeaderSkeleton /> : null}
      <Body shape={shape} />
    </SkeletonGroup>
  );
}

/** A route's error boundary body: calm, says nothing changed (failed actions change nothing), offers the retry and a way out. */
export function RouteError({ error, retry, reset, area }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void; area: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const again = retry ?? reset;
  return (
    <GlassCard padding="lg" className="mx-auto mt-6 w-full max-w-2xl">
      <EmptyState
        art="error"
        announce="alert"
        title={`${area} did not load`}
        description="Nothing was changed and no money moved. Try again, and if it keeps happening, reload the page."
        action={
          <Button variant="primary" leadingIcon={<RotateCcw aria-hidden="true" />} onClick={() => again?.()}>
            Try again
          </Button>
        }
        secondaryAction={
          <Link href="/brand" className={buttonVariants({ variant: "ghost" })}>
            Back to overview
          </Link>
        }
      />
      {error.digest ? <p className="mt-2 text-center font-mono text-micro text-fg-subtle">ref {error.digest}</p> : null}
    </GlassCard>
  );
}
