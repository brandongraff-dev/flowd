import {
  Banknote,
  ChartColumn,
  Clapperboard,
  Ellipsis,
  FileCheck2,
  Gavel,
  GraduationCap,
  HeartPulse,
  House,
  Inbox,
  Layers,
  ListChecks,
  Medal,
  Package,
  Receipt,
  Settings,
  Share2,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Trophy,
  UserRound,
  UsersRound,
  Video,
  WalletMinimal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavEntry, NavGroup } from "./nav";

/** What the creator portal shows next to its destinations: live counts that need the person (never vanity badges). */
export interface CreatorNavBadges {
  /** Unread threads and offers waiting for a reply. */
  inbox?: number;
  /** Submissions that wait on the creator: changes requested, or approved and not posted yet. */
  submissions?: number;
}

const badge = (count: number | undefined): string | undefined => (count && count > 0 ? String(count > 99 ? "99+" : count) : undefined);

/** One destination with the one-line "what is this" used by the More page and the command palette. */
export interface CreatorDestination extends NavEntry {
  blurb: string;
}

type Dest = Omit<CreatorDestination, "icon"> & { icon: LucideIcon };

const GROUPS: readonly { id: string; label?: string; items: readonly Dest[] }[] = [
  {
    id: "overview",
    items: [
      { href: "/creator", label: "Home", icon: House, exact: true, mobile: true, blurb: "Money Clock, Daily Drop, your streak and what to post today." },
      { href: "/creator/insights", label: "Insights", icon: ChartColumn, blurb: "Why your posts won, and what to make next." },
    ],
  },
  {
    id: "earn",
    label: "Earn",
    items: [
      { href: "/creator/feed", label: "Bounty feed", shortLabel: "Feed", icon: Target, mobile: true, blurb: "Funded bounties ranked for you, with what each pays at the median." },
      { href: "/creator/studio", label: "Studio", icon: Clapperboard, blurb: "Pick a bounty, write the script, check the hook and submit." },
      { href: "/creator/submissions", label: "Submissions", icon: ListChecks, blurb: "Where each video stands, with a decide-by time." },
      { href: "/creator/posts", label: "Posts", icon: Video, blurb: "Live posts, views counted and what each has earned." },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      { href: "/creator/wallet", label: "Wallet", icon: WalletMinimal, mobile: true, blurb: "Pending, cleared and paid out, each with a date." },
      { href: "/creator/inbox", label: "Inbox", icon: Inbox, blurb: "Offers, counters and messages from brands." },
      { href: "/creator/rate-card", label: "Rate card", icon: Banknote, blurb: "Your prices, so brands can book you directly." },
      { href: "/creator/rights", label: "My licences", icon: FileCheck2, blurb: "Where your videos run, and until when." },
      { href: "/creator/tax", label: "Tax Desk", icon: Receipt, blurb: "W-9, year to date, and what to set aside." },
    ],
  },
  {
    id: "grow",
    label: "Grow",
    items: [
      { href: "/creator/leaderboard", label: "Leaderboard", icon: Trophy, blurb: "Your cohort of about 30 peers this week." },
      { href: "/creator/tiers", label: "Tiers", icon: Medal, blurb: "Bronze to Elite, and what is missing for the next one." },
      { href: "/creator/crews", label: "Crews", icon: UsersRound, blurb: "Make videos with a crew and share a weekly goal." },
      { href: "/creator/tournaments", label: "Tournaments", icon: Swords, blurb: "Hook battles with prize pools." },
      { href: "/creator/academy", label: "Academy", icon: GraduationCap, blurb: "Five-minute lessons. Free, never required." },
      { href: "/creator/remix", label: "Remix library", icon: Layers, blurb: "Formats and hooks that won, ready to remix." },
      { href: "/creator/referrals", label: "Referrals", icon: Share2, blurb: "Invite a creator. flowd pays the reward." },
      { href: "/creator/wrapped", label: "Wrapped", icon: Sparkles, blurb: "Your month or year in a few stories." },
    ],
  },
  {
    id: "you",
    label: "You",
    items: [
      { href: "/creator/flo", label: "Ask Flo", icon: Sparkles, blurb: "Scripts, hook rewrites and caption ideas." },
      { href: "/creator/profile", label: "Profile", icon: UserRound, blurb: "Your public page, portfolio and reputation." },
      { href: "/creator/specs", label: "Spec uploads", icon: Package, blurb: "Sell videos brands can license." },
      { href: "/creator/auctions", label: "Auction slots", icon: Gavel, blurb: "Platinum and above: sealed-bid slots." },
      { href: "/creator/safety", label: "Scam Shield", icon: ShieldAlert, blurb: "Spot scams, report them, and check account health." },
      { href: "/creator/wellbeing", label: "Wellbeing", icon: HeartPulse, blurb: "Quiet hours, numbers off and rest weeks." },
      { href: "/creator/settings", label: "Settings", icon: Settings, blurb: "Linked accounts, payout methods, privacy." },
    ],
  },
];

/** Every destination of the creator portal, with its group label. The side nav, the More page and tests share this list. */
export const CREATOR_DESTINATIONS: readonly (CreatorDestination & { group: string })[] = GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label ?? "Overview" })));

/** The side navigation, with live counts on Inbox and Submissions. */
export function creatorNav(badges: CreatorNavBadges = {}): readonly NavGroup[] {
  return GROUPS.map((group) => ({
    id: group.id,
    ...(group.label ? { label: group.label } : {}),
    items: group.items.map((item): NavEntry => {
      const count = item.href === "/creator/inbox" ? badges.inbox : item.href === "/creator/submissions" ? badges.submissions : undefined;
      const text = badge(count);
      const entry: NavEntry = { href: item.href, label: item.label, icon: item.icon, ...(item.shortLabel ? { shortLabel: item.shortLabel } : {}), ...(item.exact ? { exact: true } : {}) };
      return text ? { ...entry, badge: text } : entry;
    }),
  }));
}

/** The phone bottom bar: Home, Feed, [Studio in the centre], Wallet, More. */
export const CREATOR_MORE_HREF = "/creator/more";

export const CREATOR_MOBILE_ITEMS: readonly NavEntry[] = [
  { href: "/creator", label: "Home", icon: House, exact: true },
  { href: "/creator/feed", label: "Bounty feed", shortLabel: "Feed", icon: Target },
  { href: "/creator/wallet", label: "Wallet", icon: WalletMinimal },
  { href: CREATOR_MORE_HREF, label: "More", icon: Ellipsis },
];

/** Paths that live under the bottom bar's own tabs (bounty and brand pages are part of the feed, the onboarding is Home). */
const OWN_TABS: readonly (readonly [prefix: string, tab: string])[] = [
  ["/creator/feed", "/creator/feed"],
  ["/creator/bounties", "/creator/feed"],
  ["/creator/brands", "/creator/feed"],
  ["/creator/wallet", "/creator/wallet"],
  ["/creator/studio", "/creator/studio"],
];

/** The path the bottom bar should treat as active: a destination that has no tab of its own lights up More. */
export function mobileActivePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/creator" || !path.startsWith("/creator")) return path;
  const own = OWN_TABS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return own ? own[1] : CREATOR_MORE_HREF;
}
