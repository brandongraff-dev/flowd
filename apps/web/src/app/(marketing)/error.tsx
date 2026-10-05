"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Container } from "@/components/shell/container";
import { EmptyState } from "@/components/ui/empty-state";

interface MarketingErrorProps {
  error: Error & { digest?: string };
  /** Next 16 re-fetches and re-renders the segment. */
  retry?: () => void;
  /** Older boundary API: clears the error without re-fetching. */
  reset?: () => void;
}

/** The marketing group's error boundary: the header and footer stay, the page says what happened and offers a way forward. */
export default function MarketingError({ error, retry, reset }: MarketingErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container size="content" className="py-24">
      <EmptyState
        art="error"
        size="lg"
        announce="alert"
        headingAs="h1"
        title="This page did not load"
        description="Nothing you did caused this, and no money moved. Try again, or head back to the home page."
        action={
          <Button variant="primary" onClick={() => (retry ?? reset)?.()}>
            Try again
          </Button>
        }
        secondaryAction={
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Back to home
          </Link>
        }
      />
      {error.digest ? <p className="mt-2 text-center font-mono text-code text-fg-subtle">ref {error.digest}</p> : null}
    </Container>
  );
}
