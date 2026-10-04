"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleUser, House, Plus, Target, Video, WalletMinimal } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { Badge, Button, IconButton, Money, Progress } from "@/components/ui";
import { Thumb } from "@/components/brand";
import {
  Breadcrumbs,
  Container,
  KpiRow,
  MobileBottomBar,
  NotificationButton,
  PageHeader,
  PhoneFrame,
  Section,
  SideNav,
  StatCard,
  TopBar,
  UserMenu,
  WalletChip,
  type NavEntry,
} from "@/components/shell";
import { Cols, Section as GallerySection } from "../../_gallery/kit";
import { BRAND_NAV, CREATORS, thumbArt } from "./data";
import { Stage } from "./stage";

const CREATOR_TABS: NavEntry[] = [
  { href: "/creator", label: "Home", icon: House, exact: true },
  { href: "/creator/bounties", label: "Bounties", icon: Target },
  { href: "/creator/wallet", label: "Wallet", icon: WalletMinimal },
  { href: "/creator/profile", label: "Profile", icon: CircleUser },
];

const maya = CREATORS.maya;

function UserMenuSample() {
  return (
    <UserMenu
      avatar={maya ? <ArtAvatar art={maya.art} name={maya.name} size={32} decorative /> : null}
      name="Jordan Ellis"
      detail="Brand admin · Lumi"
      sections={[
        [
          { id: "profile", label: "Account settings", href: "/brand/settings" },
          { id: "team", label: "Team and activity", href: "/brand/team" },
        ],
        [{ id: "role", label: "Switch to creator view", onSelect: () => undefined }],
        [{ id: "out", label: "Sign out", destructive: true, onSelect: () => undefined }],
      ]}
    />
  );
}

function PhoneHome() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-5 pt-[68px]">
      <div className="grid gap-0.5">
        <p className="text-body-sm text-fg-muted">Good morning, Maya</p>
        <p className="font-display text-display-sm text-fg">Your money clock</p>
      </div>
      <div className="grid gap-3 rounded-[28px] bg-surface-glass-1 p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <p className="fd-eyebrow text-fg-subtle">Cleared</p>
        <Money cents={128460} size="xl" state="cleared" />
        <Money cents={6120} state="pending" size="md" note="3 posts · next clears Sat 2:00 PM" />
        <Progress value={128460} pending={6120} max={200000} tone="mint" aria-label="Weekly goal" size="sm" />
      </div>
      <div className="flex items-center justify-between rounded-[22px] bg-ember-soft px-4 py-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fd-ember)_40%,transparent)]">
        <div className="grid gap-0.5">
          <p className="text-body-sm font-semibold text-ember">Daily Drop is live</p>
          <p className="text-caption text-fg-muted">8 new bounties · 5 spots left</p>
        </div>
        <ArrowUpRight className="size-5 text-ember" aria-hidden="true" />
      </div>
      <p className="fd-eyebrow text-fg-subtle">Matched for you</p>
      <div className="grid grid-cols-2 gap-3">
        <Thumb art={thumbArt("I was wrong about sleep apps")} aspect="4:5" caption="Nap Nest" durationSec={24} />
        <Thumb art={thumbArt("Sourdough, but make it data")} aspect="4:5" caption="Loafly" durationSec={29} />
      </div>
    </div>
  );
}

export function FrameSection() {
  const [searches, setSearches] = useState(0);
  return (
    <GallerySection
      id="frame"
      eyebrow="Frame"
      title="The shell: side nav, top bar, bottom bar."
      description="AppShell composes a collapsible side nav on L2 glass, a sticky floating top bar and the main landmark; below 768px the nav becomes a floating glass bottom bar. These are the pieces, live. The real thing, with the aurora and a full page of content, is on the demo route."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="primary" trailingIcon={<ArrowUpRight />}>
          <Link href="/dev/design/shell/demo">Open the live AppShell</Link>
        </Button>
        <p className="text-caption text-fg-subtle">Resize it below 768px to see the bottom bar. Press [ to collapse the side nav.</p>
      </div>

      <Stage
        title="Desktop frame"
        height={640}
        className="overflow-x-auto"
        caption="Expanded side nav (grouped, a count on Review queue, the active lens morphs when you click), a floating top bar with breadcrumbs, search trigger, wallet chip, notifications and the user menu, and a page header with stat tiles beneath."
      >
        <div className="flex size-full min-w-[920px] gap-3 p-3">
          <SideNav
            groups={BRAND_NAV}
            activePath="/brand/review"
            storageKey="flowd.gallery.sidenav"
            footer={({ collapsed }) =>
              collapsed ? null : (
                <div className="grid gap-1 rounded-2xl bg-surface-field p-3 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
                  <p className="text-caption font-semibold text-fg">Free plan · 12% take rate</p>
                  <p className="text-micro text-fg-subtle">Pro is 10% and adds the learned scorer.</p>
                </div>
              )
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden">
            <TopBar
              breadcrumbs={<Breadcrumbs items={[{ label: "Bounties", href: "/brand/bounties" }, { label: "Nap Nest hook test", href: "#" }, { label: "Review queue" }]} />}
              onSearch={() => setSearches((count) => count + 1)}
              wallet={<WalletChip escrowCents={500000} href="/brand/wallet" />}
              notifications={<NotificationButton count={3} onClick={() => undefined} />}
              userMenu={<UserMenuSample />}
            />
            <div className="min-w-0 flex-1 overflow-hidden px-1">
              <PageHeader
                eyebrow="Review queue"
                title="14 submissions waiting"
                description="Creators get paid faster when you decide within 48 hours. The oldest has been waiting 6 hours."
                actions={<Button variant="primary">Start reviewing</Button>}
                meta={
                  <>
                    <Badge tone="mint" dot>
                      Funded
                    </Badge>
                    <Badge tone="neutral">Auto-approve off</Badge>
                  </>
                }
              />
              <div className="mt-6">
                <KpiRow columns={3}>
                  <StatCard label="Oldest waiting" value={6} format={(v) => `${v}h`} hint="Decide by Fri 2:00 PM" />
                  <StatCard label="Decided this week" value={58} delta={{ ratio: 0.12, against: "vs last week" }} spark={[22, 28, 25, 31, 38, 36, 44, 49, 47, 52, 55, 58]} />
                  <StatCard label="Median decision time" value={9} format={(v) => `${v}h`} delta={{ ratio: -0.18, against: "vs last week", goodWhen: "down" }} />
                </KpiRow>
              </div>
            </div>
          </div>
        </div>
      </Stage>
      <p className="-mt-3 text-caption text-fg-subtle" aria-live="polite">
        Search trigger pressed {searches} {searches === 1 ? "time" : "times"} (it opens the command palette in the real shell).
      </p>

      <Cols>
        <Stage title="Collapsed rail" height={690} caption="76px: icons only, the label in a tooltip, the count as a dot. The collapse animates only the width; labels fade, so nothing reflows mid-transition.">
          <div className="flex size-full p-3">
            <SideNav groups={BRAND_NAV} activePath="/brand/analytics" collapsed onCollapsedChange={() => undefined} />
          </div>
        </Stage>
        <Stage title="Mobile bottom bar" height={690} className="grid place-items-center" caption="Below 768px the nav is a floating glass pill: icon over a 12px label, a raised centre action, the active tab filled and morphing between tabs. Shown inside a phone mock-up (the real bar is fixed to the viewport).">
          <div className="grid size-full place-items-center py-6">
            <PhoneFrame width={290}>
              <PhoneHome />
              <MobileBottomBar
                items={CREATOR_TABS}
                activePath="/creator"
                className="md:block bottom-[30px]"
                action={<IconButton variant="primary" size="lg" label="Make a take" icon={<Video />} className="shadow-glow-flow" />}
              />
            </PhoneFrame>
          </div>
        </Stage>
      </Cols>

      <Container size="prose" gutter={false} className="mx-0">
        <Section title="Page rhythm" description="Section titles, descriptions and actions line up on one grid; the gap between groups is twice the gap inside one." actions={<Button variant="plain" size="sm" trailingIcon={<Plus />}>Add</Button>}>
          <div className="rounded-2xl bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">Content sits here. Container caps width at 680 (prose), 1200 (content) or 1360 (wide).</div>
        </Section>
      </Container>
    </GallerySection>
  );
}
