"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The error boundary body of the brand dashboard. It renders inside the shell, so the navigation is still there; the person gets a plain
 * sentence, one way to retry and one way out. Money is never the thing that broke: failed actions change nothing, so it says so.
 */
export function BrandErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassCard padding="lg" className="mx-auto w-full max-w-2xl">
      <EmptyState
        art="error"
        announce="alert"
        title="This page did not load"
        description="Nothing was changed and no money moved. Try again, and if it keeps happening, reload the page."
        action={
          <Button variant="primary" leadingIcon={<RotateCcw aria-hidden="true" />} onClick={reset}>
            Try again
          </Button>
        }
        secondaryAction={
          <Link href="/brand" className={buttonVariants({ variant: "ghost", size: "md" })}>
            Back to overview
          </Link>
        }
      />
      {error.digest ? <p className="text-center font-mono text-caption text-fg-subtle">ref {error.digest}</p> : null}
    </GlassCard>
  );
}
