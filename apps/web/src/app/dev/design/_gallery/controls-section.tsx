"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Bolt, Download, Heart, Plus, Search, Settings, Share2, Sparkles, Target, Trash2, Video, WalletMinimal } from "lucide-react";
import {
  Button,
  Chip,
  ChipGroup,
  CopyButton,
  CopyField,
  CopyIconButton,
  IconButton,
  Kbd,
  KbdShortcut,
  RemovableChip,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { Code, Cols, Panel, Row, Section, Spec } from "./kit";

type ButtonVariant = "primary" | "secondary" | "ghost" | "mint" | "ember" | "danger" | "destructive" | "plain";

const MATRIX: ReadonlyArray<{ variant: ButtonVariant; label: string }> = [
  { variant: "primary", label: "Start a bounty" },
  { variant: "secondary", label: "Save for later" },
  { variant: "ghost", label: "Maybe later" },
  { variant: "mint", label: "Cash out" },
  { variant: "ember", label: "Claim drop" },
  { variant: "danger", label: "Remove post" },
  { variant: "destructive", label: "Delete draft" },
  { variant: "plain", label: "Edit rate card" },
];

const STATES = ["Default", "Hover", "Focus", "Pressed", "Loading", "Disabled"] as const;

export function ControlsSection() {
  const [range, setRange] = useState("30d");
  const [niches, setNiches] = useState<ReadonlySet<string>>(new Set(["Fitness", "AI tools"]));
  const [applied, setApplied] = useState<readonly string[]>(["Gold tier", "Cleared", "Under $5,000"]);
  const toggle = (niche: string): void =>
    setNiches((previous) => {
      const next = new Set(previous);
      if (next.has(niche)) next.delete(niche);
      else next.add(niche);
      return next;
    });

  return (
    <Section
      id="controls"
      eyebrow="Controls"
      title="Every control is 44px, scales to 0.96 on press, and shows a focus ring."
      description="Buttons respond on press-down, not on release, with a spring back. Variants are rare on purpose: one primary per view, the rest stay quiet. Hover, focus and pressed below are forced states for review; in product they come from the pointer and keyboard."
    >
      <Panel title="Button states" note="Rows are variants, columns are states. One primary gradient per view.">
        <div className="-m-2 overflow-x-auto p-2">
          <div className="grid min-w-[56rem] grid-cols-[7rem_repeat(6,minmax(0,1fr))] items-center gap-x-4 gap-y-4">
            <span />
            {STATES.map((state) => (
              <span key={state} className="fd-eyebrow text-fg-subtle">
                {state}
              </span>
            ))}
            {MATRIX.map(({ variant, label }) => (
              <Fragment key={variant}>
                <span className="text-caption font-semibold text-fg-muted">{variant}</span>
                <Button variant={variant}>{label}</Button>
                <Button variant={variant} data-force="hover">
                  {label}
                </Button>
                <Button variant={variant} data-force="focus">
                  {label}
                </Button>
                <Button variant={variant} data-force="active">
                  {label}
                </Button>
                <Button variant={variant} loading>
                  {label}
                </Button>
                <Button variant={variant} disabled>
                  {label}
                </Button>
              </Fragment>
            ))}
          </div>
        </div>
      </Panel>

      <Cols>
        <Panel title="Sizes and icons" note="28 · 36 · 44 · 52px. Icons are lucide, 18px, stroke 1.75.">
          <Row>
            <Button variant="primary" size="xs">
              Extra small
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
          </Row>
          <Row>
            <Button variant="primary" leadingIcon={<Target />}>
              Start a bounty
            </Button>
            <Button variant="secondary" trailingIcon={<ArrowRight />}>
              Continue
            </Button>
            <Button variant="mint" leadingIcon={<WalletMinimal />}>
              Cash out
            </Button>
            <Button variant="ember" leadingIcon={<Bolt />}>
              Claim drop
            </Button>
            <Button variant="ghost" leadingIcon={<Download />}>
              Export CSV
            </Button>
          </Row>
          <Row label="Links styled as buttons (asChild, or buttonVariants on a Link)">
            <Button asChild variant="secondary">
              <Link href="/dev/design#controls">Open as link</Link>
            </Button>
            <Link href="/dev/design#forms" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Jump to forms
            </Link>
            <Button variant="link">Read the rights card</Button>
          </Row>
        </Panel>

        <Panel title="Icon buttons" note="Round, 28–52px, 44px hit area on touch. The label is required and is the tooltip.">
          <Row>
            <IconButton label="Add bounty" icon={<Plus />} variant="primary" />
            <IconButton label="Search" icon={<Search />} />
            <IconButton label="Save" icon={<Bookmark />} variant="ghost" />
            <IconButton label="Like" icon={<Heart />} variant="plain" shortcut={["L"]} />
            <IconButton label="Share" icon={<Share2 />} variant="plain" />
            <IconButton label="Delete draft" icon={<Trash2 />} variant="danger" />
            <IconButton label="Settings" icon={<Settings />} variant="secondary" size="lg" />
            <IconButton label="Working" icon={<Video />} loading />
            <IconButton label="Unavailable" icon={<Sparkles />} disabled />
          </Row>
          <Row label="Copy (icon swaps to a check, name changes to “Copied”)">
            <CopyIconButton value="MAYA10" />
            <CopyButton value="joinflowd.io/c/maya" label="Copy link" copiedLabel="Link copied" />
          </Row>
          <CopyField value="joinflowd.io/c/maya" aria-label="Your short link" />
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Chips" note="Toggle chips filter; removable chips show what is applied. aria-pressed carries the state.">
          <ChipGroup aria-label="Niche">
            {["Fitness", "AI tools", "Study", "Sleep", "Productivity", "Language"].map((niche) => (
              <Chip key={niche} selected={niches.has(niche)} onSelectedChange={() => toggle(niche)}>
                {niche}
              </Chip>
            ))}
          </ChipGroup>
          <Row label="With icons and counts">
            <Chip selected icon={<Video />} count={14}>
              In review
            </Chip>
            <Chip icon={<Bolt />} count={3}>
              Daily Drop
            </Chip>
            <Chip size="sm">Small</Chip>
            <Chip disabled>Disabled</Chip>
            <Chip data-force="hover">Hover</Chip>
            <Chip data-force="focus">Focus</Chip>
          </Row>
          <Row label="Applied filters">
            {applied.map((filter) => (
              <RemovableChip key={filter} removeLabel={`Remove ${filter}`} onRemove={() => setApplied((current) => current.filter((item) => item !== filter))}>
                {filter}
              </RemovableChip>
            ))}
            {applied.length === 0 ? <span className="text-caption text-fg-subtle">All filters cleared.</span> : null}
          </Row>
        </Panel>

        <Panel title="Segmented control and tabs" note="A lens morphs to the selection on the snappy spring (instant under reduced motion).">
          <Spec caption="SegmentedControl · settings and views">
            <SegmentedControl
              aria-label="Date range"
              value={range}
              onValueChange={setRange}
              options={[
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
                { value: "90d", label: "90 days" },
              ]}
            />
          </Spec>
          <Spec caption="Tabs · segment variant (swaps a panel)" className="w-full">
            <Tabs defaultValue="submissions" className="w-full">
              <TabsList aria-label="Bounty sections">
                <TabsTrigger value="submissions" count={14}>
                  Submissions
                </TabsTrigger>
                <TabsTrigger value="funnel">Funnel</TabsTrigger>
                <TabsTrigger value="rights">Rights</TabsTrigger>
              </TabsList>
              <TabsContent value="submissions" className="text-body-sm text-fg-muted">
                14 waiting. Creators get paid faster when you decide within 72 hours.
              </TabsContent>
              <TabsContent value="funnel" className="text-body-sm text-fg-muted">
                Views to install to trial to paid, tracked and estimated shown separately.
              </TabsContent>
              <TabsContent value="rights" className="text-body-sm text-fg-muted">
                Organic posting included. Paid-ad usage 90 days, renewable.
              </TabsContent>
            </Tabs>
          </Spec>
          <Spec caption="Tabs · underline variant (page sections)" className="w-full">
            <Tabs defaultValue="overview" variant="underline" className="w-full">
              <TabsList aria-label="Wallet sections">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="payouts">Payouts</TabsTrigger>
                <TabsTrigger value="tax">Tax desk</TabsTrigger>
              </TabsList>
            </Tabs>
          </Spec>
        </Panel>
      </Cols>

      <Panel title="Keyboard hints" note="Platform-aware: ⌘ on Apple, Ctrl elsewhere. Server HTML renders the non-Apple form, so there is no hydration mismatch.">
        <Row>
          <KbdShortcut keys={["mod", "K"]} />
          <KbdShortcut keys={["shift", "/"]} />
          <KbdShortcut keys={["A"]} />
          <KbdShortcut keys={["enter"]} />
          <Kbd>esc</Kbd>
          <span className={cn("text-caption text-fg-subtle")}>
            Approve <Code>A</Code> · Fix <Code>F</Code> · Reject <Code>R</Code> in the review queue.
          </span>
        </Row>
      </Panel>
    </Section>
  );
}
