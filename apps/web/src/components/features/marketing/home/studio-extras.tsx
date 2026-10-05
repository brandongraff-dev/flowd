import Link from "next/link";
import { ArrowRight, Camera, FlipHorizontal2, Import, ShieldCheck, Smartphone, Sparkles, Wand2 } from "lucide-react";
import { ArtSurface } from "@/components/brand/art-surface";
import type { ArtSeed } from "@/components/brand/art";
import { Glass, GlassCard, GlassPill } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import type { FormatRow } from "./data";

const DIFFICULTY_TONE = { easy: "mint", medium: "info", hard: "ember" } as const;

/** The 11 formats as a library peek: the shape of each video as a row of beats, one sample hook, and honest provenance. */
export function FormatLibrary({ formats }: { formats: FormatRow[] }) {
  return (
    <div className="grid gap-5">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {formats.map((format) => {
          const tone = DIFFICULTY_TONE[format.difficulty as keyof typeof DIFFICULTY_TONE] ?? "neutral";
          return (
            <li key={format.id}>
              <GlassCard padding="none" className="grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-[28px]">
                <div className="relative h-28 overflow-hidden">
                  <ArtSurface art={format.art} aspect="16:9" className="absolute inset-0 block size-full" aria-hidden="true" />
                  <div aria-hidden="true" className="fd-media-scrim absolute inset-0" />
                  <p className="absolute inset-x-5 bottom-3 font-display text-title-sm text-white">{format.name}</p>
                  <span className="absolute top-3 left-4 rounded-pill bg-black/45 px-2.5 py-1 text-micro font-semibold text-white tabular-nums">#{format.rank}</span>
                </div>
                <div className="grid content-start gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" tone={tone}>
                      {format.difficulty}
                    </Badge>
                    <Badge size="sm" tone="neutral" variant="outline">
                      {format.minSeconds} to {format.maxSeconds} s
                    </Badge>
                    {format.faceless ? (
                      <Badge size="sm" tone="neutral" variant="outline">
                        Faceless
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-body-sm text-pretty text-fg-muted">{format.summary}</p>
                  <ol className="flex flex-wrap items-center gap-1.5 text-micro text-fg-subtle" aria-label="Beats">
                    {format.beats.map((beat, index) => (
                      <li key={beat} className="flex items-center gap-1.5">
                        {index > 0 ? <span aria-hidden="true">/</span> : null}
                        <span>{beat}</span>
                      </li>
                    ))}
                  </ol>
                  {format.sampleHook ? (
                    <p className="rounded-xl bg-surface-field px-3 py-2 text-caption text-fg shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                      <span className="text-fg-subtle">Sample hook: </span>
                      &ldquo;{format.sampleHook}&rdquo;
                    </p>
                  ) : null}
                </div>
              </GlassCard>
            </li>
          );
        })}
      </ul>
      <p className="text-caption max-w-[78ch] text-fg-subtle">
        The starting library is a hypothesis, built from the formats that app creators reported using in 2026. Formats are ranked by how they did in the demo bounties, and real results are published as real bounties settle. Sample hooks use fictional
        apps.
      </p>
    </div>
  );
}

const ART: ArtSeed = { hue_a: 252, hue_b: 214, hue_c: 176, pattern: "waves", seed: 9171 };

/** What Studio looks like in Liquid Glass: three controls floating over a generated scene, honest about which iOS versions get the real material. */
export function GlassPreview() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
      <div className="relative isolate overflow-hidden rounded-[32px] shadow-float" aria-hidden="true">
        <div className="relative h-[22rem] sm:h-[26rem]">
          <ArtSurface art={ART} aspect="16:9" className="absolute inset-0 block size-full" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(2_5_16/0.15),rgb(2_5_16/0.5))]" />
          <GlassPill className="absolute top-6 left-6">
            <Sparkles className="size-4 text-violet" strokeWidth={2} />
            Hook Score B
          </GlassPill>
          <GlassPill className="absolute top-6 right-6" tint="mint">
            <ShieldCheck className="size-4 text-mint" strokeWidth={2} />
            Funded
          </GlassPill>
          <Glass layer={2} className="absolute inset-x-6 bottom-6 mx-auto flex max-w-sm items-center justify-between rounded-pill px-6 py-3">
            <span className="grid size-11 place-items-center rounded-full bg-surface-field text-fg">
              <FlipHorizontal2 className="size-5" strokeWidth={1.75} />
            </span>
            <span className="grid size-14 place-items-center rounded-full bg-rose-solid text-on-rose">
              <Camera className="size-6" strokeWidth={2} />
            </span>
            <span className="grid size-11 place-items-center rounded-full bg-surface-field text-fg">
              <Wand2 className="size-5" strokeWidth={1.75} />
            </span>
          </Glass>
        </div>
      </div>
      <div className="grid gap-4">
        <h3 className="text-title-lg text-fg">Made for iOS 26, kind to iOS 17.</h3>
        <p className="text-body text-pretty text-fg-muted">
          On iOS 26 the controls use the system&apos;s Liquid Glass, which bends the scene behind it. On iOS 17 to 25 the same layout uses Apple&apos;s materials instead. Text always sits on a surface that passes AA contrast, and Reduce Transparency turns glass into solid,
          high-contrast fills.
        </p>
        <p className="text-caption text-fg-subtle">A generated scene, not a screenshot.</p>
      </div>
    </div>
  );
}

const EXTRAS = [
  { icon: Smartphone, title: "On your phone", body: "The Hook coach reads your first seconds on the device with Apple's Vision framework, offline. Your video leaves the phone only when you submit it." },
  { icon: Import, title: "Bring your own edit", body: "Import from your camera roll or from CapCut, then run the same checks: hook, disclosure, music, safe zones." },
  { icon: ShieldCheck, title: "Checked like the brand checks", body: "The pre-flight runs the same compliance checks the brand's review runs, so a missing disclosure is caught before it costs you a day." },
] as const;

export function StudioExtras() {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {EXTRAS.map((item) => (
        <li key={item.title}>
          <GlassCard padding="lg" className="grid h-full content-start gap-3 rounded-[28px]">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
              <item.icon />
            </span>
            <h3 className="text-title-sm text-fg">{item.title}</h3>
            <p className="text-body-sm text-pretty text-fg-muted">{item.body}</p>
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}

/** The honest note under the Hook Score, with the free tool as the next step. */
export function ChecklistNote() {
  return (
    <GlassCard padding="lg" className="grid gap-5 rounded-[32px] lg:grid-cols-[minmax(0,1.3fr)_auto] lg:items-center lg:gap-12">
      <div className="grid gap-2">
        <h3 className="text-title-md text-fg">A checklist score, and we say so.</h3>
        <p className="text-body text-pretty text-fg-muted">
          Today Hook Score and Flow Score are checklists built from what winning app videos share: the hook lands by 2.0 seconds, the same words are on screen within a second, a face or a screen is in frame, and the app is visible by 0:03. They explain each point and offer a
          fix. They do not predict views, and they will only earn a learned score as bounties settle.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/tools/hook-score" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Try Hook Score free
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </GlassCard>
  );
}
