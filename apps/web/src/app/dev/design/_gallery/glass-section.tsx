"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, Camera, House, Target, WalletMinimal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Aurora,
  AuroraShader,
  Glass,
  GlassBar,
  GlassCard,
  GlassPanel,
  GlassPill,
  LiquidLens,
  MediaScrim,
  ReduceGlassSwitch,
  supportsSvgBackdropFilter,
  useReduceGlass,
  type GlassTint,
} from "@/components/glass";
import { Badge, Button, Field, Input, Money, ProgressRing, SegmentedControl } from "@/components/ui";
import { Code, Cols, Panel, Row, Section } from "./kit";

const TINTS: ReadonlyArray<{ tint: GlassTint; label: string }> = [
  { tint: "none", label: "Plain" },
  { tint: "accent", label: "Accent" },
  { tint: "flow", label: "Flow" },
  { tint: "violet", label: "Flo" },
  { tint: "mint", label: "Cleared" },
  { tint: "info", label: "Pending" },
  { tint: "ember", label: "Daily Drop" },
  { tint: "sun", label: "Featured" },
  { tint: "rose", label: "Alert" },
];

const TABS = [
  { id: "home", label: "Home", Icon: House },
  { id: "bounties", label: "Bounties", Icon: Target },
  { id: "studio", label: "Studio", Icon: Camera },
  { id: "wallet", label: "Wallet", Icon: WalletMinimal },
  { id: "inbox", label: "Inbox", Icon: Bell },
] as const;

function subscribeNever(): () => void {
  return () => {};
}

export function GlassSection() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("home");
  const lensCapable = useSyncExternalStore(subscribeNever, supportsSvgBackdropFilter, () => false);
  const { app, system, reduced } = useReduceGlass();

  return (
    <Section
      id="glass"
      eyebrow="Material"
      title="Glass is a material, not decoration."
      description="Three layers over a living aurora. L1 holds content (quiet glass: low blur, high fill, always AA), L2 floats controls, L3 is for sheets. Glass never samples glass, and every layer has a solid fallback."
    >
      {/* ---- Stage A: the three layers over the aurora ---- */}
      <div className="relative isolate overflow-hidden rounded-[36px] p-4 sm:p-10">
        <Aurora variant="contained" drift={false} />
        <div className="relative grid gap-6 lg:grid-cols-[1.08fr_1fr] lg:items-start">
          <div className="relative pb-9">
            <GlassCard padding="lg" className="grid gap-4">
              <p className="fd-eyebrow text-fg-subtle">L1 · Content surface</p>
              <h3 className="font-display text-title-md text-fg">Wind-down routine hook</h3>
              <p className="max-w-[44ch] text-body-sm text-fg-muted">
                Rate $2.40 per 1,000 views plus $1.50 per trial started. 68% of the pool is left and 6 days remain.
              </p>
              <div className="flex items-center gap-5 pt-1 pb-10">
                <ProgressRing value={68} tone="mint" aria-label="Pool left" valueText="68% of the pool left" size={76}>
                  <span className="text-body-sm">68%</span>
                </ProgressRing>
                <div className="grid gap-1">
                  <Money cents={240} size="lg" />
                  <span className="text-caption text-fg-subtle">per 1,000 verified views</span>
                </div>
              </div>
            </GlassCard>
            {/* L2 floating over L1: a sibling, not a child, so both stay real glass */}
            <GlassBar interactive className="absolute right-4 bottom-0 left-4 flex items-center gap-3 py-2 pr-2 pl-3">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-mint-solid text-on-mint">
                <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5 6.6 11.5 12.5 4.8" />
                </svg>
              </span>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-body-sm font-semibold text-fg">L2 · Floating control</span>
                <span className="truncate text-caption text-fg-muted">Checklist score A. Gets smarter as bounties settle.</span>
              </div>
              <Button size="sm" variant="primary">
                Apply
              </Button>
            </GlassBar>
          </div>

          <GlassPanel padding="lg" className="grid gap-5">
            <div className="grid gap-1.5">
              <p className="fd-eyebrow text-fg-subtle">L3 · Sheet (thick)</p>
              <h3 className="font-display text-title-lg text-fg">Fund this bounty</h3>
            </div>
            <Field label="Pool budget" hint="Escrowed before the bounty goes live.">
              <Input inputMode="decimal" leading="$" defaultValue="5,000" />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost">Cancel</Button>
              <Button variant="primary">Fund $5,000</Button>
            </div>
          </GlassPanel>
        </div>

        <GlassBar interactive className="relative mx-auto mt-7 flex w-fit max-w-full gap-1 overflow-x-auto p-1.5" aria-label="L2 tab bar" as="nav">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              className={cn(
                "flex min-h-14 min-w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-pill px-3 text-micro font-semibold transition-[background-color,color,transform] duration-(--fd-dur-fast) ease-standard active:scale-[0.96]",
                tab === id ? "bg-surface-active text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </GlassBar>
        <p className="relative mt-3 text-center text-caption text-fg-muted">The active tab is a flat fill, not a third glass layer.</p>
      </div>

      {/* ---- Stage B: tints, media, clear ---- */}
      <div className="relative isolate overflow-hidden rounded-[36px] p-4 sm:p-10">
        <Aurora variant="contained" drift={false} />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-6">
            <div className="grid gap-1.5">
              <h3 className="font-display text-title-md text-fg">Tint the glass, never the label</h3>
              <p className="max-w-[56ch] text-body-sm text-fg-muted">
                A colour wash says one thing at a glance. The label stays <Code>fg</Code>, which is why every tint clears AA over the brightest orb.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {TINTS.map(({ tint, label }) => (
                <GlassPill key={tint} tint={tint}>
                  {label}
                </GlassPill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <GlassPill size="sm" interactive>
                Small · 28px
              </GlassPill>
              <GlassPill interactive>Medium · 32px</GlassPill>
              <GlassPill interactive tint="ember">
                Daily Drop · 02:14:09
              </GlassPill>
            </div>
          </div>

          {/* generated thumbnail: media glass and clear glass sit on a scrim, text never on raw art */}
          <div className="relative mx-auto aspect-[9/16] w-52 overflow-hidden rounded-[28px] bg-(image:--fd-gradient-flow) shadow-float">
            <div aria-hidden="true" className="absolute -top-8 -right-10 size-44 rounded-full bg-(image:--fd-gradient-money) opacity-60" />
            <MediaScrim />
            <p className="absolute inset-x-4 bottom-16 font-display text-[30px] leading-[0.95] font-extrabold tracking-[-0.03em] text-white [text-shadow:0_2px_12px_rgb(1_4_20/0.5)]">
              Stop scrolling if you sleep badly
            </p>
            <GlassPill media size="sm" className="absolute top-3 left-3">
              Nap Nest
            </GlassPill>
            <Glass layer={2} clear className="absolute right-3 bottom-3 left-3 flex h-10 items-center justify-center text-body-sm font-bold">
              Hook Score: Strong
            </Glass>
          </div>
        </div>
      </div>

      <Cols>
        <Panel title="Glass never samples glass" note="Rule: max two layers in a region; inside glass use fills.">
          <div className="grid gap-3">
            <p className="text-body-sm text-fg-muted">
              This card is L1. The <Code>{"<Glass layer={2}>"}</Code> inside it renders as a fill with a rim (<Code>data-flat</Code>) because a backdrop filter inside a backdrop filter only blurs the card behind it.
            </p>
            <Glass layer={2} interactive className="flex items-center justify-between gap-3 px-4 py-3 text-body-sm font-medium">
              <span>Flat L2 inside an L1 card</span>
              <Badge tone="neutral">data-flat</Badge>
            </Glass>
          </div>
        </Panel>

        <Panel title="Reduce glass" note="In-app switch · html[data-transparency=reduce] · also follows prefers-reduced-transparency.">
          <ReduceGlassSwitch />
          <dl className="grid grid-cols-3 gap-3 text-caption">
            <div className="grid gap-0.5 rounded-lg bg-surface-field p-3">
              <dt className="text-fg-subtle">In-app</dt>
              <dd className="font-semibold text-fg">{app ? "On" : "Off"}</dd>
            </div>
            <div className="grid gap-0.5 rounded-lg bg-surface-field p-3">
              <dt className="text-fg-subtle">Device</dt>
              <dd className="font-semibold text-fg">{system ? "On" : "Off"}</dd>
            </div>
            <div className="grid gap-0.5 rounded-lg bg-surface-field p-3">
              <dt className="text-fg-subtle">Surfaces</dt>
              <dd className="font-semibold text-fg">{reduced ? "Solid" : "Glass"}</dd>
            </div>
          </dl>
        </Panel>
      </Cols>

      {/* ---- Stage C: the refraction lens (Chromium-only progressive enhancement) ---- */}
      <div className="relative isolate overflow-hidden rounded-[36px] p-4 sm:p-10">
        <Aurora variant="contained" drift={false} />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="grid gap-3">
            <Row>
              <GlassPill tint={lensCapable && !reduced ? "mint" : "none"}>
                {reduced ? "Lens off: Reduce glass is on" : lensCapable ? "Refraction active (Chromium)" : "CSS glass fallback (this browser)"}
              </GlassPill>
            </Row>
            <h3 className="font-display text-title-md text-fg">Refraction on hero surfaces only</h3>
            <p className="max-w-[52ch] text-body-sm text-fg-muted">
              <Code>{"<LiquidLens>"}</Code> bends the backdrop through the rim with an SVG displacement map. Chromium only, at most three per page (wallet hero card, Daily Drop, marketing hero), maps built once and cached, never animated. Safari and Firefox keep the identical CSS glass.
            </p>
          </div>
          <LiquidLens className="grid gap-2 p-8" radius={36} aria-label="Wallet hero card with refraction">
            <p className="fd-eyebrow text-fg-subtle">Cleared</p>
            <Money cents={128460} size="hero" state="cleared" icon={false} />
            <p className="text-body-sm text-fg-muted">$61.20 pending · next clears Sat 2:00 PM</p>
          </LiquidLens>
        </div>
      </div>
    </Section>
  );
}

/** Hero-backgrounds specimen: the CSS aurora next to the optional WebGL one. */
export function AuroraSection() {
  const [calm, setCalm] = useState<"full" | "calm">("full");
  return (
    <Section
      id="aurora"
      eyebrow="Background"
      title="The aurora is the colour in the room."
      description="Four soft orbs on the canvas, drifting over 90 seconds, with a hint of grain. The WebGL version is an optional hero upgrade: it pauses off-screen and under reduced motion, and the CSS aurora underneath is the fallback."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Aurora intensity"
          value={calm}
          onValueChange={setCalm}
          options={[
            { value: "full", label: "Full" },
            { value: "calm", label: "Calm (dense screens)" },
          ]}
        />
        <p className="text-caption text-fg-subtle">One aurora per page in product. This gallery shows two beside the page-level one.</p>
      </div>
      <Cols>
        <div className="relative isolate h-72 overflow-hidden rounded-[36px] sm:h-80">
          <Aurora variant="contained" intensity={calm} />
          <GlassPill className="absolute bottom-4 left-4">CSS aurora · orbs + grain</GlassPill>
        </div>
        <div className="relative isolate h-72 overflow-hidden rounded-[36px] sm:h-80">
          <AuroraShader variant="contained" intensity={calm === "calm" ? 0.6 : 1} />
          <GlassPill className="absolute bottom-4 left-4">WebGL aurora · 30 fps · pauses off-screen</GlassPill>
        </div>
      </Cols>
    </Section>
  );
}
