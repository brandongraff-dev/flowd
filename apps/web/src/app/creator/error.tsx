"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, EmptyState, buttonVariants } from "@/components/ui";

/** The creator portal's error boundary: a calm card, the plain fact that money is safe, and a way back. The shell stays around it. */
export default function CreatorError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      announce="alert"
      art="error"
      headingAs="h1"
      title="This page didn't load"
      description={
        <>
          Your earnings and videos are safe. Try again, and if it keeps happening, go back to Home.
          {error.digest ? <span className="mt-2 block font-mono text-code text-fg-subtle">ref {error.digest}</span> : null}
        </>
      }
      action={
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
      }
      secondaryAction={
        <Link href="/creator" className={buttonVariants({ variant: "ghost" })}>
          Back to Home
        </Link>
      }
    />
  );
}
