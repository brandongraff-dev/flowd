"use client";

import { useState } from "react";
import { Bolt, FileText, Scale, ShieldCheck, WalletMinimal } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Avatar,
  Button,
  Chip,
  EmptyState,
  Money,
  ScrollArea,
  Separator,
  Skeleton,
  SkeletonGroup,
  SkeletonRow,
  SkeletonText,
  StatusPill,
} from "@/components/ui";
import { Cols, Panel, Row, Section } from "./kit";

const FAQ = [
  { id: "cost", q: "What does flowd cost?", a: "Free plan: no seats, no minimums, 12% on bounty spend. Pro is $299 a month at 10%, Scale $999 at 8%. Install and trial-only bounties are a flat 6%, charged only on cleared conversions. Creators are always free." },
  { id: "clock", q: "When does pending money clear?", a: "72 hours after a post goes live the view window closes, a fraud check runs, then it clears. Every row shows a dated ETA and a named reason for any delay." },
  { id: "rights", q: "What rights does a brand get?", a: "Organic posting is always included. Paid-ad usage defaults to 90 days and renews at 25% of the base fee per 30 days. AI-likeness use is off by default." },
  { id: "escrow", q: "Is a bounty really funded before it goes live?", a: "Yes. A bounty can't go live until it is fully escrowed, and when a creator submits, up to the per-video cap is reserved for them so approved posts are paid even if the pool later empties." },
];

const LEDGER = [
  { id: 1, who: "Nap Nest", what: "Wind-down routine hook", cents: 3820, state: "pending" as const, when: "clears Sat 2:00 PM" },
  { id: 2, who: "Fernlingo", what: "Speak in 7 days", cents: 6240, state: "cleared" as const, when: "cleared today" },
  { id: 3, who: "Loafly", what: "Dough day diary", cents: 1840, state: "cleared" as const, when: "cleared yesterday" },
  { id: 4, who: "Quill Notes", what: "Study with me", cents: 2260, state: "pending" as const, when: "clears Sun 9:00 AM" },
  { id: 5, who: "Nap Nest", what: "Install bonus · 6 installs", cents: 240, state: "cleared" as const, when: "cleared Oct 1" },
  { id: 6, who: "Fernlingo", what: "Trial bonus · 3 trials", cents: 450, state: "cleared" as const, when: "cleared Sep 30" },
  { id: 7, who: "Loafly", what: "Clawback · duplicate view", cents: -120, state: "cleared" as const, when: "Sep 29" },
];

export function LayoutSection() {
  const [loading, setLoading] = useState(true);

  return (
    <Section
      id="layout"
      eyebrow="Structure"
      title="Disclosure, scrolling, loading and empty."
      description="Accordions reveal one answer at a time. Skeletons shimmer like glass catching light and stop under reduced motion. Empty states are never blank: art, one line, one reason, one action."
    >
      <Cols>
        <Panel title="Accordion · plain" note="Arrow keys move between headers; Home and End jump. Opens in 240ms.">
          <Accordion defaultValue="clock">
            {FAQ.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Panel>

        <Panel title="Accordion · card, multiple" note="Each item is a fill tile (not glass) so it can sit on L1.">
          <Accordion type="multiple" variant="card" defaultValue={["rights"]}>
            <AccordionItem value="rights">
              <AccordionTrigger icon={<ShieldCheck />} description="Included on every bounty">
                Rights Card
              </AccordionTrigger>
              <AccordionContent>Plain-language licence: what the brand can do, for how long, and what renewing costs.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="dispute">
              <AccordionTrigger icon={<Scale />} description="One appeal per rejection">
                Disputes and appeals
              </AccordionTrigger>
              <AccordionContent>Rejections need a reason code and evidence. Two revision rounds are free; extra rounds are paid by the brand.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="tax">
              <AccordionTrigger icon={<FileText />} description="Just in time, not up front">
                Tax Desk
              </AccordionTrigger>
              <AccordionContent>W-9 only when you first cash out. Year-to-date earnings and a CSV export, always. Not tax advice.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Scroll area" note="Thin scrollbars, a focusable region for the keyboard, soft fades instead of hard cuts.">
          <ScrollArea className="h-72 rounded-xl bg-surface-field" fade aria-label="Recent earnings" viewportClassName="px-3 py-4">
            <ul className="grid">
              {LEDGER.map((row, index) => (
                <li key={row.id}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex items-center gap-3 py-3">
                    <Avatar name={row.who} shape="square" size={36} decorative />
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate text-body-sm font-semibold text-fg">{row.what}</span>
                      <span className="truncate text-caption text-fg-subtle">
                        {row.who} · {row.when}
                      </span>
                    </div>
                    <Money cents={row.cents} size="sm" state={row.cents < 0 ? "negative" : row.state} signDisplay={row.cents > 0 && row.state === "cleared" ? "always" : "auto"} icon={row.state === "pending"} />
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <ScrollArea orientation="horizontal" className="-mx-1" aria-label="Niches" viewportClassName="px-1 pb-3" fade>
            <div className="flex w-max gap-2 pr-4">
              {["Fitness", "Sleep", "Language learning", "Study tools", "AI tools", "Productivity", "Baking", "Personal finance", "Parenting"].map((label) => (
                <Chip key={label}>{label}</Chip>
              ))}
            </div>
          </ScrollArea>
        </Panel>

        <Panel title="Separator" note="A hairline in divider colour. Decorative unless it separates regions.">
          <div className="grid gap-5">
            <Separator />
            <Separator label="or continue with email" />
            <div className="flex h-10 items-center gap-4 text-body-sm text-fg-muted">
              <span>Cleared</span>
              <Separator orientation="vertical" />
              <span>Pending</span>
              <Separator orientation="vertical" />
              <span>Paid out</span>
            </div>
          </div>
        </Panel>
      </Cols>

      <Panel title="Skeletons" note="Glass shimmer, transform-only. Group them so screen readers hear “Loading” once.">
        <Row>
          <Button size="sm" variant="secondary" onClick={() => setLoading((value) => !value)}>
            {loading ? "Show content" : "Show skeleton"}
          </Button>
        </Row>
        {loading ? (
          <SkeletonGroup label="Loading bounties" className="grid gap-6 lg:grid-cols-3">
            <div className="grid gap-4">
              <Skeleton className="aspect-[16/10] w-full" />
              <SkeletonText lines={3} />
            </div>
            <div className="grid content-start gap-5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
            <div className="flex flex-wrap content-start gap-2.5">
              <Skeleton shape="pill" className="h-8 w-24" />
              <Skeleton shape="pill" className="h-8 w-32" />
              <Skeleton shape="pill" className="h-8 w-20" />
              <Skeleton shape="circle" className="size-16" />
              <Skeleton className="h-16 w-40" />
            </div>
          </SkeletonGroup>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="grid gap-3">
              <div className="aspect-[16/10] w-full rounded-xl bg-(image:--fd-gradient-flow)" role="img" aria-label="Generated thumbnail" />
              <p className="text-body-sm font-semibold text-fg">Wind-down routine hook</p>
              <p className="text-caption text-fg-muted">Nap Nest · $2.40 per 1,000 views plus $1.50 per trial. 68% of the pool is left.</p>
            </div>
            <ul className="grid content-start gap-4">
              {LEDGER.slice(0, 3).map((row) => (
                <li key={row.id} className="flex items-center gap-3.5">
                  <Avatar name={row.who} size={44} decorative />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body-sm font-semibold text-fg">{row.what}</span>
                    <span className="truncate text-caption text-fg-subtle">{row.who}</span>
                  </span>
                  <Money cents={row.cents} size="sm" state={row.state} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap content-start gap-2.5">
              <StatusPill status="live" pulse />
              <StatusPill status="funded" />
              <StatusPill status="in_review" />
            </div>
          </div>
        )}
      </Panel>

      <Cols n={3}>
        <Panel title="Empty · wallet" padding="sm">
          <EmptyState art="wallet" title="No earnings yet" description="Your first approved video clears 72 hours after it posts." action={<Button variant="primary" leadingIcon={<Bolt />}>Browse bounties</Button>} />
        </Panel>
        <Panel title="Empty · search" padding="sm">
          <EmptyState art="search" title="Nothing matches “bread”" description="Try a niche, or clear a filter. 14 bounties are open." action={<Button variant="secondary">Clear filters</Button>} secondaryAction={<Button variant="plain">See all</Button>} />
        </Panel>
        <Panel title="Error" padding="sm">
          <EmptyState art="error" announce="alert" title="Something slipped" description="That one is on us. Your data is safe. Try again in a moment." action={<Button variant="primary">Try again</Button>} />
        </Panel>
        <Panel title="Empty · inbox" padding="sm">
          <EmptyState art="inbox" title="Inbox zero" description="Brands decide within 72 hours. We'll tell you the moment they do." />
        </Panel>
        <Panel title="Locked" padding="sm">
          <EmptyState art="locked" title="Auctions open at Platinum" description="You're at 78% of the way there. $400 more cleared to go." action={<Button variant="secondary" leadingIcon={<WalletMinimal />}>See the path</Button>} />
        </Panel>
        <Panel title="Offline" padding="sm">
          <EmptyState art="offline" size="sm" title="You're offline" description="Your takes are saved. We'll upload them when you're back." />
        </Panel>
      </Cols>
    </Section>
  );
}
