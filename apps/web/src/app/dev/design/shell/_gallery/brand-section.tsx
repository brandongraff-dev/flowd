"use client";

import { useState } from "react";
import {
  AppIcon,
  ArtAvatar,
  ArtAvatarStack,
  DomainStatusPill,
  FlowdAppIcon,
  Logo,
  PlatformGlyph,
  PlatformLabel,
  Thumb,
  TierBadge,
  TierChip,
  TIER_ORDER,
  type EnumMetaLike,
} from "@/components/brand";
import { Button } from "@/components/ui";
import { Cols, Panel, Row, Section, Spec } from "../../_gallery/kit";
import { APPS, CREATORS, thumbArt, type Person } from "./data";

const MONEY: ReadonlyArray<[string, EnumMetaLike]> = [
  ["accruing", { label: "Accruing", tone: "info", meaning: "Window open; a live estimate that grows with verified views." }],
  ["pending", { label: "Pending", tone: "info", meaning: "Window closed; has a dated ETA and a named reason." }],
  ["cleared", { label: "Cleared", tone: "mint", meaning: "Cleared and waiting for the weekly payout." }],
  ["paid", { label: "Paid", tone: "mint", meaning: "Paid out." }],
  ["held", { label: "Held", tone: "ember", meaning: "Held, with a named reason and the next step." }],
  ["reversed", { label: "Reversed", tone: "rose", meaning: "Reversed after a clawback." }],
];
const BOUNTY: ReadonlyArray<[string, EnumMetaLike]> = [
  ["draft", { label: "Draft", tone: "neutral" }],
  ["awaiting_funding", { label: "Awaiting funding", tone: "ember" }],
  ["scheduled", { label: "Scheduled", tone: "info" }],
  ["live", { label: "Live", tone: "mint" }],
  ["paused", { label: "Paused", tone: "ember" }],
  ["filled", { label: "Filled", tone: "accent" }],
  ["settled", { label: "Settled", tone: "neutral" }],
  ["cancelled", { label: "Cancelled", tone: "rose" }],
];
const REVIEW: ReadonlyArray<[string, EnumMetaLike]> = [
  ["qa_pending", { label: "Checking", tone: "info" }],
  ["in_review", { label: "In review", tone: "accent" }],
  ["changes_requested", { label: "Changes requested", tone: "ember" }],
  ["approved", { label: "Approved", tone: "mint" }],
  ["posted", { label: "Posted", tone: "mint" }],
  ["rejected", { label: "Not approved", tone: "rose" }],
  ["appealed", { label: "Appeal open", tone: "ember" }],
  ["released", { label: "Released", tone: "violet" }],
];

export function BrandSection() {
  const [draw, setDraw] = useState(0);
  const people = Object.values(CREATORS) as Person[];
  const apps = Object.values(APPS);
  return (
    <Section
      id="brand"
      eyebrow="Brand pieces"
      title="The logo, the tiers, and everything generated."
      description="No image files, no stock, no real logos: avatars, app icons and video thumbnails are drawn from a seed, the tier medallions are SVG, and the status pills come straight from the contract's enum maps."
    >
      <Cols>
        <Panel title="Logo" note="Inline SVG, so it follows the in-app theme with no flash. The logo is flat: ink or ice letters with one mint crossbar, never a gradient.">
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
              <Logo height={34} />
              <Logo variant="wordmark" height={26} />
              <Logo variant="mark" height={44} key={draw} drawOn={draw > 0} />
              <Button size="sm" variant="ghost" onClick={() => setDraw((value) => value + 1)}>
                Draw on
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-8 rounded-3xl bg-[linear-gradient(135deg,var(--fd-ultraviolet-600),var(--fd-azure-600))] p-6">
              <Logo tone="mono" height={30} className="text-white" />
              <Logo tone="mono" variant="mark" height={34} className="text-white" />
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <Logo variant="stacked" height={92} />
              <FlowdAppIcon size={72} />
              <FlowdAppIcon size={40} />
            </div>
          </div>
        </Panel>

        <Panel title="Tier medallions" note="One to four chevrons, so rank reads without colour. Elite is the only dark medallion, with a prismatic ring.">
          <div className="grid gap-6">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
              {TIER_ORDER.map((tier) => (
                <Spec key={tier} caption={tier}>
                  <TierBadge tier={tier} size={84} />
                </Spec>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {TIER_ORDER.map((tier) => (
                <TierBadge key={tier} tier={tier} size={32} label />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {TIER_ORDER.map((tier) => (
                <TierBadge key={tier} tier={tier} size={20} />
              ))}
              {TIER_ORDER.map((tier) => (
                <TierChip key={tier} tier={tier} size="sm" />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <TierChip tier="gold" />
              <TierChip tier="elite" />
              <TierBadge tier="gold" size={56} rankUp key={`rank-${draw}`} />
              <span className="text-caption text-fg-subtle">Rank-up: it springs in and a sweep crosses it once. No confetti.</span>
            </div>
          </div>
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Avatars and app icons" note="Drawn from an ArtSeed. The initials sit on a scrim sized per seed so white always clears AA.">
          <div className="flex flex-wrap items-center gap-4">
            {people.map((person) => (
              <ArtAvatar key={person.handle} art={person.art} name={person.handle} size={48} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <ArtAvatarStack people={people.map((person) => ({ name: person.handle, art: person.art }))} max={5} size={36} />
            <ArtAvatarStack people={people.slice(0, 3).map((person) => ({ name: person.handle, art: person.art }))} shape="square" size={32} />
            {[24, 32, 40, 56, 80].map((size) => (
              <ArtAvatar key={size} art={(people[0] as Person).art} name="Maya K" size={size} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {apps.map((app) => (
              <AppIcon key={app.name} art={app.icon} name={app.name} size={56} />
            ))}
            {[20, 24, 32, 40, 80].map((size) => (
              <AppIcon key={size} art={(apps[0] ?? { icon: thumbArt("n") }).icon} name="Nap Nest" size={size} />
            ))}
          </div>
        </Panel>

        <Panel title="Platform marks and status pills" note="Generic two-letter marks, never a trademarked logo. Pills come from the contract's enum maps: label and tone from data, glyph by value.">
          <Row>
            <PlatformGlyph platform="tiktok" size={32} />
            <PlatformGlyph platform="instagram" size={32} />
            <PlatformGlyph platform="youtube" size={32} />
            <PlatformGlyph platform="meta" size={32} />
            <PlatformLabel platform="tiktok" />
            <PlatformLabel platform="youtube" />
          </Row>
          <Row label="Money Clock">
            {MONEY.map(([value, meta]) => (
              <DomainStatusPill key={value} meta={meta} value={value} />
            ))}
          </Row>
          <Row label="Bounty">
            {BOUNTY.map(([value, meta]) => (
              <DomainStatusPill key={value} meta={meta} value={value} />
            ))}
          </Row>
          <Row label="Submission">
            {REVIEW.map(([value, meta]) => (
              <DomainStatusPill key={value} meta={meta} value={value} />
            ))}
          </Row>
        </Panel>
      </Cols>

      <Panel title="Generated video thumbnails" note="Six patterns, three aspects, a hook on the 80% media scrim, an app glyph, a caption chip, a duration chip and a play overlay. Scales with its container.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {["I was wrong about sleep apps", "Sourdough, but make it data", "Learn 20 words before lunch", "My dog as a renaissance painting", "Kettlebell day, 12 minutes", "The wind-down routine that works"].map((hook, index) => (
            <Thumb
              key={hook}
              art={{ ...thumbArt(hook), pattern: (["orbs", "waves", "rings", "grid", "spark", "stripes"] as const)[index] ?? "orbs" }}
              app={{ name: apps[index % apps.length]?.name ?? "App", art: apps[index % apps.length]?.icon ?? thumbArt("x") }}
              caption={["Hook A", "Hook B", "Winner", "Needs changes", "Hook C", "Spec"][index]}
              durationSec={[24, 29, 35, 16, 27, 22][index]}
              play={index % 2 === 0}
            />
          ))}
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-[1.4fr_1fr_0.7fr]">
          <Thumb art={thumbArt("Nap Nest, hook B")} aspect="16:9" caption="Bounty cover" durationSec={24} play />
          <Thumb art={thumbArt("Fernlingo tournament")} aspect="1:1" caption="1:1" />
          <Thumb art={thumbArt("Kettle")} aspect="9:16" onPlay={() => undefined} label="Kettle Daily, hook C" durationSec={18} />
        </div>
      </Panel>
    </Section>
  );
}
