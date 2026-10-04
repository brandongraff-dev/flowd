/**
 * The table registry of the demo store.
 *
 * Every synced fixture is either a ROW TABLE (an array of rows, stored as `Record<id, row>` so lookups are O(1) and insertion order is the
 * fixture order) or a DOC (an object-shaped file: world, ticker, waitlist, state_of_app_ugc, admin_metrics). Three row tables have no `id`
 * (daily and hourly metrics): they are keyed by a composite string.
 *
 * Eight tables are HEAVY (over half a megabyte each, about two thirds of all fixture bytes). They are loaded on demand, not with the core set,
 * so the dashboards render fast and the free tools never pay for them. See `load.ts`.
 */

import { FIXTURE_FILES, type FixtureMap, type FixtureName } from "@/lib/contract/types";

/** Object-shaped fixtures: one document each, not a table of rows. */
export const DOC_NAMES = ["world", "ticker", "waitlist", "state_of_app_ugc", "admin_metrics"] as const;
export type DocName = (typeof DOC_NAMES)[number];

/** Every array-shaped fixture. */
export type RowTableName = Exclude<FixtureName, DocName>;

/** The row type of a table. */
export type RowOf<K extends RowTableName> = FixtureMap[K] extends readonly (infer R)[] ? R : never;

/** Every row table, in fixture-catalogue order. */
export const ROW_TABLES: readonly RowTableName[] = FIXTURE_FILES.filter((f) => f.shape === "array").map((f) => f.name as RowTableName);

/** Row tables loaded on demand (large analytics and evidence tables). Everything else is the core set. */
export const HEAVY_TABLES = [
  "video_analyses",
  "view_snapshots",
  "post_metrics_daily",
  "post_metrics_hourly",
  "app_metrics_daily",
  "conversions",
  "revenuecat_events",
  "compliance_checks",
] as const satisfies readonly RowTableName[];
export type HeavyTable = (typeof HEAVY_TABLES)[number];

const HEAVY_SET: ReadonlySet<string> = new Set<string>(HEAVY_TABLES);
export const isHeavy = (table: RowTableName): boolean => HEAVY_SET.has(table);

/** The tables the core load brings in. */
export const CORE_TABLES: readonly RowTableName[] = ROW_TABLES.filter((t) => !isHeavy(t));

/** The three tables with no `id`: a composite key identifies a row. */
const COMPOSITE_KEYS: Partial<Record<RowTableName, (row: never) => string>> = {
  post_metrics_daily: (r: RowOf<"post_metrics_daily">) => `${r.post_id}|${r.date}`,
  post_metrics_hourly: (r: RowOf<"post_metrics_hourly">) => `${r.post_id}|${r.ts}`,
  app_metrics_daily: (r: RowOf<"app_metrics_daily">) => `${r.app_id}|${r.date}`,
} as Partial<Record<RowTableName, (row: never) => string>>;

/** The key of a row: its id, or the composite key of a metrics row. */
export function keyOf<K extends RowTableName>(table: K, row: RowOf<K>): string {
  const composite = COMPOSITE_KEYS[table];
  if (composite) return composite(row as never);
  return (row as { id: string }).id;
}

/** True for the three tables keyed by a composite string. */
export const hasCompositeKey = (table: RowTableName): boolean => table in COMPOSITE_KEYS;

/** Ledger accounts, ids and the other numbered sequences new rows continue (see `ids.ts`). */
export const SEQUENCES = {
  ledg: { table: "ledger", prefix: "ledg_", width: 6 },
  txn: { table: "ledger", prefix: "txn_", width: 6, field: "txn_id" },
  sub: { table: "submissions", prefix: "sub_", width: 4 },
  post: { table: "posts", prefix: "post_", width: 4 },
  mc: { table: "money_clock", prefix: "mc_", width: 4 },
  pay: { table: "payouts", prefix: "pay_", width: 4 },
  ntf: { table: "notifications", prefix: "ntf_", width: 4 },
  act: { table: "activity_log", prefix: "act_", width: 4 },
  offer: { table: "offers", prefix: "offer_", width: 4 },
  save: { table: "bounty_saves", prefix: "save_", width: 4 },
  note: { table: "feedback_notes", prefix: "note_", width: 4 },
  disp: { table: "disputes", prefix: "disp_", width: 3 },
  scam: { table: "scam_reports", prefix: "scam_", width: 3 },
  flag: { table: "fraud_flags", prefix: "flag_", width: 3 },
  fat: { table: "fatigue_alerts", prefix: "fat_", width: 3 },
  auc: { table: "auctions", prefix: "auc_", width: 3 },
  spec: { table: "specs", prefix: "spec_", width: 3 },
  rg: { table: "rights_grants", prefix: "rg_", width: 4 },
  inv: { table: "invoices", prefix: "inv_", width: 4 },
  conv: { table: "conversions", prefix: "conv_", width: 5 },
  rce: { table: "revenuecat_events", prefix: "rce_", width: 6 },
  cc: { table: "compliance_checks", prefix: "cc_", width: 4 },
  thr: { table: "threads", prefix: "thr_", width: 4 },
  lsp: { table: "lesson_progress", prefix: "lsp_", width: 4 },
  ref: { table: "referrals", prefix: "ref_", width: 4 },
  tev: { table: "tier_history", prefix: "tev_", width: 4 },
  tent: { table: "tournament_entries", prefix: "tent_", width: 4 },
  cmem: { table: "crew_members", prefix: "cmem_", width: 4 },
  flo: { table: "flo_suggestions", prefix: "flo_", width: 4 },
  ver: { table: "verifications", prefix: "ver_", width: 3 },
  ad: { table: "ads", prefix: "ad_", width: 3 },
  omsg: { table: null, prefix: "omsg_", width: 4 },
  msg: { table: null, prefix: "msg_", width: 4 },
  bid: { table: null, prefix: "bid_", width: 4 },
  vid: { table: null, prefix: "vid_", width: 4 },
  whd: { table: null, prefix: "whd_", width: 4 },
  pm: { table: null, prefix: "pm_", width: 3 },
  cell: { table: null, prefix: "cell_", width: 3 },
} as const satisfies Record<string, { table: RowTableName | null; prefix: string; width: number; field?: string }>;
export type SequenceName = keyof typeof SEQUENCES;
