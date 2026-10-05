"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Container } from "@/components/shell/container";
import { GlassCard } from "@/components/glass/glass";
import { Button, EmptyState, Skeleton, SkeletonGroup, buttonVariants } from "@/components/ui";

export type PageLoadingShape = "cards" | "split" | "list" | "form";

function HeroSkeleton({ split }: { split: boolean }) {
  return (
    <div className={split ? "grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" : "grid"}>
      <div className="grid content-start gap-5">
        <Skeleton shape="pill" className="h-3.5 w-24" />
        <Skeleton className="h-14 w-full max-w-xl sm:h-20" />
        <Skeleton className="h-14 w-4/5 max-w-lg sm:h-20" />
        <Skeleton shape="text" className="mt-1 w-full max-w-md" />
        <Skeleton shape="text" className="w-3/4 max-w-sm" />
      </div>
      {split ? <Skeleton className="h-72 w-full rounded-[28px]" /> : null}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <GlassCard key={index} padding="md" className="grid gap-4">
          <Skeleton className="size-11 rounded-[14px]" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton shape="text" className="w-full" />
          <Skeleton shape="text" className="w-4/5" />
        </GlassCard>
      ))}
    </div>
  );
}

/**
 * The loading state of a content page: the hero and the body in the shape of the real page (a glass skeleton that stops shimmering under
 * reduced motion), so nothing jumps when the page arrives. The floating nav stays; only the page area is replaced.
 */
export function PageLoading({ shape = "cards", label }: { shape?: PageLoadingShape; label: string }) {
  return (
    <SkeletonGroup label={label}>
      <Container size="wide" className="grid gap-14 pt-10 pb-24 md:pt-16">
        <HeroSkeleton split={shape === "split"} />
        {shape === "list" ? (
          <GlassCard padding="md" className="grid gap-5">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton shape="circle" className="size-10 shrink-0" />
                <Skeleton shape="text" className="w-1/3" />
                <Skeleton shape="text" className="ml-auto w-20" />
              </div>
            ))}
          </GlassCard>
        ) : shape === "form" ? (
          <GlassCard padding="lg" className="grid max-w-xl gap-5">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </GlassCard>
        ) : (
          <CardsSkeleton count={6} />
        )}
      </Container>
    </SkeletonGroup>
  );
}

export interface PageErrorProps {
  error: Error & { digest?: string };
  /** Next 16 passes `retry` (re-fetch and re-render) and `reset` (re-render only). Either works; `retry` is preferred. */
  retry?: () => void;
  reset?: () => void;
  /** What failed to load, in the reader's words: "the live market", "the Trust Center". */
  what: string;
}

/** The error boundary body for a content page: calm, says what happened and what did not change, and offers the retry and a way out. */
export function PageError({ error, retry, reset, what }: PageErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const again = retry ?? reset;
  return (
    <Container size="content" className="py-16 md:py-24">
      <GlassCard padding="lg" role="alert" className="mx-auto max-w-2xl">
        <EmptyState
          art="error"
          title={`We could not load ${what}`}
          description="Nothing on your account changed. Try again in a moment. If it keeps happening, tell us at hello@joinflowd.io and include the reference below."
          action={
            again ? (
              <Button variant="primary" leadingIcon={<RotateCw />} onClick={() => again()}>
                Try again
              </Button>
            ) : undefined
          }
          secondaryAction={
            <Link href="/status" className={buttonVariants({ variant: "ghost" })}>
              Check system status
            </Link>
          }
        />
        {error.digest ? <p className="mt-2 text-center font-mono text-caption text-fg-subtle">Reference {error.digest}</p> : null}
      </GlassCard>
    </Container>
  );
}
