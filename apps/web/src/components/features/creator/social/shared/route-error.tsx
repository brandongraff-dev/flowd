"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";

export interface SocialRouteErrorProps {
  error: Error & { digest?: string };
  /** Next 16.3: re-fetch and re-render the segment. */
  retry: () => void;
  /** The page's name, for the headline ("Leaderboard"). */
  area: string;
}

/**
 * The shared body of every `error.tsx` in the creator social surfaces. Calm and specific: say what failed, that nothing is lost,
 * and offer the one next step. No stack traces, no blame.
 */
export function SocialRouteError({ error, retry, area }: SocialRouteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-10">
      <EmptyState
        art="error"
        announce="alert"
        title={`${area} didn't load`}
        description="Your money and your work are safe. Try again, and if it keeps happening, reload the page."
        action={
          <Button variant="primary" onClick={retry}>
            Try again
          </Button>
        }
        secondaryAction={
          <Button asChild variant="ghost">
            <Link href="/creator">Back to home</Link>
          </Button>
        }
      />
      {error.digest ? <p className="mt-2 text-center font-mono text-code text-fg-subtle">ref {error.digest}</p> : null}
    </div>
  );
}
