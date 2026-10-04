// Error codes the database and the API raise in addition to the ones listed per endpoint in packages/contract/schema/api.mjs (which stays the
// minimum: nothing here contradicts it). They come from the business-rule SQLSTATEs of supabase/migrations/0001_schema.sql (FD001..FD022) and are
// what the generated clients must be ready to handle.

export const EXTRA_ERRORS = {
  'POST /bounties/{id}/fund': ['insufficient_funds', 'bounty_not_funded', 'conflict'],
  'POST /bounties/{id}/top-up': ['insufficient_funds', 'below_minimum', 'conflict'],
  'POST /bounties/{id}/publish': ['conflict'],
  'POST /bounties/{id}/pause': ['invalid_transition'],
  'POST /bounties/{id}/resume': ['invalid_transition'],
  'POST /bounties/{id}/close': ['invalid_transition'],
  'POST /bounties/{id}/cancel': ['invalid_transition'],
  'POST /submissions': ['bounty_not_funded', 'conflict'],
  'POST /submissions/{id}/decision': ['conflict', 'invalid_transition'],
  'POST /submissions/{id}/revise': ['conflict'],
  'POST /submissions/{id}/withdraw': ['invalid_transition'],
  'POST /wallet/topup': ['validation_failed'],
  'POST /payouts/instant': ['conflict'],
  'POST /drops/{id}/claim': ['conflict', 'bounty_not_funded'],
  'POST /offers/{id}/accept': ['insufficient_funds', 'conflict'],
  'POST /auctions/{id}/bids': ['insufficient_funds', 'conflict'],
  'POST /specs/{id}/license': ['insufficient_funds', 'conflict'],
  'POST /rights/{id}/renew': ['insufficient_funds', 'conflict'],
  'POST /promotions/{id}/launch': ['insufficient_funds', 'conflict'],
  'POST /admin/fraud/{id}/decision': ['conflict'],
  'POST /admin/payouts/{id}/release': ['conflict'],
  'POST /webhooks/revenuecat': ['invalid_signature'],
  'POST /webhooks/stripe': ['invalid_signature'],
};
