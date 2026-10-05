import {
  Anchor,
  ChartColumn,
  Compass,
  FileCheck2,
  FlaskConical,
  Funnel,
  Gauge,
  Gavel,
  Handshake,
  Layers,
  LayoutDashboard,
  Library,
  Lightbulb,
  Link2,
  ListChecks,
  Map as MapIcon,
  Megaphone,
  Plug,
  Scale,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Store,
  Target,
  TrendingUp,
  Users,
  UsersRound,
  WalletMinimal,
  Building2,
  CodeXml,
  type LucideIcon,
} from "lucide-react";
import type { NavEntry, NavGroup } from "./nav";

/** Live counts the side nav shows beside a destination ("14" waiting in the review queue). Zero hides the badge. */
export interface BrandNavBadges {
  review?: number;
  disputes?: number;
}

const entry = (href: string, label: string, icon: LucideIcon, extra: Partial<NavEntry> = {}): NavEntry => ({ href, label, icon, ...extra });

/**
 * The brand dashboard's destinations, in the groups from the build brief: Overview, Bounties, Review, Insights, Creators, Market, Money,
 * Setup. Labels name the content, not the container (apple-design). Four entries ride the mobile bottom bar; the rest live in the drawer
 * and the command palette. Insights is the analytics layer: Money Map first, then the modules in the order a brand asks the questions.
 */
export function brandNav(badges: BrandNavBadges = {}): NavGroup[] {
  return [
    {
      id: "overview",
      items: [entry("/brand", "Overview", LayoutDashboard, { exact: true, mobile: true })],
    },
    {
      id: "bounties",
      label: "Bounties",
      items: [
        entry("/brand/bounties", "Bounties", Target, { mobile: true }),
        entry("/brand/library", "Creative library", Library),
        entry("/brand/promote", "Winner promotion", Megaphone),
      ],
    },
    {
      id: "review",
      label: "Review",
      items: [
        entry("/brand/review", "Review queue", ListChecks, { mobile: true, shortLabel: "Review", ...(badges.review ? { badge: badges.review } : {}) }),
        entry("/brand/disputes", "Disputes", Scale, badges.disputes ? { badge: badges.disputes } : {}),
        entry("/brand/compliance", "Compliance QA", ShieldCheck),
      ],
    },
    {
      id: "insights",
      label: "Insights",
      items: [
        entry("/brand/insights", "Money Map", MapIcon, { exact: true }),
        entry("/brand/insights/funnel-doctor", "Funnel Doctor", Stethoscope),
        entry("/brand/insights/hooks", "Hooks", Anchor),
        entry("/brand/insights/creators", "Creators", Users),
        entry("/brand/insights/cohorts", "Cohorts", Layers),
        entry("/brand/insights/budget", "Budget", Gauge),
        entry("/brand/insights/experiments", "Experiments", FlaskConical),
        entry("/brand/insights/benchmarks", "Benchmarks", ChartColumn),
        entry("/brand/insights/ask", "Ask", Sparkles),
        entry("/brand/analytics", "Funnel explorer", Funnel),
      ],
    },
    {
      id: "creators",
      label: "Creators",
      items: [entry("/brand/creators", "Discover creators", Compass), entry("/brand/offers", "Direct offers", Handshake)],
    },
    {
      id: "market",
      label: "Market",
      items: [entry("/brand/market", "Market view", TrendingUp), entry("/brand/auctions", "Auctions", Gavel), entry("/brand/specs", "Spec Market", Store)],
    },
    {
      id: "money",
      label: "Money",
      items: [
        entry("/brand/wallet", "Wallet", WalletMinimal, { mobile: true }),
        entry("/brand/rights", "Rights Vault", FileCheck2),
        entry("/brand/scorecard", "Brand Scorecard", Lightbulb),
      ],
    },
    {
      id: "setup",
      label: "Setup",
      items: [
        entry("/brand/apps", "Apps", Smartphone),
        entry("/brand/attribution", "Attribution Kit", Link2),
        entry("/brand/integrations", "Integrations", Plug),
        entry("/brand/team", "Team and activity", UsersRound),
        entry("/brand/agency", "Agency roll-up", Building2),
        entry("/brand/developers", "API and webhooks", CodeXml),
        entry("/brand/settings", "Settings", Settings),
      ],
    },
  ];
}
