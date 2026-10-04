/**
 * Notifications and the brand activity log: every action that matters to someone else leaves a trace.
 *
 * Cash events are delivered immediately and never batched; everything else is held until quiet hours end when the recipient has batching on.
 * Creator deep links use the iOS scheme (`flowd://...`); brand and admin links are web routes (DOMAIN E-08).
 */

import type {
  ActivityAction,
  ActorKind,
  BrandId,
  BrandMemberId,
  CreatorId,
  Notification,
  NotificationKind,
  NotificationPriority,
  UserId,
} from "@/lib/contract/types";
import { addMinutes } from "@/lib/engine";
import type { Tx } from "./tx";

/** Kinds that are about money and are always delivered at once. */
const CASH_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(["cash_event", "payout_cleared", "payout_paid", "payout_held", "funding_needed", "bounty_funded"]);

/** The category key in `notification_prefs.categories` a kind belongs to. */
export function categoryOf(kind: NotificationKind): string {
  switch (kind) {
    case "cash_event":
    case "payout_cleared":
    case "payout_paid":
    case "payout_held":
    case "funding_needed":
    case "bounty_funded":
    case "rights_renewed":
      return "money";
    case "approval":
    case "changes_requested":
    case "rejection":
    case "appeal_decided":
    case "review_waiting":
    case "review_sla_warning":
    case "auto_approve_paused":
      return "reviews";
    case "drop_live":
    case "drop_reminder":
      return "drop";
    case "offer_received":
    case "offer_countered":
    case "offer_accepted":
      return "offers";
    case "tournament_update":
    case "crew_invite":
    case "streak_milestone":
    case "streak_freeze_used":
    case "tier_up":
    case "referral_joined":
      return "tournaments";
    case "scam_warning":
    case "dispute_update":
    case "tax_info_needed":
      return "safety";
    default:
      return "tips";
  }
}

/** Minutes since local midnight for an instant in an IANA time zone. */
function localMinutes(now: string, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    const d = new Date(now);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
};

/** Minutes until quiet hours end, or 0 when it is not quiet right now. Handles windows that cross midnight ("22:00" to "08:00"). */
export function minutesUntilQuietEnds(now: string, quiet: { enabled: boolean; start: string; end: string; timezone: string }): number {
  if (!quiet.enabled) return 0;
  const cur = localMinutes(now, quiet.timezone);
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  const inside = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
  if (!inside) return 0;
  return end > cur ? end - cur : end + 24 * 60 - cur;
}

export interface NotifyInput {
  recipient_user_id: UserId;
  audience: ActorKind;
  kind: NotificationKind;
  title: string;
  body: string;
  amount_cents?: number;
  deep_link: string;
  ref_kind?: string;
  ref_id?: string;
  priority?: NotificationPriority;
}

/** Writes a notification and returns it. Skips nothing: preference categories only change how it is delivered (batched), never whether it exists. */
export function notify(tx: Tx, input: NotifyInput): Notification {
  const priority: NotificationPriority = input.priority ?? (CASH_KINDS.has(input.kind) ? "cash" : "normal");
  const prefs = tx.all("notification_prefs").find((p) => p.user_id === input.recipient_user_id);
  let batched = false;
  let deliveredAt: string | undefined = tx.now;
  if (prefs && priority !== "cash" && prefs.batch_non_cash && prefs.categories[categoryOf(input.kind)] !== false) {
    const wait = minutesUntilQuietEnds(tx.now, prefs.quiet_hours);
    if (wait > 0) {
      batched = true;
      deliveredAt = addMinutes(tx.now, wait);
    }
  }
  const row: Notification = {
    id: tx.nextId("ntf"),
    recipient_user_id: input.recipient_user_id,
    audience: input.audience,
    kind: input.kind,
    priority,
    title: input.title,
    body: input.body,
    ...(input.amount_cents !== undefined ? { amount_cents: input.amount_cents } : {}),
    deep_link: input.deep_link,
    ...(input.ref_kind ? { ref_kind: input.ref_kind } : {}),
    ...(input.ref_id ? { ref_id: input.ref_id } : {}),
    batched,
    created_at: tx.now,
    delivered_at: deliveredAt,
  };
  return tx.put("notifications", row);
}

/** Notifies a creator. `path` is the iOS deep-link path, for example "submission/sub_0001". */
export function notifyCreator(tx: Tx, creatorId: CreatorId, n: Omit<NotifyInput, "recipient_user_id" | "audience" | "deep_link"> & { path: string }): Notification | null {
  const creator = tx.get("creators", creatorId);
  if (!creator) return null;
  const { path, ...rest } = n;
  return notify(tx, { ...rest, recipient_user_id: creator.user_id, audience: "creator", deep_link: `flowd://${path}` });
}

/** Users who should hear about a brand's work: the named member when given, else the owners and admins. */
function brandRecipients(tx: Tx, brandId: BrandId, memberId?: BrandMemberId): UserId[] {
  const members = tx.all("brand_members").filter((m) => m.brand_id === brandId && m.status === "active");
  const named = memberId ? members.find((m) => m.id === memberId) : undefined;
  if (named) return [named.user_id];
  const owners = members.filter((m) => m.role === "owner" || m.role === "admin");
  return (owners.length > 0 ? owners : members).slice(0, 2).map((m) => m.user_id);
}

/** Notifies the people who run a brand workspace. `route` is a web route such as "/brand/review". */
export function notifyBrand(tx: Tx, brandId: BrandId, n: Omit<NotifyInput, "recipient_user_id" | "audience" | "deep_link"> & { route: string; member_id?: BrandMemberId }): Notification[] {
  const { route, member_id, ...rest } = n;
  return brandRecipients(tx, brandId, member_id).map((userId) => notify(tx, { ...rest, recipient_user_id: userId, audience: "brand", deep_link: route }));
}

/** Notifies Ops. */
export function notifyAdmins(tx: Tx, n: Omit<NotifyInput, "recipient_user_id" | "audience" | "deep_link"> & { route: string }): Notification[] {
  const { route, ...rest } = n;
  return tx
    .all("users")
    .filter((u) => u.role === "admin" && u.status === "active")
    .map((u) => notify(tx, { ...rest, recipient_user_id: u.id, audience: "admin", deep_link: route }));
}

/** Appends to a brand's team activity log ("Jordan Ellis approved a video from @kai.frames"). */
export function logActivity(
  tx: Tx,
  p: { brand_id: BrandId; action: ActivityAction; summary: string; actor_member_id?: BrandMemberId; target_kind?: string; target_id?: string; metadata?: Record<string, string> },
): void {
  tx.put("activity_log", {
    id: tx.nextId("act"),
    brand_id: p.brand_id,
    ...(p.actor_member_id ? { actor_member_id: p.actor_member_id } : {}),
    action: p.action,
    summary: p.summary,
    ...(p.target_kind ? { target_kind: p.target_kind } : {}),
    ...(p.target_id ? { target_id: p.target_id } : {}),
    metadata: p.metadata ?? {},
    at: tx.now,
  });
}

/** "Jordan Ellis" for the signed-in member, "flowd Ops" for an admin, "Someone" otherwise. */
export function describeActor(tx: Tx, memberId?: string): string {
  const member = memberId ? tx.get("brand_members", memberId) : undefined;
  const user = member ? tx.get("users", member.user_id) : tx.session.persona === "admin" ? tx.get("users", tx.session.user_id) : undefined;
  return user?.display_name ?? "Someone";
}
