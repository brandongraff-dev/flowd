/**
 * flowd shell kit. Import from "@/components/shell". These are the structural pieces the three route-group shells
 * (brand, creator, admin) and every page compose; the shells themselves live with their feature areas.
 *
 *   FRAME      <AppShell/>  <SideNav/>  <TopBar/>  <MobileBottomBar/>  <NavItem/>  (+ SearchTrigger, WalletChip, NotificationButton, UserMenu)
 *   PAGE       <Container/>  <PageHeader/>  <Section/>  <Breadcrumbs/>
 *   DATA       <StatCard/>  <KpiRow/>  <Delta/>  <DataTable/>  <Pagination/>  <Timeline/>
 *   MARKETING  <PhoneFrame/>  <Marquee/>  <PayoutTicker/>  <AnimatedBeam/>  <FlowLines/>  <SectionReveal/>  <RevealItem/>
 *   DELIGHT    <ConfettiBurst/>  <PayoutArrive/>     creator earned outcomes ONLY (cleared money, approvals, tier-ups)
 *   DEMO       <RoleGate/>  <DemoBanner/>  <DemoTag/>     role gating with a "switch persona" screen; the demo-data strip and tag
 *
 * Also exported for convenience: the providers and theme control that already live in this folder.
 *
 * Rules: a screen used hundreds of times a day (review queue, tables) gets no entrance animation; reveals and celebrations are for
 * rare moments; every animation has a reduced-motion equivalent; nav items are real links; tables degrade to cards on phones.
 */

export { AppShell, type AppShellProps } from "./app-shell";
export { SideNav, type SideNavProps } from "./side-nav";
export { NavItem, type NavItemProps } from "./nav-item";
export { MobileBottomBar, type MobileBottomBarProps } from "./mobile-bottom-bar";
export {
  TopBar,
  SearchTrigger,
  WalletChip,
  NotificationButton,
  UserMenu,
  type TopBarProps,
  type SearchTriggerProps,
  type WalletChipProps,
  type NotificationButtonProps,
  type UserMenuProps,
  type UserMenuItem,
} from "./top-bar";
export { flattenNav, matchesEntry, resolveActiveHref, type NavEntry, type NavGroup } from "./nav";
export { Container, type ContainerProps } from "./container";
export { PageHeader, Section, type PageHeaderProps, type SectionProps } from "./page-header";
export { Breadcrumbs, type BreadcrumbsProps, type BreadcrumbItem } from "./breadcrumbs";
export { StatCard, KpiRow, Delta, type StatCardProps, type KpiRowProps, type DeltaProps } from "./stat-card";
export { formatDelta } from "./delta-format";
export {
  DataTable,
  type DataTableProps,
  type DataColumn,
  type RowAction,
  type SortState,
  type SortDirection,
  type SortValue,
} from "./data-table";
export { Pagination, type PaginationProps } from "./pagination";
export { pageWindow } from "./pagination-window";
export { Timeline, type TimelineProps, type TimelineItem, type TimelineState } from "./timeline";
export { PhoneFrame, type PhoneFrameProps } from "./phone-frame";
export { Marquee, type MarqueeProps } from "./marquee";
export { PayoutTicker, type PayoutTickerProps, type PayoutEvent } from "./payout-ticker";
export { ConfettiBurst, type ConfettiBurstProps } from "./confetti-burst";
export { PayoutArrive, type PayoutArriveProps } from "./payout-arrive";
export { AnimatedBeam, FlowLines, type AnimatedBeamProps, type FlowLinesProps } from "./animated-beam";
export { SectionReveal, RevealItem, type SectionRevealProps, type RevealItemProps } from "./section-reveal";
export { RoleGate, type RoleGateProps } from "./role-gate";
export { DemoBanner, DemoTag, DEMO_BANNER_DISMISSED_KEY, type DemoBannerProps, type DemoTagProps } from "./demo-banner";
export { useStoredBoolean } from "./use-stored-boolean";
export { CreatorShell } from "./creator-shell";
export { CREATOR_DESTINATIONS, CREATOR_MOBILE_ITEMS, CREATOR_MORE_HREF, creatorNav, mobileActivePath, type CreatorDestination, type CreatorNavBadges } from "./creator-nav";
export { CreatorNotifications, type CreatorNotificationsProps } from "./creator-notifications";
export { Providers } from "./providers";
export { ThemeProvider, useTheme } from "./theme-provider";
export { ThemeSwitch } from "./theme-switch";
export { AppToaster } from "./app-toaster";
