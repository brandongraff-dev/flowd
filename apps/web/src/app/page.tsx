import { ThemeSwitch } from "@/components/shell/theme-switch";

// Scaffold page. The marketing agent replaces it: add src/app/(marketing)/page.tsx and delete this file
// (two pages cannot resolve to "/").

const SWATCHES = [
  { name: "mint", note: "money up", className: "bg-mint" },
  { name: "ember", note: "urgency", className: "bg-ember" },
  { name: "sun", note: "elite", className: "bg-sun" },
  { name: "rose", note: "alert", className: "bg-rose" },
] as const;

export default function ScaffoldPage() {
  return (
    <main id="main" className="relative isolate grid min-h-dvh place-items-center px-4 py-16">
      {/* L0: aurora orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[radial-gradient(closest-side,var(--aurora-a),transparent)]" />
        <div className="absolute top-1/3 -right-40 size-[38rem] rounded-full bg-[radial-gradient(closest-side,var(--aurora-b),transparent)]" />
        <div className="absolute -bottom-52 left-1/4 size-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--aurora-c),transparent)]" />
      </div>

      {/* L1: glass card */}
      <section className="w-full max-w-xl rounded-3xl border border-rim bg-(--glass-tint) p-8 [box-shadow:var(--glass-highlight),var(--elev-glass)] backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-sat) sm:p-10">
        <p className="inline-flex items-center gap-2 rounded-full border border-rim px-3 py-1 text-xs font-medium tracking-wide text-fg-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-lagoon" />
          Web platform scaffold
        </p>

        <h1 className="mt-6 bg-(image:--gradient-flow) bg-clip-text pb-2 text-7xl leading-none font-semibold tracking-tight text-transparent sm:text-8xl">
          flowd
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-fg-muted">
          Next.js 16, Tailwind v4, Radix and Motion are wired up. Pages from every area land here next; this screen is
          replaced by the landing page.
        </p>

        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rim bg-surface p-4">
            <dt className="text-xs text-fg-subtle">Cleared</dt>
            <dd className="mt-1 font-mono text-2xl font-medium text-mint tabular-nums">$12,480.50</dd>
          </div>
          <div className="rounded-xl border border-rim bg-surface p-4">
            <dt className="text-xs text-fg-subtle">Pending</dt>
            <dd className="mt-1 font-mono text-2xl font-medium text-fg-muted tabular-nums">$3,214.00</dd>
          </div>
        </dl>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Semantic colours">
          {SWATCHES.map((swatch) => (
            <li
              key={swatch.name}
              className="inline-flex items-center gap-2 rounded-full border border-rim bg-surface py-1.5 pr-3 pl-2 text-xs text-fg-muted"
            >
              <span aria-hidden className={`size-3 rounded-full ${swatch.className}`} />
              <span className="font-medium text-fg">{swatch.name}</span>
              {swatch.note}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-5 border-t border-rim pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span className="font-display text-fg">Bricolage</span>
            <span className="font-sans text-fg">Geist</span>
            <span className="font-mono text-fg">Geist Mono</span>
          </p>
          <ThemeSwitch className="self-start" />
        </div>
      </section>
    </main>
  );
}
