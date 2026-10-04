"use client";

import { useState } from "react";
import { Check, CirclePlus, Eye, LayoutDashboard, Target, WalletMinimal } from "lucide-react";
import { AreaChart, FunnelChart, formatCents } from "@/components/charts";
import { ArtAvatar, TierBadge } from "@/components/brand";
import { Badge, Button, CommandPalette, IconButton, TooltipProvider } from "@/components/ui";
import {
  AppShell,
  Breadcrumbs,
  DataTable,
  KpiRow,
  NotificationButton,
  PageHeader,
  Section,
  StatCard,
  TopBar,
  UserMenu,
  WalletChip,
  type DataColumn,
} from "@/components/shell";
import { BRAND_NAV, CREATORS, SUBMISSIONS, type Submission } from "../_gallery/data";
import { clearedDaily, funnelStages } from "../../charts/_gallery/data";

const COLUMNS: DataColumn<Submission>[] = [
  {
    id: "creator",
    header: "Creator",
    sortValue: (row) => row.creator.handle,
    card: "title",
    cell: (row) => (
      <span className="flex items-center gap-3">
        <ArtAvatar art={row.creator.art} name={row.creator.handle} size={30} decorative />
        <span className="font-semibold text-fg">{row.creator.handle}</span>
      </span>
    ),
  },
  { id: "hook", header: "Hook", card: "subtitle", hideBelow: "md", cell: (row) => <span className="text-fg-muted">{row.hook}</span> },
  { id: "score", header: "Flow score", align: "end", sortValue: (row) => row.score, cell: (row) => <span className="text-fg-muted">{row.score}</span> },
  { id: "decide", header: "Decide by", card: "value", cell: (row) => <span className="font-medium text-fg-muted">{row.decideBy}</span> },
];

/** A full AppShell composed the way the brand dashboard will compose it. */
export function ShellDemo() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const waiting = SUBMISSIONS.filter((row) => row.status === "in_review");
  const jordan = CREATORS.maya;

  return (
    <TooltipProvider>
      <AppShell
        nav={BRAND_NAV}
        intensity="calm"
        sideNav={{ activePath: "/brand", homeHref: "/dev/design/shell", storageKey: "flowd.demo.sidenav" }}
        bottomBar={{
          activePath: "/brand",
          action: <IconButton variant="primary" size="lg" label="New bounty" icon={<CirclePlus />} className="shadow-glow-flow" />,
        }}
        topBar={
          <TopBar
            breadcrumbs={<Breadcrumbs items={[{ label: "Lumi", href: "/dev/design/shell" }, { label: "Overview" }]} />}
            onSearch={() => setPaletteOpen(true)}
            actions={
              <Button size="sm" variant="primary" leadingIcon={<CirclePlus />}>
                New bounty
              </Button>
            }
            wallet={<WalletChip escrowCents={500000} href="/brand/wallet" />}
            notifications={<NotificationButton count={3} />}
            userMenu={
              <UserMenu
                avatar={jordan ? <ArtAvatar art={jordan.art} name="Jordan Ellis" size={32} decorative /> : <span />}
                name="Jordan Ellis"
                detail="Brand admin · Lumi"
                sections={[[{ id: "settings", label: "Account settings", href: "/brand/settings" }], [{ id: "out", label: "Sign out", destructive: true, onSelect: () => undefined }]]}
              />
            }
          />
        }
      >
        <div className="grid gap-10">
          <PageHeader
            eyebrow="Overview"
            title="Good morning, Jordan"
            description="14 submissions are waiting. Creators get paid faster when you decide within 48 hours."
            meta={
              <>
                <Badge tone="mint" dot>
                  Bounty funded
                </Badge>
                <Badge tone="neutral">Last 30 days</Badge>
                <TierBadge tier="platinum" size={24} decorative />
              </>
            }
          />

          <KpiRow>
            <StatCard label="Verified views" value={4_212_880} delta={{ ratio: 0.124, against: "vs prior 30 days" }} spark={[310, 322, 305, 340, 368, 361, 392, 405, 398, 431, 452, 470]} />
            <StatCard label="Spend" cents={1_250_000} delta={{ ratio: 0.09, against: "vs prior 30 days" }} spark={[88, 91, 90, 95, 99, 97, 104, 110, 108, 114, 121, 126]} sparkTone="neutral" />
            <StatCard label="Installs" value={3310} delta={{ ratio: 0.183, against: "vs prior 30 days" }} spark={[210, 198, 224, 241, 236, 259, 271, 268, 290, 312, 318, 331]} />
            <StatCard label="Cost per trial" cents={740} delta={{ ratio: -0.214, against: "vs prior 30 days", goodWhen: "down" }} spark={[9.4, 9.1, 9.3, 8.8, 8.9, 8.4, 8.6, 8.2, 8, 8.1, 7.7, 7.4]} sparkTone="neutral" />
          </KpiRow>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <AreaChart
              title="Spend to trials"
              subtitle="Last 30 days · one hue, no rainbow"
              summary="Daily spend rose from about $38 to about $212 over 30 days."
              data={clearedDaily}
              seriesLabel="Spend"
              yFormat={(cents) => formatCents(cents, true)}
              yTooltipFormat={(cents) => formatCents(cents)}
              height={280}
            />
            <FunnelChart title="Funnel" subtitle="Views to paid" summary="4.2 million views led to 3,310 installs and an estimated 214 paid subscriptions." stages={funnelStages} />
          </div>

          <Section title="Needs you" description="Oldest first. A decision with a reason is paid faster, and the clock is yours." level={2}>
            <DataTable
              caption="Submissions waiting for a decision"
              columns={COLUMNS}
              rows={waiting}
              getRowId={(row) => row.id}
              getRowLabel={(row) => row.creator.handle}
              density="compact"
              rowActions={() => [
                { id: "open", label: "Open in review", icon: <Eye />, onSelect: () => undefined },
                { id: "approve", label: "Approve", icon: <Check />, onSelect: () => undefined },
              ]}
            />
          </Section>
        </div>
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        hotkey="mod+k"
        groups={[
          {
            heading: "Go to",
            items: [
              { id: "overview", label: "Overview", icon: <LayoutDashboard />, href: "/dev/design/shell/demo" },
              { id: "bounties", label: "Bounties", icon: <Target />, href: "/dev/design/shell/demo" },
              { id: "wallet", label: "Wallet", icon: <WalletMinimal />, href: "/dev/design/shell/demo" },
            ],
          },
        ]}
      />
    </TooltipProvider>
  );
}
