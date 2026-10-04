"use client";

import { useState } from "react";
import { Check, Clock, Sparkles, Zap } from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  CountUp,
  Money,
  Pill,
  Progress,
  ProgressRing,
  STATUS_META,
  StatusPill,
  Stepper,
  type Tone,
} from "@/components/ui";
import { Cols, Panel, Row, Section, Spec } from "./kit";

const TONES: readonly Tone[] = ["neutral", "accent", "violet", "mint", "info", "ember", "sun", "rose"];

const STEPS = [
  { id: "link", label: "Link", description: "Paste your App Store link. Flo does the rest." },
  { id: "brief", label: "Brief", description: "Review the drafted brief and 10 hooks." },
  { id: "pay", label: "Pay", description: "Set a rate. Suggested $2.40 fills in about 3 days." },
  { id: "fund", label: "Fund", description: "Held in escrow. Released only for verified views." },
] as const;

const GOAL = 200000;

export function DataSection() {
  const [cleared, setCleared] = useState(128460);
  const [pending, setPending] = useState(6120);
  const [views, setViews] = useState(412880);
  const [step, setStep] = useState(1);

  const clearPost = (): void => {
    const amount = Math.min(3820, pending);
    if (amount <= 0) return;
    setPending((value) => value - amount);
    setCleared((value) => value + amount);
  };
  const reset = (): void => {
    setCleared(128460);
    setPending(6120);
  };

  return (
    <Section
      id="data"
      eyebrow="Status and numbers"
      title="Numbers are heroes. Every dollar has a state."
      description="Money is Bricolage with tabular figures, formatted from integer cents at the edge. Pending is lagoon with a clock and a hatched underline; cleared is mint with a check. Colour never travels alone."
    >
      <Cols>
        <Panel title="Wallet, the Money Clock" note="Press the button: a post clears, both totals roll on the smooth spring (a mint wash under reduced motion).">
          <div className="grid gap-1">
            <p className="fd-eyebrow text-fg-subtle">Cleared</p>
            <Money cents={cleared} size="hero" state="cleared" animate />
          </div>
          <Money cents={pending} size="md" state="pending" animate note="3 posts · next clears Sat 2:00 PM" />
          <Progress
            value={cleared}
            pending={pending}
            max={GOAL}
            tone="mint"
            aria-label="Earned this week"
            valueText={`${Math.round((cleared / GOAL) * 100)}% of your $2,000 goal cleared`}
            label="Weekly goal · $2,000"
            trailing={`${Math.round((cleared / GOAL) * 100)}% cleared`}
          />
          <Row>
            <Button variant="mint" onClick={clearPost} disabled={pending <= 0} leadingIcon={<Check />}>
              A post clears (+$38.20)
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </Row>
        </Panel>

        <Panel title="Money specimens" note="Size, sign, state and format. All from integer cents.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Spec caption="xl · cleared">
              <Money cents={62400} size="xl" state="cleared" />
            </Spec>
            <Spec caption="xl · pending, hatched">
              <Money cents={18620} size="xl" state="pending" />
            </Spec>
            <Spec caption="lg · escrow (brand)">
              <Money cents={500000} size="lg" state="escrow" decimals="auto" />
            </Spec>
            <Spec caption="lg · negative (clawback)">
              <Money cents={-1200} size="lg" />
            </Spec>
            <Spec caption="md · bonus, signed">
              <Money cents={150} size="md" state="cleared" signDisplay="always" />
            </Spec>
            <Spec caption="md · paid out">
              <Money cents={128460} size="md" state="paid" />
            </Spec>
            <Spec caption="sm · inline, tabular">
              <Money cents={4240} size="sm" />
            </Spec>
            <Spec caption="compact · charts and tiles">
              <Money cents={4821000} size="md" compact />
            </Spec>
          </div>
          <div className="grid gap-1.5 rounded-xl bg-surface-field p-3.5" aria-label="Tabular figures keep columns aligned">
            {[128460, 6120, 3820, 480].map((value) => (
              <div key={value} className="flex items-baseline justify-between gap-4 text-caption text-fg-muted">
                <span>Column of figures</span>
                <Money cents={value} size="sm" />
              </div>
            ))}
          </div>
        </Panel>
      </Cols>

      <Cols n={3}>
        <Panel title="Count-up" note="CountUp for non-money counts: spring, interruptible, tabular.">
          <div className="grid gap-1">
            <CountUp value={views} className="font-display text-figure-xl text-fg" />
            <p className="text-caption text-fg-subtle">verified views this week</p>
          </div>
          <Row>
            <Button size="sm" variant="secondary" onClick={() => setViews((value) => value + 2400)}>
              +2,400 views
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setViews(412880)}>
              Reset
            </Button>
          </Row>
        </Panel>

        <Panel title="Progress" note="The fill is a transform, so it keeps rounded ends and retargets mid-way.">
          <Progress value={68} aria-label="Pool left" label="Pool left" trailing="68%" />
          <Progress value={42} tone="mint" aria-label="Cleared" label="Cleared" trailing="$840" size="sm" />
          <Progress value={88} tone="ember" aria-label="Daily Drop spots" label="Daily Drop" trailing="5 spots left" size="lg" />
          <Progress value={null} aria-label="Uploading" label="Uploading take 3" />
        </Panel>

        <Panel title="Progress ring" note="One Flow-gradient ring, never three.">
          <Row>
            <ProgressRing value={72} aria-label="Hook Score" valueText="Hook Score 72 of 100">
              72
            </ProgressRing>
            <ProgressRing value={40} tone="mint" size={64} thickness={6} aria-label="Cleared share" valueText="40% cleared">
              <span className="text-body-sm">40%</span>
            </ProgressRing>
            <ProgressRing value={88} tone="ember" size={56} thickness={6} aria-label="Spots filled" valueText="88% filled">
              <Zap aria-hidden="true" className="size-5 text-ember" />
            </ProgressRing>
          </Row>
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Badges and pills" note="Soft (default), solid and outline across the eight tones. 20 · 24 · 28px.">
          <div className="grid gap-3">
            {(["soft", "solid", "outline"] as const).map((variant) => (
              <Row key={variant} label={variant}>
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} variant={variant}>
                    {tone}
                  </Badge>
                ))}
              </Row>
            ))}
          </div>
          <Row label="Sizes, counts and glyphs">
            <Badge size="sm" tone="accent" variant="solid">
              14
            </Badge>
            <Badge size="md" tone="mint" dot>
              Funded
            </Badge>
            <Pill tone="mint" icon={<Check />}>
              Cleared
            </Pill>
            <Pill tone="info" icon={<Clock />}>
              Pending
            </Pill>
            <Pill tone="ember" icon={<Zap />}>
              Daily Drop
            </Pill>
            <Pill tone="violet" icon={<Sparkles />}>
              Flo
            </Pill>
          </Row>
        </Panel>

        <Panel title="Status vocabulary" note="Glyph, word and tone, so state never rests on colour. Keys are the contract's snake_case statuses.">
          <div className="flex flex-wrap gap-2">
            {Object.keys(STATUS_META).map((status) => (
              <StatusPill key={status} status={status} size="md" />
            ))}
            <StatusPill status="live" pulse size="md" />
          </div>
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Stepper (wizard header)" note="Under 640px it collapses to “Step 2 of 4” over a segmented bar. Completed steps jump back.">
          <Stepper aria-label="Create bounty" steps={STEPS} current={step} onStepSelect={setStep} />
          <p className="min-h-10 text-body-sm text-fg-muted">{STEPS[step]?.description}</p>
          <Row>
            <Button variant="ghost" size="sm" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
              Back
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))} disabled={step >= STEPS.length - 1}>
              Next
            </Button>
          </Row>
        </Panel>

        <Panel title="Stepper, vertical" note="A sidebar rail for the onboarding and Rights Vault flows.">
          <Stepper aria-label="First-dollar path" orientation="vertical" current={2} steps={[
            { id: "niches", label: "Pick 3 niches", description: "Fitness, AI tools, Study" },
            { id: "starter", label: "Choose a starter bounty", description: "Lumen Sleep · $5 first video" },
            { id: "take", label: "Make your first take", description: "About 3 minutes. No followers needed." },
            { id: "payout", label: "Get paid", description: "Within 72 hours of approval", optional: false },
          ]} />
        </Panel>
      </Cols>

      <Panel title="Avatars" note="Generated, never stock: a gradient disc seeded by the handle, two initials in Bricolage 800. Brands get a rounded square.">
        <Row label="Sizes: 24 · 32 · 40 · 56 · 80">
          {[24, 32, 40, 56, 80].map((size) => (
            <Avatar key={size} name="Maya K" seed="cr_maya" size={size} />
          ))}
        </Row>
        <Row label="The eight gradients">
          {["maya.k", "tej_r", "luna", "ari.codes", "nap_nest", "fernlingo", "loafly", "quill", "sam.b", "dev", "jo.lee", "kira", "ozzy", "pia", "rae", "wren"].map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </Row>
        <Row label="Brands and apps (rounded square) and a crew stack">
          <Avatar name="Nap Nest" shape="square" size={48} />
          <Avatar name="Fernlingo" shape="square" size={48} />
          <Avatar name="Loafly" shape="square" size={48} />
          <AvatarStack
            size={36}
            people={[{ name: "maya.k" }, { name: "tej_r" }, { name: "luna" }, { name: "ari.codes" }, { name: "sam.b" }, { name: "kira" }, { name: "wren" }]}
          />
        </Row>
      </Panel>
    </Section>
  );
}
