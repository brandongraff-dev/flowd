/**
 * Shell actions for the command palette: things you do rather than places you go. An action either navigates (`href`) or names a
 * shell callback (`action`), which the consumer maps in the palette's `onAction`. Pure data, filtered by role.
 */

import type { Role } from "@/lib/contract/types";
import { PERSONA_LIST } from "@/lib/session/personas";
import { ROLE_TO_PERSONA } from "@/lib/session/constants";
import type { ActionId, SearchEntry, SearchIconName } from "./types";

type ActionRole = Role | "any";

interface ActionDef {
  id: string;
  label: string;
  hint?: string;
  icon: SearchIconName;
  keywords: readonly string[];
  shortcut?: readonly string[];
  boost: number;
  roles: readonly ActionRole[];
  href?: string;
  action?: ActionId;
}

const DEFS: readonly ActionDef[] = [
  // creator
  { id: "make-a-take", label: "Make a take", hint: "Studio", icon: "film", keywords: ["record", "new video", "script", "teleprompter", "studio"], boost: 9, roles: ["creator"], href: "/creator/studio" },
  { id: "cash-out", label: "Cash out", hint: "Wallet", icon: "banknote", keywords: ["withdraw", "payout", "instant", "money", "transfer"], boost: 9, roles: ["creator"], href: "/creator/wallet" },
  { id: "claim-drop", label: "Claim today's Daily Drop", hint: "Home", icon: "zap", keywords: ["daily drop", "spots", "16:00", "claim", "drop"], boost: 8, roles: ["creator"], href: "/creator" },
  { id: "find-bounty", label: "Find a bounty", hint: "Feed", icon: "target", keywords: ["browse", "work", "matches", "funded"], boost: 7, roles: ["creator"], href: "/creator/feed" },
  { id: "copy-profile-link", label: "Copy my profile link", hint: "joinflowd.io/c/maya.makes", icon: "copy", keywords: ["share", "link in bio", "storefront", "url"], boost: 5, roles: ["creator"], action: "copy-profile-link" },
  { id: "toggle-numbers-off", label: "Hide earnings numbers", hint: "Wellbeing", icon: "eye", keywords: ["numbers off", "wellbeing", "quiet", "hide money", "privacy"], boost: 4, roles: ["creator"], action: "toggle-numbers-off" },
  { id: "open-flo", label: "Ask Flo", hint: "AI copilot", icon: "sparkles", keywords: ["ai", "assistant", "script", "caption", "hook rewrite", "help me"], boost: 8, roles: ["creator"], action: "open-flo" },
  // brand
  { id: "start-bounty", label: "Start a bounty", hint: "AI builder", icon: "wand", keywords: ["new bounty", "create", "launch", "brief", "flo", "fund"], boost: 10, roles: ["brand_member"], href: "/brand/bounties/new" },
  { id: "fund-wallet", label: "Fund wallet", hint: "Escrow", icon: "wallet", keywords: ["top up", "add money", "escrow", "card", "pay"], boost: 8, roles: ["brand_member"], href: "/brand/wallet" },
  { id: "review-queue", label: "Review submissions", hint: "Queue", icon: "review", keywords: ["approve", "queue", "inbox zero", "decide"], boost: 9, roles: ["brand_member"], href: "/brand/review" },
  { id: "see-funnel", label: "See the funnel", hint: "Analytics", icon: "chart", keywords: ["roas", "payback", "cost per trial", "installs"], boost: 6, roles: ["brand_member"], href: "/brand/analytics" },
  { id: "open-flo-brand", label: "Draft a bounty with Flo", hint: "AI copilot", icon: "sparkles", keywords: ["ai", "copilot", "draft", "app store link"], boost: 7, roles: ["brand_member"], href: "/brand/bounties/new" },
  // admin
  { id: "advance-24h", label: "Advance demo clock by 24 hours", hint: "Demo", icon: "clock", keywords: ["time travel", "settle", "window close", "demo clock"], boost: 6, roles: ["admin"], action: "advance-clock-24h" },
  { id: "advance-72h", label: "Advance demo clock by 72 hours", hint: "Demo", icon: "clock", keywords: ["time travel", "settle", "fraud check", "demo clock"], boost: 6, roles: ["admin"], action: "advance-clock-72h" },
  { id: "payout-preview", label: "Preview the Friday payout run", hint: "Payouts", icon: "banknote", keywords: ["friday", "18:00 utc", "weekly payout", "holds"], boost: 7, roles: ["admin"], href: "/admin/payouts" },
  // everyone
  { id: "toggle-theme", label: "Switch theme", hint: "Light or dark", icon: "moon", keywords: ["dark mode", "light mode", "appearance", "theme", "night"], boost: 5, roles: ["any"], action: "toggle-theme" },
  { id: "toggle-reduce-glass", label: "Reduce glass", hint: "Accessibility", icon: "palette", keywords: ["transparency", "contrast", "solid", "blur", "accessibility", "glass"], boost: 4, roles: ["any"], action: "toggle-reduce-glass" },
  { id: "show-shortcuts", label: "Keyboard shortcuts", hint: "Help", icon: "keyboard", keywords: ["hotkeys", "keys", "cheat sheet", "shortcuts"], boost: 3, shortcut: ["?"], roles: ["any"], action: "show-shortcuts" },
  { id: "reset-demo", label: "Reset demo data", hint: "Demo", icon: "refresh", keywords: ["restart", "start over", "seed", "clear changes"], boost: 3, roles: ["any"], action: "reset-demo" },
  { id: "sign-out", label: "Sign out", hint: "Account", icon: "logout", keywords: ["log out", "switch account"], boost: 3, roles: ["creator", "brand_member", "admin"], action: "sign-out" },
];

function fromDef(def: ActionDef): SearchEntry {
  return {
    id: `action:${def.id}`,
    kind: "action",
    group: "Actions",
    label: def.label,
    hint: def.hint,
    href: def.href,
    action: def.action,
    icon: def.icon,
    keywords: def.keywords,
    shortcut: def.shortcut,
    boost: def.boost,
  };
}

/** The actions available to a role (a null role is a visitor: theme, glass, shortcuts and the persona switcher). */
export function actionsForRole(role: Role | null): SearchEntry[] {
  const current = role ? ROLE_TO_PERSONA[role] : null;
  const defs = DEFS.filter((d) => d.roles.includes("any") || (role !== null && d.roles.includes(role)));
  const switches: SearchEntry[] = PERSONA_LIST.filter((p) => p.key !== current).map((p) => ({
    id: `action:switch-persona:${p.key}`,
    kind: "action",
    group: "Actions",
    label: `Switch to ${p.firstName} (${p.roleLabel.toLowerCase()})`,
    hint: p.title,
    action: `switch-persona:${p.key}` as ActionId,
    icon: "swap",
    keywords: ["persona", "switch account", "demo", "role", p.displayName.toLowerCase(), p.roleLabel.toLowerCase(), p.org?.toLowerCase() ?? "", p.handle ?? ""].filter(Boolean),
    boost: 4,
  }));
  return [...defs.map(fromDef), ...switches];
}

/** Every shell action id the catalogue can produce, so the shell can assert it handles all of them. */
export function allActionIds(): ActionId[] {
  const ids = new Set<ActionId>();
  for (const role of [null, "creator", "brand_member", "admin"] as const) {
    for (const entry of actionsForRole(role)) if (entry.action) ids.add(entry.action);
  }
  return [...ids];
}

/** The persona key an action switches to, or null for any other action. */
export function personaOfAction(action: ActionId): "brand" | "creator" | "admin" | null {
  if (!action.startsWith("switch-persona:")) return null;
  const key = action.slice("switch-persona:".length);
  return key === "brand" || key === "creator" || key === "admin" ? key : null;
}
