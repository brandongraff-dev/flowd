"use client";

import { useEffect } from "react";

/** Root error boundary. Route groups with data add their own error.tsx; this is the safety net. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-16">
      <section
        role="alert"
        className="w-full max-w-md rounded-3xl border border-rim bg-(--glass-tint) p-8 text-center [box-shadow:var(--glass-highlight),var(--elev-glass)] backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-sat)"
      >
        <p className="font-mono text-sm tracking-widest text-rose">Error</p>
        <h1 className="mt-3 text-4xl leading-tight font-semibold">Something slipped.</h1>
        <p className="mt-3 text-base text-fg-muted">
          That one is on us. Your data is safe. Try again, and if it keeps happening, reload the page.
        </p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-fg-subtle">ref {error.digest}</p> : null}
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-(image:--gradient-flow) px-6 text-sm font-semibold text-fg-on-accent transition-transform duration-200 ease-glass hover:-translate-y-0.5 active:translate-y-0"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
