import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="relative isolate grid min-h-dvh place-items-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--aurora-a),transparent)]" />
      </div>

      <section className="w-full max-w-md rounded-3xl border border-rim bg-(--glass-tint) p-8 text-center [box-shadow:var(--glass-highlight),var(--elev-glass)] backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-sat)">
        <p className="font-mono text-sm tracking-widest text-fg-subtle">404</p>
        <h1 className="mt-3 text-4xl leading-tight font-semibold">This page isn&apos;t in the flow.</h1>
        <p className="mt-3 text-base text-fg-muted">
          The link may be old, or the page moved. Head back home and pick up from there.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-(image:--gradient-flow) px-6 text-sm font-semibold text-fg-on-accent transition-transform duration-200 ease-glass hover:-translate-y-0.5 active:translate-y-0"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
