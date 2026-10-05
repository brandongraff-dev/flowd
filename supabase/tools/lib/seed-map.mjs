// Maps the contract fixtures (packages/contract/fixtures/*.json, the demo world) onto the database tables.
//
// One fixture file is one table (entity.table), with the field names of the contract, except:
//   * renamed columns             (model.mjs: world.now -> demo_now, social_accounts.primary -> is_primary, ...) come from the model
//   * normalised child tables     the nested arrays of section 6.1 of DOMAIN.md become rows (CHILDREN below)
//   * read models                 ticker and waitlist become ticker_events / waitlist_entries (SPECIAL below)
//   * columns the backend adds    users.auth_user_id, api_keys.key_hash, ledger_transactions, ... (EXTRA / derived below)
// Nothing is dropped silently: a fixture key that maps to no column and is not listed in DERIVED aborts the generator, so a contract
// change that adds a field cannot be forgotten here.

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------------------

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Deterministic RFC 4122-shaped uuid (version 5 layout) from a string: the same fixture id always gets the same auth.users id. */
export function uuidFrom(s) {
  const h = crypto.createHash('sha1').update(`flowd-seed:${s}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const asArray = (v) => (Array.isArray(v) ? v : [v]);
const addHours = (iso, h) => new Date(new Date(iso).getTime() + h * 3600_000).toISOString().replace('.000Z', 'Z');

/** Fixture fields that are read models of other fixtures or of child rows: the database derives them, so they are not stored. */
const DERIVED = {
  daily_drops: ['spots_total', 'spots_left', 'claims_total'], // spots_total = sum(drop_items.spots_total); spots_left = total - count(drop_claims)
};

/** Columns the backend adds to a contract table (value computed from the fixture record). */
const EXTRA = {
  users: (u) => ({ auth_user_id: uuidFrom(u.id) }),
  // The fixture stores only the prefix and last four characters of a key. The seed hashes a fixed string: no seeded key can be used to call the API.
  api_keys: (k) => ({ key_hash: sha256(`flowd-seed-key:${k.id}`) }),
};

// ---------------------------------------------------------------------------------------------------------------------------------
// normalised child tables: [child table, parent fixture/table, expand(parent) -> rows]
// `strict` copies the listed fields (fixture key -> column, or a function) and aborts if the element carries a key nobody mapped.
// ---------------------------------------------------------------------------------------------------------------------------------

function strict(label, obj, map) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in map)) throw new Error(`seed-map: ${label} has an unmapped fixture key "${k}"`);
    const m = map[k];
    if (m === null) continue; // deliberately not stored (derived)
    if (typeof m === 'function') Object.assign(out, m(v, obj));
    else out[m] = v;
  }
  return out;
}

const same = (...keys) => Object.fromEntries(keys.map((k) => [k, k]));

export const CHILDREN = [
  {
    table: 'payout_methods', parent: 'creators',
    rows: (cr) => (cr.payout_method ? [{
      ...strict('creators.payout_method', cr.payout_method, same('id', 'kind', 'label', 'last4', 'status', 'instant_capable', 'verified_at')),
      creator_id: cr.id, is_default: true, created_at: cr.payout_method.verified_at ?? cr.created_at,
    }] : []),
  },
  {
    table: 'submission_versions', parent: 'submissions',
    rows: (s) => (s.versions ?? []).map((v) => ({
      submission_id: s.id,
      ...strict('submissions.versions', v, {
        ...same('version', 'submitted_at', 'flow_band', 'flow_points', 'hook_band', 'hook_points', 'qa_pass', 'qa_warn', 'qa_fail', 'changes_summary'),
        video: (video) => strict('submissions.versions.video', video, {
          asset_id: 'video_asset_id', duration_ms: 'video_duration_ms', width: 'video_width', height: 'video_height', size_bytes: 'video_size_bytes',
          fps: 'video_fps', has_captions: 'video_has_captions', language: 'video_language', art: 'video_art', uploaded_at: 'video_uploaded_at',
        }),
      }),
    })),
  },
  {
    table: 'qa_checks', parent: 'video_analyses',
    rows: (a) => (a.checks ?? []).map((c) => ({
      video_analysis_id: a.id,
      ...strict('video_analyses.checks', c, { check: 'check_type', ...same('result', 'message', 'blocks_settlement', 'evidence', 'waived_by_user_id') }),
    })),
  },
  {
    table: 'offer_messages', parent: 'offers',
    rows: (o) => (o.thread ?? []).map((m) => ({
      offer_id: o.id,
      ...strict('offers.thread', m, { ...same('id', 'author_role', 'author_user_id', 'type', 'amount_cents', 'rights_days', 'body'), at: 'sent_at' }),
    })),
  },
  {
    table: 'auction_bids', parent: 'auctions',
    rows: (a) => (a.bids ?? []).map((b) => ({
      auction_id: a.id,
      ...strict('auctions.bids', b, same('id', 'brand_id', 'bidder_member_id', 'amount_cents', 'status', 'placed_at', 'escrow_hold_cents', 'pays_cents', 'note')),
    })),
  },
  {
    table: 'spec_licenses', parent: 'specs',
    rows: (sp, n) => (sp.licenses ?? []).map((l) => ({
      id: `lic_${String(n.next()).padStart(4, '0')}`, spec_id: sp.id,
      ...strict('specs.licenses', l, same('brand_id', 'licensed_at', 'price_cents', 'paid_ads_days', 'ends_at')),
    })),
  },
  {
    table: 'rights_renewals', parent: 'rights_grants',
    rows: (g, n) => (g.renewals ?? []).map((r) => ({
      id: `renew_${String(n.next()).padStart(4, '0')}`, grant_id: g.id,
      ...strict('rights_grants.renewals', r, { at: 'renewed_at', ...same('days', 'fee_cents', 'requested_by_member_id') }),
    })),
  },
  {
    table: 'drop_items', parent: 'daily_drops',
    // spots_left is derived (spots_total - count(drop_claims)); the claims become drop_claims below
    rows: (d) => (d.items ?? []).map((it, i) => ({
      drop_id: d.id, position: i + 1,
      ...strict('daily_drops.items', it, { ...same('bounty_id', 'spots_total'), spots_left: null, claims: null }),
    })),
  },
  {
    table: 'drop_claims', parent: 'daily_drops',
    rows: (d) => (d.items ?? []).flatMap((it) => (it.claims ?? []).map((c) => ({
      drop_id: d.id, bounty_id: it.bounty_id,
      ...strict('daily_drops.items.claims', c, same('creator_id', 'claimed_at')),
      expires_at: addHours(c.claimed_at, 24),
    }))),
  },
  {
    table: 'leaderboard_entries', parent: 'leaderboards',
    rows: (lb) => (lb.entries ?? []).map((e) => ({
      leaderboard_id: lb.id, ...strict('leaderboards.entries', e, same('creator_id', 'rank', 'value', 'delta_rank', 'zone')),
    })),
  },
  {
    // the id is GENERATED ALWAYS AS IDENTITY: rows are inserted in parent order and then in the order the fixture lists them
    table: 'dispute_events', parent: 'disputes',
    rows: (d) => (d.events ?? []).map((e) => ({
      dispute_id: d.id, ...strict('disputes.events', e, { at: 'occurred_at', ...same('actor', 'action', 'text', 'user_id') }),
    })),
  },
  {
    table: 'chat_messages', parent: 'threads',
    rows: (t) => (t.messages ?? []).map((m) => ({
      thread_id: t.id,
      ...strict('threads.messages', m, { ...same('id', 'author_role', 'author_user_id', 'kind', 'body', 'read_at', 'warning_code'), at: 'sent_at' }),
    })),
  },
  {
    table: 'webhook_deliveries', parent: 'webhooks',
    rows: (w) => (w.deliveries ?? []).map((d) => {
      const eventId = uuidFrom(d.id);
      const retrying = d.status === 'retrying';
      return {
        webhook_id: w.id,
        ...strict('webhooks.deliveries', d, { ...same('id', 'event', 'status', 'status_code', 'latency_ms'), at: 'attempted_at' }),
        event_id: eventId,
        // the contract lists delivery summaries only: the envelope below is what flowd sends (docs: WebhookEventType, X-Flowd-Signature)
        payload: { id: eventId, type: d.event, created_at: d.at, api_version: '2026-10-01', data: { webhook_id: w.id } },
        attempt: d.status === 'delivered' ? 1 : retrying ? 2 : 7,
        next_retry_at: retrying ? addHours(d.at, 0.5) : null,
        created_at: d.at,
      };
    }),
  },
  {
    // the id is GENERATED ALWAYS AS IDENTITY (see dispute_events)
    table: 'rule_audit_log', parent: 'auto_approve_rules',
    rows: (r) => (r.audit ?? []).map((a) => ({
      rule_id: r.id, ...strict('auto_approve_rules.audit', a, { at: 'occurred_at', ...same('actor_member_id', 'action', 'note') }),
    })),
  },
  {
    table: 'ad_daily', parent: 'ads',
    rows: (ad) => (ad.daily ?? []).map((d) => ({
      ad_id: ad.id, ...strict('ads.daily', d, same('date', 'spend_cents', 'impressions', 'clicks', 'installs', 'trials', 'paid', 'revenue_cents')),
    })),
  },
  {
    table: 'compliance_check_items', parent: 'compliance_checks',
    rows: (c) => (c.checks ?? []).map((i) => ({
      compliance_check_id: c.id, ...strict('compliance_checks.checks', i, same('type', 'result', 'message', 'blocks_settlement', 'evidence')),
    })),
  },
];

/** Fixture keys that a CHILDREN entry has taken over (the generic mapper skips them). */
export const NESTED = {
  creators: ['payout_method'], submissions: ['versions'], video_analyses: ['checks'], offers: ['thread'], auctions: ['bids'], specs: ['licenses'],
  rights_grants: ['renewals'], daily_drops: ['items'], leaderboards: ['entries'], disputes: ['events'], threads: ['messages'], webhooks: ['deliveries'],
  auto_approve_rules: ['audit'], ads: ['daily'], compliance_checks: ['checks'],
};

// ---------------------------------------------------------------------------------------------------------------------------------
// read models: ticker, waitlist
// ---------------------------------------------------------------------------------------------------------------------------------

/** ticker.events become ticker_events; ticker.totals are computed by v_ticker_totals from payouts and the ledger. */
export function tickerRows(ticker) {
  return ticker.events.map((e) => strict('ticker.events', e, { ...same('id', 'kind', 'text', 'amount_cents', 'creator_id', 'handle', 'tier', 'proof_id', 'bounty_id', 'app_name'), at: 'occurred_at' }));
}

/**
 * The waitlist read model is { totals, leaders, demo_position, demo_referrals }. waitlist_entries holds rows, and v_waitlist_totals /
 * v_waitlist_leaders compute the read model from them, so the seed makes rows that reproduce it: the leaders exactly, then enough
 * deterministic filler rows (no real people: handles are absent, emails are on the reserved .test domain) for the totals to match.
 * The filler is generated in SQL (generate_series) so the seed file does not carry 20,000 literal rows.
 */
export function waitlistPlan(wl) {
  const leaders = wl.leaders.map((l, i) => ({
    id: `wl_lead_${String(i + 1).padStart(3, '0')}`, email: `${l.handle.replace(/[^a-z0-9]/gi, '')}.${i + 1}@waitlist.example.test`, kind: l.kind, handle: l.handle,
    referral_code: `lead${String(i + 1).padStart(3, '0')}`, referrals_count: l.referrals, joined_at: l.joined_at,
  }));
  const have = { creator: leaders.filter((l) => l.kind === 'creator').length, brand: leaders.filter((l) => l.kind === 'brand').length };
  return {
    leaders,
    fillCreators: wl.totals.creators - have.creator,
    fillBrands: wl.totals.brands - have.brand,
    invitesAccepted: wl.totals.invites_accepted,
    leaderMinReferrals: Math.min(...wl.leaders.map((l) => l.referrals)),
    leaderLatestJoin: wl.leaders.map((l) => l.joined_at).sort().at(-1),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the ledger: legs -> ledger_transactions (headers) + ledger rows
// ---------------------------------------------------------------------------------------------------------------------------------

const KEY_OF = {
  cpm: (l) => l.post_id && `settle:cpm:${l.post_id}`,
  cpa: (l) => l.conversion_id && `settle:cpa:${l.conversion_id}`,
  flat_fee: (l) => l.post_id && `settle:flat_fee:${l.post_id}`,
  payout: (l) => l.payout_id && `payout:${l.payout_id}`,
  payout_fee: (l) => l.payout_id && `payout:${l.payout_id}`,
  escrow_fund: (l) => l.bounty_id && `fund:${l.bounty_id}`,
  escrow_refund: (l) => l.bounty_id && `refund:${l.bounty_id}`,
  clawback: (l) => l.post_id && `clawback:${l.post_id}`,
};

/** One header per txn_id. kind = the first leg that is not a platform fee; the idempotency key mirrors what the money functions would have used. */
export function ledgerHeaders(legs) {
  const byTxn = new Map();
  for (const l of legs) (byTxn.get(l.txn_id) ?? byTxn.set(l.txn_id, []).get(l.txn_id)).push(l);
  const used = new Set();
  const headers = [];
  for (const [id, ls] of byTxn) {
    const lead = ls.find((l) => l.entry_type !== 'fee' && l.entry_type !== 'processing' && l.entry_type !== 'payout_fee') ?? ls[0];
    let key = (KEY_OF[lead.entry_type]?.(lead)) || `seed:${id}`;
    if (used.has(key)) key = `${key}:${id}`;
    used.add(key);
    headers.push({
      id, kind: lead.entry_type, memo: lead.memo ?? null, idempotency_key: key,
      reverses_txn_id: ls.find((l) => l.reverses_txn_id)?.reverses_txn_id ?? null, created_at: ls.map((l) => l.posted_at).sort()[0],
    });
  }
  // a reversal header must come after the header it reverses only when the FK is immediate; the FK is deferrable, but keep the order sensible
  headers.sort((a, b) => a.id.localeCompare(b.id));
  return headers;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// the whole mapping
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * @param model       buildModel() of tools/lib/model.mjs
 * @param readFixture (name) => parsed JSON of packages/contract/fixtures/<name>.json
 * @returns { rows: Map<table, object[]>, waitlist, unmapped: string[], notes: string[] }
 */
export function buildSeedRows(model, readFixture) {
  const rows = new Map();
  const unmapped = [];
  const put = (table, list) => rows.set(table, [...(rows.get(table) ?? []), ...list]);

  for (const spec of model.tables.filter((t) => t.source === 'contract')) {
    const fx = readFixture(spec.name);
    const colByField = new Map(spec.columns.filter((c) => !c.extra).map((c) => [c.contractField, c.name]));
    const nested = new Set(NESTED[spec.name] ?? []);
    const derived = new Set(DERIVED[spec.name] ?? []);
    const out = [];
    for (const rec of asArray(fx)) {
      const row = {};
      for (const [k, v] of Object.entries(rec)) {
        if (nested.has(k) || derived.has(k)) continue;
        const col = colByField.get(k);
        if (!col) { unmapped.push(`${spec.name}.${k}`); continue; }
        row[col] = v;
      }
      Object.assign(row, EXTRA[spec.name]?.(rec) ?? {});
      out.push(row);
    }
    put(spec.name, out);
  }

  for (const child of CHILDREN) {
    const counter = { n: 0, next() { return ++this.n; } };
    const parents = asArray(readFixture(child.parent));
    put(child.table, parents.flatMap((p) => child.rows(p, counter)));
  }

  rows.set('ticker_events', tickerRows(readFixture('ticker')));

  // A ledger leg is never zero (ledger_amount_chk, and claw_back() leaves out a fee leg of 0): two fixture clawbacks of fee-free posts carry a 0-cent
  // platform:fees leg. The transaction still nets to zero without it, so the seed omits those legs (reported in `notes`).
  const notes = [];
  const legs = rows.get('ledger');
  const nonZero = legs.filter((l) => l.amount_cents !== 0);
  if (nonZero.length !== legs.length) notes.push(`ledger: omitted ${legs.length - nonZero.length} zero-amount leg(s) (${legs.filter((l) => l.amount_cents === 0).map((l) => l.id).join(', ')}): a leg is never 0 cents`);
  rows.set('ledger', nonZero);

  // RevenueCat redeliveries: the contract logs a redelivery as another row with match_status 'duplicate' that shares the original's event id. The database keeps
  // ONE row per (app, event id): webhook-revenuecat upserts on it, and the inbox (inbound_events) already acknowledges and counts redeliveries. The seed loads the
  // distinct events and reports how many redeliveries it left out.
  const rc = rows.get('revenuecat_events');
  const rcKeep = rc.filter((e) => e.match_status !== 'duplicate' || !rc.some((o) => o !== e && o.app_id === e.app_id && o.idempotency_key === e.idempotency_key && o.match_status !== 'duplicate'));
  const rcSeen = new Set();
  const rcOne = rcKeep.filter((e) => { const k = `${e.app_id}|${e.idempotency_key}`; if (rcSeen.has(k)) return false; rcSeen.add(k); return true; });
  if (rcOne.length !== rc.length) notes.push(`revenuecat_events: omitted ${rc.length - rcOne.length} redelivery row(s) with match_status "duplicate" (one stored row per RevenueCat event id)`);
  rows.set('revenuecat_events', rcOne);

  // the ledger header table is derived from the legs, and must exist for every txn_id the ledger references
  rows.set('ledger_transactions', ledgerHeaders(nonZero));

  return { rows, waitlist: waitlistPlan(readFixture('waitlist')), unmapped: [...new Set(unmapped)], notes };
}
