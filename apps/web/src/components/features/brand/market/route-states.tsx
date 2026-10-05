"use client";

import { useEffect } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/glass/glass";
import { Button, EmptyState, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";

export type LoadingShape = "cards" | "table" | "split" | "dashboard" | "form";

function HeaderSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <Skeleton shape="pill" className="h-3.5 w-20" />
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton shape="text" className="w-full max-w-lg" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <GlassCard padding="md" className="grid gap-4">
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" className="size-12" />
        <div className="grid flex-1 gap-2">
          <Skeleton shape="text" className="w-1/2" />
          <Skeleton shape="text" className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="flex gap-2">
        <Skeleton shape="pill" className="h-8 w-24" />
        <Skeleton shape="pill" className="h-8 w-20" />
      </div>
    </GlassCard>
  );
}

function Body({ shape }: { shape: LoadingShape }) {
  if (shape === "cards") {
    return (
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <GlassCard padding="md" className="hidden content-start gap-5 lg:grid">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <Skeleton shape="text" className="h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </GlassCard>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
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
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <GlassCard padding="md" className="grid content-start gap-5">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton shape="circle" className="size-10 shrink-0" />
              <div className="grid flex-1 gap-2">
                <Skeleton shape="text" className="w-3/4" />
                <Skeleton shape="text" className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </GlassCard>
        <GlassCard padding="lg" className="grid content-start gap-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </GlassCard>
      </div>
    );
  }
  if (shape === "dashboard") {
    return (
      <div className="grid gap-6">
        <div className="grid gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <GlassCard key={index} padding="md" className="grid gap-3">
              <Skeleton shape="text" className="w-1/2" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton shape="text" className="w-1/3" />
            </GlassCard>
          ))}
        </div>
        <GlassCard padding="lg">
          <Skeleton className="h-64 w-full" />
        </GlassCard>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      {Array.from({ length: 3 }, (_, index) => (
        <GlassCard key={index} padding="lg" className="grid gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </GlassCard>
      ))}
    </div>
  );
}

/** The loading state of a route: the header and the body in the shape of the real page, so nothing jumps when data arrives. */
export function RouteLoading({ shape, label }: { shape: LoadingShape; label: string }) {
  return (
    <SkeletonGroup label={label} className="grid gap-8">
      <HeaderSkeleton />
      <Body shape={shape} />
    </SkeletonGroup>
  );
}

/** The error boundary body for every route in the Market, setup and developers area. Calm, says nothing changed, offers the retry. */
export function RouteError({ error, retry, reset, area }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void; area: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const again = retry ?? reset;
  return (
    <GlassCard padding="lg" role="alert" className="mx-auto mt-6 w-full max-w-2xl">
      <EmptyState
        art="error"
        title={`${area} didn't load`}
        description="Nothing changed and your data is safe. Try again, and if it keeps happening, reload the page."
        action={
          <Button variant="primary" onClick={() => again?.()}>
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

/** A grid of card skeletons for lists that load inside a page (the header is already on screen). */
export function CardGridSkeleton({ count = 6, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <SkeletonGroup label={label} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </SkeletonGroup>
  );
}
