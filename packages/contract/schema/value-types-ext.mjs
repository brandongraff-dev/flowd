// Nested value types used by the extension entities (market, growth, trust, platform) and the world manifest.
import { value, req, opt } from './dsl.mjs';

export const VALUE_TYPES_EXT = [
  value('ViewExclusion', 'Views excluded from the verified count, with the cause and a plain-language detail (View Ledger).', [
    req('cause', 'enum:ExclusionCause'), req('views', 'int'), req('detail', 'string', 'e.g. "62% of views in two hours came from an unknown external source".'),
  ]),
  value('LintOverride', 'An Ops override of a Brief Lint finding on a bounty (logged).', [
    req('code', 'enum:BriefLintCode'), req('by_user_id', 'ref:users'), req('reason', 'string'), req('at', 'iso'),
  ]),
  value('PromiseMetric', 'The public proof metric of one of the 11 flowd Promise commitments (shown on /promise and /trust, computed from the ledger).', [
    req('number', 'int', '1 to 11.'), req('key', 'string', 'e.g. "cleared_on_eta".'), req('label', 'string'), req('value', 'number'), req('unit', 'string', '"ratio", "hours", "count" or "cents".'),
    req('display', 'string', 'Preformatted, e.g. "97.4% cleared on or before the ETA".'), opt('target', 'number'), req('note', 'string'),
  ]),
  // ── world manifest ──────────────────────────────────────────────────────────────────────────
  value('PersonaCreator', 'The demo creator persona.', [req('user_id', 'ref:users'), req('creator_id', 'ref:creators'), req('handle', 'string')]),
  value('PersonaBrand', 'The demo brand persona.', [
    req('user_id', 'ref:users'), req('member_id', 'ref:brand_members'), req('brand_id', 'ref:brands'), req('app_id', 'ref:apps'),
  ]),
  value('PersonaAdmin', 'The demo admin persona (Ops).', [req('user_id', 'ref:users')]),
  value('Personas', 'The three demo personas. Role switching is a demo affordance on /login and in the account menu.', [
    req('creator', 'obj:PersonaCreator'), req('brand', 'obj:PersonaBrand'), req('admin', 'obj:PersonaAdmin'),
  ]),

  // ── ticker / money ──────────────────────────────────────────────────────────────────────────
  value('TickerEvent', 'One event on the public payout ticker. Creator identity is public handle only or anonymised.', [
    req('id', 'string', 'tick_<n>.'), req('kind', 'enum:TickerKind'), req('at', 'iso'), req('text', 'string', 'Ready to render: "@kai.frames was paid $84.20".'),
    opt('amount_cents', 'cents'), opt('creator_id', 'ref:creators'), opt('handle', 'string', 'Public handle; absent when anonymous.'),
    opt('tier', 'enum:Tier'), opt('bounty_id', 'ref:bounties'), opt('app_name', 'string'), opt('proof_id', 'string', 'prf_ id of a public proof page.'),
  ]),
  value('HoldSummary', 'Holds in a payout run, grouped by named reason.', [req('reason', 'enum:HoldReason'), req('count', 'int'), req('cents', 'cents')]),
  value('Renewal', 'A rights renewal.', [
    req('at', 'iso'), req('days', 'int', 'Extension in days (multiples of 30).'), req('fee_cents', 'cents'), opt('ledger_txn_id', 'string'),
    opt('requested_by_member_id', 'ref:brand_members'),
  ]),

  // ── market ──────────────────────────────────────────────────────────────────────────────────
  value('Bid', 'A sealed bid in an auction. Bidders see only their own bid until the auction closes.', [
    req('id', 'string', 'bid_<n>.'), req('brand_id', 'ref:brands'), req('bidder_member_id', 'ref:brand_members'),
    req('amount_cents', 'cents', 'The maximum the brand will pay per slot (second price: winners pay the highest losing bid).'),
    req('status', 'enum:BidStatus'), req('placed_at', 'iso'), req('escrow_hold_cents', 'cents', 'Held from the brand wallet while the auction is open.'),
    opt('pays_cents', 'cents', 'The uniform clearing price a winner actually paid.'), opt('note', 'string'),
  ]),
  value('SpecLicense', 'A brand\'s licence of a spec.', [
    req('brand_id', 'ref:brands'), req('licensed_at', 'iso'), req('price_cents', 'cents', 'Creator price (the brand also pays the take rate on top).'),
    req('paid_ads_days', 'int'), opt('ends_at', 'iso'), opt('ledger_txn_id', 'string'),
  ]),

  // ── growth ──────────────────────────────────────────────────────────────────────────────────
  value('Matchup', 'A head-to-head hook battle in a tournament bracket.', [
    req('id', 'string', 'mu_<n>.'), req('entry_a_id', 'ref:tournament_entries'), req('entry_b_id', 'ref:tournament_entries'),
    opt('winner_entry_id', 'ref:tournament_entries'), opt('score_a', 'number'), opt('score_b', 'number'), req('metric', 'string', 'e.g. "Hook Score + 3s hold rate".'),
  ]),
  value('TournamentRound', 'One round of a tournament.', [
    req('round', 'int'), req('name', 'string', 'e.g. "Round of 16".'), req('starts_at', 'iso'), req('ends_at', 'iso'), req('matchups', 'obj:Matchup[]'),
  ]),

  // ── trust ───────────────────────────────────────────────────────────────────────────────────
  value('DisputeEvent', 'One entry in a dispute timeline.', [
    req('at', 'iso'), req('actor', 'enum:ActorKind'), req('action', 'enum:DisputeAction'), req('text', 'text'), opt('user_id', 'ref:users'),
  ]),
  value('HourlyEnvelope', 'Hourly view curve with the expected organic envelope (fraud case evidence). 72 values each, hour 0 = post time.', [
    req('views', 'int[]', 'Verified views per hour.'), req('expected_low', 'int[]'), req('expected_high', 'int[]'),
  ]),
  value('DocRef', 'A mock document attached to a verification.', [req('label', 'string'), req('file_name', 'string'), req('art', 'art', 'Generated placeholder, never a real document.')]),
  value('ComplianceCheckItem', 'One check inside a post-level compliance audit.', [
    req('type', 'enum:ComplianceCheckType'), req('result', 'enum:ComplianceResult'), req('message', 'string'), opt('evidence', 'obj:Evidence'), req('blocks_settlement', 'bool'),
  ]),

  // ── platform ────────────────────────────────────────────────────────────────────────────────
  value('ChatMessage', 'A message in an in-app thread. In-app chat only; Scam Shield annotates risky messages.', [
    req('id', 'string', 'msg_<n>.'), req('author_role', 'enum:AuthorRole'), opt('author_user_id', 'ref:users'), req('kind', 'enum:MessageKind'), req('body', 'text'),
    req('at', 'iso'), opt('warning_code', 'enum:ScamReason', 'Set on kind = warning.'), opt('read_at', 'iso'),
  ]),
  value('RuleAuditEntry', 'One entry in an auto-approve rule audit log.', [
    req('at', 'iso'), opt('actor_member_id', 'ref:brand_members'), req('action', 'enum:RuleAuditAction'), req('note', 'string'),
  ]),
  value('ListMember', 'A creator on a brand\'s CRM list.', [req('creator_id', 'ref:creators'), opt('note', 'string'), req('tags', 'string[]'), req('added_at', 'iso')]),
  value('WrappedCard', 'A story card in Wrapped (8 to 10 per recap).', [
    req('kind', 'enum:WrappedCardKind'), req('title', 'string'), opt('figure', 'string', 'The hero figure, preformatted.'), req('caption', 'string'), req('art', 'art'),
  ]),
  value('WaitlistTotals', 'Ranked waitlist totals.', [req('creators', 'int'), req('brands', 'int'), req('invites_accepted', 'int'), req('updated_at', 'iso')]),
  value('WaitlistLeader', 'A row of the ranked waitlist leaderboard (handles only, never emails).', [
    req('position', 'int'), req('kind', 'enum:PartyKind'), req('handle', 'string'), req('referrals', 'int'), req('joined_at', 'iso'),
  ]),
  value('MarketHealth', 'Market health metrics on the admin control tower.', [
    req('fill_rate_48h', 'ratio', 'Share of bounties that filled within 48 hours.'), req('median_fill_hours', 'number'),
    req('median_decision_hours', 'number'), req('decided_in_sla_ratio', 'ratio'), req('cleared_on_eta_ratio', 'ratio'),
    req('disputes_resolved_48h_ratio', 'ratio'), req('funded_live_ratio', 'ratio', 'Always 1.0: no bounty goes live unfunded.'),
    req('first_dollar_median_hours', 'number'), req('active_creators_per_live_bounty', 'number'),
  ]),
  value('QueueCounts', 'Open items per admin queue.', [
    req('fraud_open', 'int'), req('disputes_open', 'int'), req('verification_open', 'int'), req('safety_new', 'int'),
    req('sla_stale', 'int'), req('sla_breached', 'int'), req('payouts_held', 'int'),
  ]),
  value('NextPayoutRun', 'Preview of the next Friday payout run.', [
    req('run_id', 'string', 'run_YYYY-MM-DD.'), req('scheduled_for', 'iso'), req('creators', 'int'), req('total_cents', 'cents'), req('holds', 'int'), req('held_cents', 'cents'),
  ]),
  value('AdminSummary', 'Money summary on the control tower.', [
    req('gmv_30d_cents', 'cents', 'Creator pay + fees settled in 30 days.'), req('fees_30d_cents', 'cents'), req('paid_total_cents', 'cents'),
    req('active_creators_30d', 'int'), req('live_bounties', 'int'), req('brands_active_30d', 'int'),
  ]),
  value('TierStatsSnapshot', 'Creator stats at a point in time (tier history).', [
    req('lifetime_cleared_cents', 'cents'), req('approved_count', 'int'), req('approval_rate', 'ratio'), req('reliability_score', 'int'),
  ]),
  value('ModelJobStats', 'Pipeline job stats for a model.', [req('queue_depth', 'int'), req('jobs_24h', 'int'), req('failed_24h', 'int'), req('median_latency_s', 'number')]),
  value('CaseMetrics', 'Public case-study numbers (fictional in the demo).', [
    req('views', 'int'), req('installs', 'int'), req('trials', 'int'), req('paid', 'int'), req('spend_cents', 'cents'), req('cost_per_trial_cents', 'cents'),
    req('creators', 'int'), req('period_days', 'int'),
  ]),
];
