import type { Role } from "@/lib/contract/types";
import type { PersonaKey } from "@/lib/session/constants";

/** Lucide icon names the palette uses (mapped to components in ./icons.ts). */
export type SearchIconName =
  | "home" | "dashboard" | "target" | "wallet" | "review" | "inbox" | "chart" | "library" | "flask" | "megaphone" | "shield" | "filecheck"
  | "scale" | "gauge" | "users" | "user" | "handshake" | "store" | "gavel" | "link" | "plug" | "team" | "building" | "code" | "settings"
  | "sparkles" | "film" | "receipt" | "trophy" | "medal" | "flame" | "graduation" | "share" | "heart" | "shieldalert" | "moon" | "sun"
  | "palette" | "keyboard" | "logout" | "refresh" | "clock" | "zap" | "calculator" | "piggy" | "badge" | "file" | "news" | "help"
  | "activity" | "phone" | "rocket" | "tag" | "search" | "compass" | "crown" | "banknote" | "trend" | "network" | "database" | "eye"
  | "swap" | "copy" | "bell" | "book" | "mail" | "lock" | "layers" | "play" | "scroll" | "fingerprint" | "globe" | "userplus" | "key"
  | "siren" | "flag" | "ticket" | "percent" | "video" | "bulb" | "package" | "calendar" | "wrench" | "brain" | "wand";

/** What kind of thing a search entry is. */
export type SearchKind = "page" | "action" | "bounty" | "creator" | "brand" | "app" | "submission" | "post" | "lesson";

/** Actions the shell implements (the entry carries the id; the consumer maps it to a callback). */
export type ActionId =
  | "toggle-theme"
  | "toggle-reduce-glass"
  | "open-flo"
  | "show-shortcuts"
  | "copy-profile-link"
  | "toggle-numbers-off"
  | "advance-clock-24h"
  | "advance-clock-72h"
  | "reset-demo"
  | "sign-out"
  | `switch-persona:${PersonaKey}`;

export interface SearchEntry {
  /** Stable: "page:/brand/review", "bounty:bnty_lumi_editwithme", "action:toggle-theme". */
  id: string;
  kind: SearchKind;
  /** Group heading in the palette ("Go to", "Bounties"). */
  group: string;
  label: string;
  /** Muted text after the label: a path group, a status, a tier. */
  hint?: string;
  /** Navigates here. */
  href?: string;
  /** Or runs this shell action. */
  action?: ActionId;
  icon: SearchIconName;
  /** Extra words that should match ("withdraw" for Cash out). */
  keywords: readonly string[];
  /** Display-only key sequence ("g", "w"). Wire it with `useKeySequence`. */
  shortcut?: readonly string[];
  /** Static weight 0 to 10 so common destinations win ties. */
  boost: number;
}

/** A character range in the label that matched, for highlighting. `end` is exclusive. */
export interface MatchRange {
  start: number;
  end: number;
}

export interface SearchResult {
  entry: SearchEntry;
  /** Higher is better. Only meaningful for ordering inside one query. */
  score: number;
  /** Where the query matched in the label (merged, sorted). Empty when it matched a keyword or hint. */
  matches: readonly MatchRange[];
}

export interface SearchGroup {
  heading: string;
  results: readonly SearchResult[];
}

export interface SearchIndex {
  /** Who it was built for. */
  role: Role | null;
  entries: readonly SearchEntry[];
}

// ── data the index is fed (structural: the store rows satisfy these) ──────────────────────────

export interface SearchableBounty {
  id: string;
  title: string;
  status: string;
  app_name?: string;
  brand_name?: string;
  category?: string;
  cpm_cents?: number;
  funded?: boolean;
}

export interface SearchableCreator {
  handle: string;
  display_name: string;
  tier?: string;
  niches?: readonly string[];
}

export interface SearchableBrand {
  id: string;
  name: string;
}

export interface SearchableApp {
  id: string;
  name: string;
  category?: string;
}

export interface SearchableSubmission {
  id: string;
  title: string;
  status: string;
  creator_handle?: string;
  bounty_title?: string;
}

export interface SearchablePost {
  id: string;
  title?: string;
  bounty_title?: string;
  status: string;
}

export interface SearchableLesson {
  slug: string;
  title: string;
  minutes?: number;
}

export interface SearchIndexInput {
  /** Whose index this is. Pages, actions and entity links are filtered and rewritten for the role; null is a signed-out visitor. */
  role: Role | null;
  bounties?: readonly SearchableBounty[];
  creators?: readonly SearchableCreator[];
  brands?: readonly SearchableBrand[];
  apps?: readonly SearchableApp[];
  submissions?: readonly SearchableSubmission[];
  posts?: readonly SearchablePost[];
  lessons?: readonly SearchableLesson[];
  /** Entry ids the person used recently (most recent first): boosted so they surface for a short query. */
  recent?: readonly string[];
  /** Include the shell actions (switch persona, toggle theme, sign out). Default true. */
  includeActions?: boolean;
}
