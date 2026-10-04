/**
 * The shape of the demo world held by the store.
 *
 * `DemoState` is plain data (no functions, no classes) so it can be persisted as an overlay, copied, diffed and used server-side by the mock API.
 * Entity tables sit at the top level (`state.bounties[id]`), then the singleton docs, then session, clock and bookkeeping.
 */

import {
  CONSTANTS,
  CONTRACT_VERSION,
  DEMO_NOW,
  type AdminMetrics,
  type AppId,
  type BrandId,
  type BrandMemberId,
  type CreatorId,
  type IsoTimestamp,
  type Personas,
  type StateOfAppUgc,
  type Ticker,
  type UserId,
  type Waitlist,
  type World,
} from "@/lib/contract/types";
import { DOC_NAMES, ROW_TABLES, type DocName, type RowOf, type RowTableName } from "./tables";

/** One `Record<id, row>` per row table. */
export type Tables = { [K in RowTableName]: Record<string, RowOf<K>> };

/** The object-shaped fixtures. */
export interface Docs {
  world: World;
  ticker: Ticker;
  waitlist: Waitlist;
  state_of_app_ugc: StateOfAppUgc;
  admin_metrics: AdminMetrics;
}

/** The three demo personas. `admin` is Ops. */
export type Persona = "brand" | "creator" | "admin";

/** Who is signed in and which workspace they are looking at. `persona: null` is signed out. */
export interface Session {
  persona: Persona | null;
  user_id: UserId | null;
  /** Set when the persona is a creator. */
  creator_id: CreatorId | null;
  /** The workspace being looked at (an agency can switch between client brands). */
  brand_id: BrandId | null;
  /** The brand's active app (the workspace's app switcher). */
  app_id: AppId | null;
  member_id: BrandMemberId | null;
}

/** The demo clock. Every timestamp the store writes is `now`; admin can advance it to trigger clearing and payout runs. */
export interface Clock {
  now: IsoTimestamp;
  /** Hours advanced since the world was seeded or reset (0 at the start). */
  advanced_hours: number;
}

/** Bookkeeping that is not an entity. */
export interface Meta {
  session: Session;
  clock: Clock;
  /** Last number used per id sequence (see `SEQUENCES`). Absent keys are computed from the tables on first use. */
  counters: Record<string, number>;
  /** Ids of base rows the user removed, per table (so a table loaded later does not bring them back). */
  tombstones: Partial<Record<RowTableName, string[]>>;
  /** Which tables and docs hold their base fixture data. Core tables and docs flip together; heavy tables one at a time. */
  loaded: Partial<Record<RowTableName | DocName, boolean>>;
}

export type DemoState = Tables & Docs & Meta;

/** Persona ids from the contract's demo world (the fixture agrees; used before the world doc is loaded). */
export const DEFAULT_PERSONAS: Personas = {
  creator: { user_id: "usr_maya", creator_id: "cr_maya", handle: "maya.makes" },
  brand: { user_id: "usr_jordan", member_id: "bm_lumi_jordan", brand_id: "br_lumi", app_id: "app_lumi" },
  admin: { user_id: "usr_ops" },
};

export const SIGNED_OUT: Session = { persona: null, user_id: null, creator_id: null, brand_id: null, app_id: null, member_id: null };

/** The session of a persona, from the world doc's persona table. */
export function sessionFor(persona: Persona, personas: Personas = DEFAULT_PERSONAS): Session {
  if (persona === "creator") return { persona, user_id: personas.creator.user_id, creator_id: personas.creator.creator_id, brand_id: null, app_id: null, member_id: null };
  if (persona === "brand") {
    return { persona, user_id: personas.brand.user_id, creator_id: null, brand_id: personas.brand.brand_id, app_id: personas.brand.app_id, member_id: personas.brand.member_id };
  }
  return { persona, user_id: personas.admin.user_id, creator_id: null, brand_id: null, app_id: null, member_id: null };
}

const EMPTY_WORLD: World = {
  id: "world_flowd",
  now: DEMO_NOW,
  launch_date: CONSTANTS.world.launch_date,
  seed: 0,
  contract_version: CONTRACT_VERSION,
  personas: DEFAULT_PERSONAS,
  counts: {},
};

const EMPTY_TICKER: Ticker = {
  totals: {
    total_paid_cents: 0,
    paid_today_cents: 0,
    paid_7d_cents: 0,
    creators_paid: 0,
    payouts_count: 0,
    posts_cleared: 0,
    typical_creator_30d_cents: 0,
    p25_creator_30d_cents: 0,
    p75_creator_30d_cents: 0,
    top_decile_creator_30d_cents: 0,
    active_creators_30d: 0,
    updated_at: DEMO_NOW,
  },
  events: [],
};

const EMPTY_WAITLIST: Waitlist = {
  totals: { creators: 0, brands: 0, invites_accepted: 0, updated_at: DEMO_NOW },
  leaders: [],
  demo_position: 0,
  demo_referrals: 0,
};

const EMPTY_STATE_OF_APP_UGC: StateOfAppUgc = {
  quarter: "2026-Q3",
  quarters: ["2026-Q3"],
  published_at: DEMO_NOW,
  title: "State of App UGC",
  settled_posts: 0,
  total_views: 0,
  total_paid_cents: 0,
  categories: [],
  hooks: [],
  formats: [],
  methodology: "",
  caveats: [],
};

const EMPTY_ADMIN_METRICS: AdminMetrics = {
  as_of: DEMO_NOW,
  targets: [],
  market_health: {
    fill_rate_48h: 0,
    median_fill_hours: 0,
    median_decision_hours: 0,
    decided_in_sla_ratio: 0,
    cleared_on_eta_ratio: 0,
    disputes_resolved_48h_ratio: 0,
    funded_live_ratio: 1,
    first_dollar_median_hours: 0,
    active_creators_per_live_bounty: 0,
  },
  queues: { fraud_open: 0, disputes_open: 0, verification_open: 0, safety_new: 0, sla_stale: 0, sla_breached: 0, payouts_held: 0 },
  next_payout_run: { run_id: "run_2026-10-09", scheduled_for: "2026-10-09T18:00:00Z", creators: 0, total_cents: 0, holds: 0, held_cents: 0 },
  summary: { gmv_30d_cents: 0, fees_30d_cents: 0, paid_total_cents: 0, active_creators_30d: 0, live_bounties: 0, brands_active_30d: 0 },
  promise_metrics: [],
  alerts: [],
};

/** Placeholder docs used until the fixtures are loaded (valid, empty, never undefined). */
export function emptyDocs(): Docs {
  return {
    world: EMPTY_WORLD,
    ticker: EMPTY_TICKER,
    waitlist: EMPTY_WAITLIST,
    state_of_app_ugc: EMPTY_STATE_OF_APP_UGC,
    admin_metrics: EMPTY_ADMIN_METRICS,
  };
}

/** An empty world: every table `{}`, placeholder docs, signed out, the clock at the demo "now". */
export function createEmptyState(): DemoState {
  const tables = {} as Record<string, Record<string, unknown>>;
  for (const t of ROW_TABLES) tables[t] = {};
  return {
    ...(tables as unknown as Tables),
    ...emptyDocs(),
    session: SIGNED_OUT,
    clock: { now: DEMO_NOW, advanced_hours: 0 },
    counters: {},
    tombstones: {},
    loaded: {},
  };
}

/** Keys of `DemoState` a selector may depend on: every row table, every doc, `session` and `clock`. */
export type StateKey = RowTableName | DocName | "session" | "clock";
export const DOC_KEYS: readonly DocName[] = DOC_NAMES;

/** True when a table (or doc) holds its base fixture data. */
export const isLoaded = (s: Pick<DemoState, "loaded">, table: RowTableName | DocName): boolean => s.loaded[table] === true;
