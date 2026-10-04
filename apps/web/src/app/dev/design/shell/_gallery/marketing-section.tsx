"use client";

import { useRef, useState } from "react";
import { Landmark, PartyPopper, Play, Sparkles, UsersRound, WalletMinimal } from "lucide-react";
import { AppIcon, ArtAvatar, Thumb } from "@/components/brand";
import { Badge, Button, Money } from "@/components/ui";
import { AnimatedBeam, ConfettiBurst, FlowLines, Marquee, PayoutArrive, PayoutTicker, PhoneFrame, RevealItem, SectionReveal } from "@/components/shell";
import { Cols, Panel, Row, Section } from "../../_gallery/kit";
import { APPS, CREATORS, PAYOUT_EVENTS, thumbArt, type Person } from "./data";
import { Stage } from "./stage";

function PhoneBounty() {
  return (
    <div className="flex h-full flex-col gap-3.5 px-5 pt-[68px]">
      <div className="flex items-center gap-3">
        <AppIcon art={APPS.nap?.icon ?? thumbArt("Nap Nest")} name="Nap Nest" size={44} decorative />
        <div className="grid">
          <p className="font-display text-title-md text-fg">Nap Nest</p>
          <p className="text-caption text-fg-subtle">Sleep & mind · Funded</p>
        </div>
        <Badge className="ml-auto" tone="mint" icon={<Sparkles aria-hidden="true" />}>
          Funded
        </Badge>
      </div>
      <Thumb art={thumbArt("I was wrong about sleep apps")} aspect="16:9" caption="Hook A" durationSec={24} play />
      <div className="grid gap-1">
        <p className="fd-eyebrow text-fg-subtle">Typical creators earn</p>
        <div className="flex items-baseline gap-2">
          <Money cents={6200} size="lg" state="cleared" decimals="auto" />
          <span className="text-caption text-fg-subtle">median · 30 days</span>
        </div>
        <p className="text-caption text-fg-muted">Range $38 to $140. Top earner $1,940. Results vary.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-micro text-fg-subtle">Pays</p>
          <p className="font-display text-title-sm text-fg">$2.40 / 1k views</p>
        </div>
        <div className="rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
          <p className="text-micro text-fg-subtle">Plus per trial</p>
          <p className="font-display text-title-sm text-fg">$1.50</p>
        </div>
      </div>
      <div className="mt-auto pb-[56px]">
        <Button variant="ember" size="lg" className="w-full" leadingIcon={<Play />}>
          Make a take
        </Button>
      </div>
    </div>
  );
}

function BeamDiagram() {
  const container = useRef<HTMLDivElement>(null);
  const brands = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const creators = useRef<HTMLDivElement>(null);
  const node = "relative z-10 grid size-16 place-items-center rounded-full bg-surface-raised text-fg shadow-[inset_0_0_0_1px_var(--fd-rim-strong),var(--fd-elevation-2)]";
  return (
    <div ref={container} className="relative grid grid-cols-3 items-center gap-4 px-6 py-10">
      <div className="grid justify-items-center gap-2">
        <div ref={brands} className={node}>
          <Landmark className="size-6" strokeWidth={1.6} />
        </div>
        <p className="text-caption font-semibold text-fg">Brands fund bounties</p>
      </div>
      <div className="grid justify-items-center gap-2">
        <div ref={hub} className={`${node} size-20 bg-accent-solid text-on-accent`}>
          <WalletMinimal className="size-8" strokeWidth={1.6} />
        </div>
        <p className="text-caption font-semibold text-fg">Escrow, scoring, ledger</p>
      </div>
      <div className="grid justify-items-center gap-2">
        <div ref={creators} className={node}>
          <UsersRound className="size-6" strokeWidth={1.6} />
        </div>
        <p className="text-caption font-semibold text-fg">Creators get paid</p>
      </div>
      <AnimatedBeam containerRef={container} fromRef={brands} toRef={hub} curvature={26} tone="flow" duration={3.4} />
      <AnimatedBeam containerRef={container} fromRef={hub} toRef={creators} curvature={-26} tone="mint" duration={3.4} delay={1.1} />
    </div>
  );
}

export function MarketingSection() {
  const [burst, setBurst] = useState(0);
  const [play, setPlay] = useState(0);
  const people = Object.values(CREATORS);
  const appList = Object.values(APPS);
  return (
    <Section
      id="marketing"
      eyebrow="Marketing and delight"
      title="Rich where it is rare, quiet where it is daily."
      description="Phone mock-ups, a marquee, a live-feeling payout ticker, beams and a scroll reveal for marketing; the payout-arrives moment and confetti for creator earned outcomes only. Every one of them stops moving under reduced motion."
    >
      <Cols>
        <Stage title="Phone mock-ups" height={640} className="grid place-items-center" caption="Built in CSS and SVG: 58px outer radius, 11px bezel, a 30px Dynamic Island. The screen is laid out at 390 x 844 and scaled whole, so real components keep their proportions.">
          <div className="flex size-full items-center justify-center gap-5 px-4">
            <PhoneFrame width={250}>
              <PhoneBounty />
            </PhoneFrame>
            <PhoneFrame width={250} className="hidden sm:block">
              <div className="flex h-full flex-col justify-center gap-4 px-6 text-center">
                <p className="fd-eyebrow text-mint">Payout flowd</p>
                <Money cents={24000} size="hero" state="cleared" icon={false} className="justify-center" />
                <p className="text-body text-fg-muted">Cleared. It&apos;s in your Wallet now.</p>
                <p className="mx-auto rounded-pill bg-surface-field px-3.5 py-1.5 text-caption text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">Typical creator this week: $212 (median)</p>
              </div>
            </PhoneFrame>
          </div>
        </Stage>
        <div className="grid content-start gap-5">
          <Panel title="Payout ticker" note="Rows rise every 3.4 s while it is on screen and the tab is visible; the total counts up; static under reduced motion. Tagged Demo data.">
            <PayoutTicker events={PAYOUT_EVENTS} visible={4} />
          </Panel>
          <Panel title="Ticker strip and marquee" note="Pauses on hover or focus; becomes a scrollable row under reduced motion.">
            <PayoutTicker events={PAYOUT_EVENTS} layout="strip" />
            <Marquee gap={28} speed={28} aria-label="Apps on flowd">
              {appList.map((app) => (
                <span key={app.name} className="inline-flex items-center gap-2.5 text-body-sm font-semibold text-fg-muted">
                  <AppIcon art={app.icon} name={app.name} size={28} decorative />
                  {app.name}
                </span>
              ))}
            </Marquee>
          </Panel>
        </div>
      </Cols>

      <Stage title="Animated beams and flow lines" height={280} caption="Money flows one way, attention the other. The pulse travels along a measured path; under reduced motion only the hairline remains.">
        <FlowLines className="opacity-80" />
        <BeamDiagram />
      </Stage>

      <Cols>
        <div className="grid content-start gap-3">
          <PayoutArrive
            cents={24000}
            source="Nap Nest, hook B"
            median={{ cents: 21200, label: "this week" }}
            play={play}
            actions={
              <>
                <Button variant="secondary" leadingIcon={<Sparkles />}>
                  Share earnings card
                </Button>
                <Button variant="ghost" onClick={() => setPlay((value) => value + 1)}>
                  Replay
                </Button>
              </>
            }
          />
          <p className="text-caption text-fg-subtle">Creator earned outcomes only: cleared money, approvals, tier-ups. Funding, bidding and spending get calm confirmations, never this.</p>
        </div>
        <Panel title="Confetti burst" note="One canvas burst, about 64 pieces from the token ramps, 1.9 s, no-op under reduced motion.">
          <div className="relative grid h-56 place-items-center overflow-hidden rounded-3xl bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <ConfettiBurst fire={burst} />
            <Button variant="mint" leadingIcon={<PartyPopper />} onClick={() => setBurst((value) => value + 1)}>
              Approved. Fire
            </Button>
          </div>
          <Row>
            {(people.slice(0, 5) as Person[]).map((person) => (
              <ArtAvatar key={person.handle} art={person.art} name={person.handle} size={36} />
            ))}
          </Row>
        </Panel>
      </Cols>

      <Panel title="Scroll reveal" note="Items rise 14px and fade, 40 ms apart (capped at eight), once, on the smooth spring. For marketing sections; never for a screen people use all day.">
        <SectionReveal className="grid gap-3 sm:grid-cols-3">
          {["Fund the bounty", "Creators compete", "Results get paid"].map((title, index) => (
            <RevealItem key={title} index={index}>
              <div className="grid gap-1.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                <p className="fd-eyebrow text-accent">Step {index + 1}</p>
                <p className="font-display text-title-sm text-fg">{title}</p>
                <p className="text-caption text-fg-muted">{["Escrow the pool. It cannot go live until it is funded.", "Open bounties, rate cards and auctions. No applications that go unanswered.", "Cleared money shows its date. Pending is never a bare word."][index]}</p>
              </div>
            </RevealItem>
          ))}
        </SectionReveal>
      </Panel>
    </Section>
  );
}
