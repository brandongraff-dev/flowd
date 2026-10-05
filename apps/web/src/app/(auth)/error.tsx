"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { GlassCard } from "@/components/glass/glass";
import { Button, EmptyState, buttonVariants } from "@/components/ui";

/** The error boundary of the auth pages: calm, nothing was lost, one retry and a way back to sign in. */
export default function AuthError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const again = retry ?? reset;
  return (
    <GlassCard padding="lg" role="alert" className="mx-auto mt-6 w-full max-w-xl">
      <EmptyState
        art="error"
        title="That page did not load"
        description="Nothing on your account changed. Try again, or go back to sign in. If it keeps happening, email hello@joinflowd.io."
        action={
          again ? (
            <Button variant="primary" leadingIcon={<RotateCw />} onClick={() => again()}>
              Try again
            </Button>
          ) : undefined
        }
        secondaryAction={
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Back to sign in
          </Link>
        }
      />
      {error.digest ? <p className="mt-2 text-center font-mono text-caption text-fg-subtle">Reference {error.digest}</p> : null}
    </GlassCard>
  );
}
