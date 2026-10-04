/**
 * Demo data for the shell and brand galleries. Fictional creators, apps and hooks only (CONVENTIONS section 1). Art comes from
 * `artFromName`, so every avatar, icon and thumbnail is generated and stable.
 */

import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Code2,
  Eye,
  FileCheck2,
  FlaskConical,
  Gavel,
  Gauge,
  Handshake,
  LayoutDashboard,
  Library,
  Megaphone,
  Plug,
  Scale,
  Settings,
  ShieldCheck,
  Store,
  Target,
  Users,
  UsersRound,
  WalletMinimal,
  type LucideIcon,
} from "lucide-react";
import { artFromName, type ArtSeed } from "@/components/brand";
import type { NavGroup, PayoutEvent } from "@/components/shell";
import type { PlatformKey } from "@/components/brand";

export interface Person {
  handle: string;
  name: string;
  art: ArtSeed;
}

function person(handle: string, name: string, initials: string): Person {
  return { handle, name, art: artFromName(handle, "avatar", initials) };
}

export const CREATORS: Record<string, Person> = {
  maya: person("@maya.makes", "Maya K", "MK"),
  tej: person("@tej_r", "Tej R", "TR"),
  luna: person("@luna.loops", "Luna A", "LA"),
  dev: person("@devon.tries", "Devon T", "DT"),
  sasha: person("@sasha.snaps", "Sasha B", "SB"),
  omar: person("@omar.builds", "Omar H", "OH"),
  iris: person("@iris.in.focus", "Iris N", "IN"),
  jules: person("@jules.daily", "Jules P", "JP"),
};

export interface AppInfo {
  name: string;
  icon: ArtSeed;
}

function app(name: string): AppInfo {
  return { name, icon: artFromName(name, "icon") };
}

export const APPS: Record<string, AppInfo> = {
  nap: app("Nap Nest"),
  fern: app("Fernlingo"),
  loaf: app("Loafly"),
  kettle: app("Kettle Daily"),
  pixel: app("Pixel Pal"),
  lull: app("Lull"),
};

export function thumbArt(hook: string): ArtSeed {
  return artFromName(hook, "thumb", hook);
}

export interface Submission {
  id: string;
  creator: Person;
  platform: PlatformKey;
  app: AppInfo;
  hook: string;
  score: number;
  views: number;
  earnedCents: number;
  moneyState: "pending" | "cleared" | "paid";
  status: "in_review" | "approved" | "changes_requested" | "posted" | "rejected" | "qa_pending";
  decideBy: string;
  durationSec: number;
}

export const SUBMISSIONS: Submission[] = [
  { id: "sub_0411", creator: CREATORS.maya as Person, platform: "tiktok", app: APPS.nap as AppInfo, hook: "I was wrong about sleep apps", score: 91, views: 412_880, earnedCents: 82_576, moneyState: "pending", status: "posted", decideBy: "Decided", durationSec: 24 },
  { id: "sub_0412", creator: CREATORS.tej as Person, platform: "instagram", app: APPS.nap as AppInfo, hook: "3 AM thoughts, solved", score: 78, views: 0, earnedCents: 0, moneyState: "pending", status: "in_review", decideBy: "Fri 2:00 PM", durationSec: 19 },
  { id: "sub_0413", creator: CREATORS.luna as Person, platform: "tiktok", app: APPS.fern as AppInfo, hook: "Duolingo-free Spanish in a week", score: 64, views: 0, earnedCents: 0, moneyState: "pending", status: "changes_requested", decideBy: "Revision due Sat", durationSec: 31 },
  { id: "sub_0414", creator: CREATORS.dev as Person, platform: "youtube", app: APPS.loaf as AppInfo, hook: "I tracked my bread for 30 days", score: 83, views: 96_240, earnedCents: 19_248, moneyState: "cleared", status: "posted", decideBy: "Decided", durationSec: 42 },
  { id: "sub_0415", creator: CREATORS.sasha as Person, platform: "tiktok", app: APPS.kettle as AppInfo, hook: "Kettlebell day, 12 minutes", score: 52, views: 0, earnedCents: 0, moneyState: "pending", status: "in_review", decideBy: "Fri 6:00 PM", durationSec: 27 },
  { id: "sub_0416", creator: CREATORS.omar as Person, platform: "instagram", app: APPS.pixel as AppInfo, hook: "My dog as a renaissance painting", score: 88, views: 204_110, earnedCents: 40_822, moneyState: "cleared", status: "posted", decideBy: "Decided", durationSec: 16 },
  { id: "sub_0417", creator: CREATORS.iris as Person, platform: "tiktok", app: APPS.lull as AppInfo, hook: "The wind-down routine that works", score: 41, views: 0, earnedCents: 0, moneyState: "pending", status: "rejected", decideBy: "Appeal open", durationSec: 22 },
  { id: "sub_0418", creator: CREATORS.jules as Person, platform: "youtube", app: APPS.fern as AppInfo, hook: "Learn 20 words before lunch", score: 72, views: 31_900, earnedCents: 6_380, moneyState: "pending", status: "posted", decideBy: "Decided", durationSec: 35 },
  { id: "sub_0419", creator: CREATORS.maya as Person, platform: "instagram", app: APPS.loaf as AppInfo, hook: "Sourdough, but make it data", score: 86, views: 148_700, earnedCents: 29_740, moneyState: "paid", status: "posted", decideBy: "Decided", durationSec: 29 },
  { id: "sub_0420", creator: CREATORS.tej as Person, platform: "tiktok", app: APPS.pixel as AppInfo, hook: "Edit like a pro in one tap", score: 69, views: 0, earnedCents: 0, moneyState: "pending", status: "qa_pending", decideBy: "Checking", durationSec: 18 },
  { id: "sub_0421", creator: CREATORS.omar as Person, platform: "tiktok", app: APPS.kettle as AppInfo, hook: "I stopped skipping leg day", score: 80, views: 0, earnedCents: 0, moneyState: "pending", status: "in_review", decideBy: "Sat 10:00 AM", durationSec: 25 },
  { id: "sub_0422", creator: CREATORS.luna as Person, platform: "instagram", app: APPS.nap as AppInfo, hook: "What 8 hours looks like", score: 93, views: 520_300, earnedCents: 104_060, moneyState: "cleared", status: "posted", decideBy: "Decided", durationSec: 21 },
];

export const PAYOUT_EVENTS: PayoutEvent[] = [
  { id: "e1", handle: "@maya.makes", art: (CREATORS.maya as Person).art, amountCents: 2410, app: "Nap Nest", platform: "tiktok" },
  { id: "e2", handle: "@omar.builds", art: (CREATORS.omar as Person).art, amountCents: 4082, app: "Pixel Pal", platform: "instagram" },
  { id: "e3", handle: "@luna.loops", art: (CREATORS.luna as Person).art, amountCents: 1060, app: "Nap Nest", platform: "instagram" },
  { id: "e4", handle: "@devon.tries", art: (CREATORS.dev as Person).art, amountCents: 1925, app: "Loafly", platform: "youtube" },
  { id: "e5", handle: "@jules.daily", art: (CREATORS.jules as Person).art, amountCents: 638, app: "Fernlingo", platform: "youtube" },
  { id: "e6", handle: "@tej_r", art: (CREATORS.tej as Person).art, amountCents: 3270, app: "Kettle Daily", platform: "tiktok" },
  { id: "e7", handle: "@sasha.snaps", art: (CREATORS.sasha as Person).art, amountCents: 1490, app: "Lull", platform: "tiktok" },
];

/** The brand dashboard's navigation (docs/ROUTES.md, "Brand shell"). Used only to show the shell kit with real names. */
function entry(href: string, label: string, icon: LucideIcon, extra: { badge?: number; mobile?: boolean; shortLabel?: string; exact?: boolean } = {}) {
  return { href, label, icon, ...extra };
}

export const BRAND_NAV: NavGroup[] = [
  { items: [entry("/brand", "Overview", LayoutDashboard, { exact: true, mobile: true })] },
  {
    label: "Bounties",
    items: [
      entry("/brand/bounties", "Bounties", Target, { mobile: true }),
      entry("/brand/review", "Review queue", Eye, { badge: 14, mobile: true, shortLabel: "Review" }),
      entry("/brand/disputes", "Disputes", Gavel),
    ],
  },
  {
    label: "Growth",
    items: [
      entry("/brand/analytics", "Funnel", BarChart3),
      entry("/brand/library", "Creative library", Library),
      entry("/brand/tests", "Test planner", FlaskConical),
      entry("/brand/promote", "Winner promotion", Megaphone),
    ],
  },
  {
    label: "Market",
    items: [
      entry("/brand/creators", "Creators", UsersRound),
      entry("/brand/offers", "Offers", Handshake),
      entry("/brand/market", "Market", Gauge),
      entry("/brand/specs", "Spec Market", Store),
    ],
  },
  {
    label: "Money and rights",
    items: [
      entry("/brand/wallet", "Wallet", WalletMinimal, { mobile: true }),
      entry("/brand/rights", "Rights Vault", ShieldCheck),
      entry("/brand/compliance", "Compliance", FileCheck2),
      entry("/brand/scorecard", "Scorecard", Scale),
    ],
  },
  {
    label: "Setup",
    items: [
      entry("/brand/apps", "Apps", Briefcase),
      entry("/brand/attribution", "Attribution Kit", BadgeCheck),
      entry("/brand/integrations", "Integrations", Plug),
      entry("/brand/team", "Team", Users),
      entry("/brand/developers", "Developers", Code2),
      entry("/brand/settings", "Settings", Settings),
    ],
  },
];

