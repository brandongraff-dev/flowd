#!/usr/bin/env node
// Generates packages/contract/openapi.yaml (OpenAPI 3.1) for the whole /api/v1 surface.
//
//   enums, value types, entities   <- packages/contract/schema/*.mjs  (the same source as types.ts, so every name matches exactly)
//   paths, roles, response types   <- packages/contract/schema/api.mjs (the 235 endpoints; the contract wins over this file)
//   read models                    <- supabase/tools/lib/openapi/read-models.mjs  (the 30 response types that are not fixture rows, plus helpers)
//   request bodies, filters        <- lib/openapi/bodies.mjs, lib/openapi/queries.mjs
//   examples, webhooks, MCP tools  <- lib/openapi/examples.mjs and this file
//
// Usage:  node supabase/tools/gen-openapi.mjs             write packages/contract/openapi.yaml
//         node supabase/tools/gen-openapi.mjs --check     exit 1 when the file on disk is stale
//         node supabase/tools/gen-openapi.mjs --verify    write, then validate: every $ref resolves, operationIds are unique, every endpoint of api.mjs is
//                                                         present, the YAML re-parses to the same document (PyYAML) and passes openapi-spec-validator
//                                                         when those are available (python -m pip install pyyaml openapi-spec-validator)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API_CONVENTIONS, API_GROUPS, CONSTANTS, ENTITIES, ENUMS, VALUE_TYPES } from '../../packages/contract/schema/index.mjs';
import { CONTRACT_VERSION } from '../../packages/contract/schema/world.mjs';
import { toYaml } from './lib/openapi/yaml.mjs';
import { idSchemaName, makeMapper, parseFields } from './lib/openapi/types.mjs';
import { HELPER_MODELS, READ_MODELS } from './lib/openapi/read-models.mjs';
import { BODIES, BODY_MODELS } from './lib/openapi/bodies.mjs';
import { QUERIES } from './lib/openapi/queries.mjs';
import { ERROR_EXAMPLES, EXAMPLES } from './lib/openapi/examples.mjs';
import { OPERATION_IDS } from './lib/openapi/operation-ids.mjs';
import { EXTRA_ERRORS } from './lib/openapi/extra-errors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../../packages/contract/openapi.yaml');
const args = new Set(process.argv.slice(2));

const entityByTable = new Map(ENTITIES.map((e) => [e.table, e]));
const entityByName = new Map(ENTITIES.map((e) => [e.name, e]));
const { schemaFor, objectSchema } = makeMapper({ entityByTable });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

// ── components.schemas ──────────────────────────────────────────────────────────────────────────────────────────────────────
const schemas = {};

// ids
for (const e of ENTITIES) {
  if (!e.prefix || !e.fields.some((f) => f.name === 'id')) continue;
  schemas[idSchemaName(e.name)] = { type: 'string', pattern: `^${e.prefix}_[a-z0-9_.-]+$`, description: `${e.name} id, "${e.prefix}_<slug or number>".` };
}
schemas.ArtSeed = {
  type: 'object',
  description: 'A description of generated imagery (avatar, thumbnail, app icon, spec cover). Never a remote image: clients render it as SVG/CSS.',
  required: ['hue_a', 'hue_b', 'hue_c', 'pattern', 'seed'],
  properties: {
    hue_a: { type: 'integer', minimum: 0, maximum: 360, description: 'Hue of the base colour.' },
    hue_b: { type: 'integer', minimum: 0, maximum: 360, description: 'Hue of the second gradient stop.' },
    hue_c: { type: 'integer', minimum: 0, maximum: 360, description: 'Hue of the accent shapes.' },
    pattern: { type: 'string', enum: ['orbs', 'waves', 'rings', 'grid', 'spark', 'stripes'] },
    seed: { type: 'integer', description: 'Drives every random choice of the pattern.' },
    label: { type: 'string', description: 'Optional short text drawn on the art.' },
  },
};

// enums
for (const e of ENUMS) {
  const labels = {};
  const meanings = {};
  for (const v of e.values) {
    labels[v.value] = v.label;
    if (v.meaning) meanings[v.value] = v.meaning;
  }
  schemas[e.name] = { type: 'string', enum: e.values.map((v) => v.value), description: e.doc, 'x-enum-labels': labels, ...(Object.keys(meanings).length ? { 'x-enum-meanings': meanings } : {}) };
}

// value types and entities
for (const v of VALUE_TYPES) schemas[v.name] = objectSchema({ doc: v.doc, fields: v.fields });
for (const e of ENTITIES) {
  schemas[e.name] = objectSchema({ doc: e.doc, fields: e.fields, entityName: e.name, extra: { 'x-table': e.table, ...(e.prefix ? { 'x-id-prefix': e.prefix } : {}) } });
}

// read models (oneOf models are Wallet)
for (const [name, m] of Object.entries(READ_MODELS)) {
  if (m.oneOf) {
    schemas[name] = { description: m.doc, oneOf: m.oneOf.map(ref), discriminator: { propertyName: m.discriminator, mapping: { creator: '#/components/schemas/CreatorWallet', brand: '#/components/schemas/BrandWallet' } } };
  } else {
    schemas[name] = objectSchema({ doc: m.doc, fields: m.fields, extra: HELPER_MODELS.has(name) ? { 'x-read-model': 'helper' } : { 'x-read-model': true } });
  }
}
// request-body models
for (const [name, m] of Object.entries(BODY_MODELS)) schemas[name] = objectSchema({ doc: m.doc, fields: parseFields(m.fields), strict: true });

// RevenueCat webhook (the provider's shape, only the parts flowd reads)
schemas.RevenueCatWebhook = {
  type: 'object',
  description: 'A RevenueCat webhook body (https://www.revenuecat.com/docs/integrations/webhooks). flowd reads the fields below and ignores the rest. Authenticated by the Authorization header you configured in RevenueCat.',
  required: ['event'],
  properties: {
    api_version: { type: 'string' },
    event: {
      type: 'object',
      required: ['id', 'type', 'app_user_id'],
      properties: {
        id: { type: 'string', description: 'The event id: flowd is idempotent on it.' },
        type: { type: 'string', description: 'INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE, NON_RENEWING_PURCHASE or TEST. Other types are stored and ignored.' },
        app_id: { type: 'string' },
        app_user_id: { type: 'string' },
        original_app_user_id: { type: 'string' },
        product_id: { type: 'string' },
        period_type: { type: 'string', enum: ['TRIAL', 'INTRO', 'NORMAL'] },
        purchased_at_ms: { type: 'integer' },
        expiration_at_ms: { type: ['integer', 'null'] },
        event_timestamp_ms: { type: 'integer' },
        environment: { type: 'string', enum: ['PRODUCTION', 'SANDBOX'], description: 'Sandbox events are stored for SDK health and never pay.' },
        currency: { type: 'string' },
        price: { type: ['number', 'null'], description: 'Price in USD (gross).' },
        price_in_purchased_currency: { type: ['number', 'null'] },
        is_trial_conversion: { type: 'boolean' },
        offer_code: { type: ['string', 'null'], description: 'The offer code the customer redeemed: deterministic attribution (source code).' },
        country_code: { type: ['string', 'null'] },
        subscriber_attributes: { type: 'object', additionalProperties: { type: 'object', properties: { value: { type: 'string' } } }, description: 'flowd_link carries the creator\'s tracking code (source link).' },
      },
    },
  },
};
schemas.RevenueCatIngestResult = {
  type: 'object', required: ['received'],
  description: 'What the RevenueCat ingest endpoint answers once the event is safely stored. It always answers 200 for an event it understood, even when it is unmatched or ignored, so RevenueCat does not retry.',
  properties: {
    received: { type: 'boolean' },
    duplicate: { type: 'boolean', description: 'The event id was already processed.' },
    match: { type: 'string', enum: ['matched', 'unmatched', 'duplicate', 'ignored'] },
    source: { type: ['string', 'null'], enum: ['link', 'code', null], description: 'Which deterministic evidence matched. CPA pays only on link and code.' },
    kind: { type: ['string', 'null'], enum: ['trial', 'paid', null] },
    conversion_id: { type: ['string', 'null'] },
    ignored: { type: 'string', description: 'Why an event type was ignored.' },
  },
};
schemas.StripeEventEnvelope = { type: 'object', description: 'A Stripe event (https://docs.stripe.com/api/events). Verified with the Stripe-Signature header (5 minute tolerance).', required: ['id', 'type', 'data'], properties: { id: { type: 'string' }, type: { type: 'string', description: 'payment_intent.succeeded, payout.paid, payout.failed, account.updated, invoice.paid, customer.subscription.deleted, charge.dispute.created, charge.refunded. Others are stored and ignored.' }, account: { type: 'string', description: 'Set on events from a connected account.' }, created: { type: 'integer' }, data: { type: 'object', properties: { object: { type: 'object', additionalProperties: true } } } } };
schemas.Accepted = { type: 'object', required: ['accepted'], properties: { accepted: { type: 'boolean' }, id: { type: 'string', description: 'Id of the stored event, when there is one.' } } };

// error model
const ERROR_CODES = [
  ['validation_failed', 422], ['reason_required', 422], ['below_minimum', 422], ['not_found', 404], ['forbidden', 403], ['unauthorized', 401], ['invalid_signature', 400], ['tier_locked', 403],
  ['bounty_not_funded', 409], ['pool_exhausted', 409], ['sla_not_started', 409], ['revision_limit', 409], ['appeal_used', 409], ['method_missing', 409], ['tax_info_missing', 409],
  ['identity_check_required', 409], ['idempotency_conflict', 409], ['conflict', 409], ['insufficient_funds', 409], ['invalid_transition', 409], ['rate_limited', 429], ['internal', 500],
];
schemas.ErrorCode = { type: 'string', enum: ERROR_CODES.map(([c]) => c), description: 'A stable snake_case error code. The HTTP status is in the table of this API\'s error model (docs/ARCHITECTURE.md, "Error codes").', 'x-http-status': Object.fromEntries(ERROR_CODES) };
schemas.ErrorBody = {
  type: 'object', required: ['code', 'message'],
  description: 'Every non-2xx response. `code` is stable and safe to switch on; `message` is plain English for people; `hint` says what to do next.',
  properties: { code: ref('ErrorCode'), message: { type: 'string' }, hint: { type: 'string' } },
};

// ── paths ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT_ENTITY = {
  bounties: 'Bounty', apps: 'App', brands: 'Brand', submissions: 'Submission', posts: 'Post', payouts: 'Payout', invoices: 'Invoice', offers: 'Offer', auctions: 'Auction', specs: 'Spec',
  rights: 'RightsGrant', promotions: 'Ad', 'fatigue-alerts': 'FatigueAlert', compliance: 'ComplianceAudit', crews: 'Crew', tournaments: 'Tournament', drops: 'DailyDrop', threads: 'ChatThread',
  disputes: 'Dispute', 'api-keys': 'ApiKey', 'webhook-endpoints': 'Webhook', integrations: 'Integration', feedback: 'FeedbackNote', 'social-accounts': 'SocialAccount', proofs: 'Proof', rules: 'AutoApproveRule',
  fraud: 'FraudFlag', verification: 'Verification', safety: 'ScamReport', creators: 'Creator',
};
const PARAM_ENTITY = { bountyId: 'Bounty', submissionId: 'Submission', memberId: 'BrandMember', brandId: 'Brand' };

function pathParams(p, group) {
  const names = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const segs = p.split('/').filter(Boolean);
  return names.map((name) => {
    let schema = { type: 'string' };
    let description = '';
    const idx = segs.indexOf(`{${name}}`);
    const prev = segs[idx - 1];
    const root = segs[0] === 'admin' ? segs[1] : segs[0];
    if (name === 'id') {
      const entity = ROOT_ENTITY[prev] ?? ROOT_ENTITY[root];
      if (entity && entityByName.get(entity)?.prefix) schema = ref(idSchemaName(entity));
      description = entity ? `${entity} id.` : 'Resource id.';
    } else if (PARAM_ENTITY[name]) {
      schema = ref(idSchemaName(PARAM_ENTITY[name]));
      description = `${PARAM_ENTITY[name]} id.`;
    } else if (name === 'kind') {
      schema = ref('IntegrationKind');
      description = 'Integration kind.';
    } else if (name === 'code') {
      description = 'Tracking code, e.g. maya-glowup.';
    } else if (name === 'slug') {
      description = 'URL slug (a lesson, an audit report).';
    } else if (name === 'idOrHandle') {
      description = 'A creator id (cr_...) or handle (maya.makes).';
    } else if (name === 'txnId') {
      schema = { type: 'string', pattern: '^txn_[0-9]+$' };
      description = 'Ledger transaction id.';
    } else if (name === 'bidId') {
      description = 'Bid id.';
    } else if (name === 'handle') {
      description = 'Creator handle.';
    }
    void group;
    return { name, in: 'path', required: true, schema, ...(description ? { description } : {}) };
  });
}

const pageNames = new Set();
function pageSchemaFor(item) {
  const name = `${item}Page`;
  if (!pageNames.has(name)) {
    pageNames.add(name);
    schemas[name] = {
      type: 'object', required: ['data', 'next_cursor'],
      description: `A page of ${item}. Pass next_cursor as ?cursor= for the next page; null means the last page.`,
      properties: { data: { type: 'array', items: ref(item) }, next_cursor: { type: ['string', 'null'] }, total: { type: 'integer', description: 'Total matching rows, when cheap to compute.' } },
    };
  }
  return ref(name);
}

const MONEY_MOVING = new Set([
  'POST /bounties/{id}/fund', 'POST /bounties/{id}/top-up', 'POST /bounties/{id}/feature', 'POST /wallet/topup', 'PUT /wallet/auto-topup', 'POST /payouts/instant', 'POST /offers/{id}/accept', 'POST /offers',
  'POST /auctions/{id}/bids', 'POST /specs/{id}/license', 'POST /rights/{id}/renew', 'POST /promotions', 'POST /promotions/{id}/launch', 'POST /drops/{id}/claim', 'POST /submissions/{id}/decision',
  'POST /admin/fraud/{id}/decision', 'POST /admin/disputes/{id}/decision', 'POST /admin/payouts/{id}/release', 'POST /attribution/test-event', 'POST /webhooks/revenuecat', 'POST /submissions',
  'PATCH /brands/{id}/plan', 'POST /bounties/{id}/cancel', 'POST /bounties/{id}/close',
]);
const CREATE_PATHS = new Set(['POST /apps', 'POST /bounties', 'POST /submissions', 'POST /offers', 'POST /auctions', 'POST /specs', 'POST /crews', 'POST /referrals', 'POST /reports', 'POST /api-keys', 'POST /webhook-endpoints', 'POST /payout-methods', 'POST /social-accounts', 'POST /test-plans', 'POST /promotions']);

const operationIds = new Set();

function operationId(method, p) {
  const id = OPERATION_IDS[`${method} ${p}`];
  if (!id) throw new Error(`no operationId for ${method} ${p}: add it to supabase/tools/lib/openapi/operation-ids.mjs`);
  if (operationIds.has(id)) throw new Error(`duplicate operationId ${id}`);
  operationIds.add(id);
  return id;
}

function queryParams(method, p, res) {
  const params = [];
  const key = `${method} ${p}`;
  const isPage = /^Page</.test(res);
  if (isPage) {
    params.push({ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Cursor' }, { $ref: '#/components/parameters/Sort' }, { $ref: '#/components/parameters/Expand' });
  }
  if (QUERIES[key]) {
    for (const f of parseFields(QUERIES[key])) {
      params.push({ name: f.name, in: 'query', required: f.required, ...(f.doc ? { description: f.doc } : {}), schema: schemaFor(f.type) });
    }
  }
  return params;
}

function bodyFor(method, p) {
  const key = `${method} ${p}`;
  if (!(key in BODIES)) {
    if (['POST', 'PUT', 'PATCH'].includes(method)) throw new Error(`no request body entry for ${key} (use null for none)`);
    return null;
  }
  const spec = BODIES[key];
  if (spec === null) return null;
  const example = EXAMPLES[key]?.request;
  let schema;
  if (typeof spec === 'object') schema = ref(spec.ref);
  else {
    const fields = parseFields(spec);
    schema = objectSchema({ fields, strict: true });
  }
  return { required: true, content: { 'application/json': { schema, ...(example ? { example } : {}) } } };
}

const STATUS_FOR = { invalid_signature: 400, invalid_transition: 409, insufficient_funds: 409, validation_failed: 422, reason_required: 422, below_minimum: 422, not_found: 404, forbidden: 403, tier_locked: 403, bounty_not_funded: 409, pool_exhausted: 409, sla_not_started: 409, revision_limit: 409, appeal_used: 409, method_missing: 409, tax_info_missing: 409, identity_check_required: 409, idempotency_conflict: 409, conflict: 409, rate_limited: 429 };

function errorResponses(who, hasBody, hasPathParam, codes, key) {
  const out = {};
  const add = (status, codesHere, description) => {
    const example = codesHere.map((c) => [c, ERROR_EXAMPLES[c]]).filter(([, e]) => e);
    out[status] = {
      description,
      headers: status === '429' ? { 'Retry-After': { description: 'Seconds to wait.', schema: { type: 'integer' } } } : undefined,
      content: {
        'application/json': {
          schema: codesHere.length ? { allOf: [ref('ErrorBody'), { properties: { code: { enum: codesHere } } }] } : ref('ErrorBody'),
          ...(example.length ? { examples: Object.fromEntries(example.map(([c, e]) => [c, { summary: c, value: e }])) } : {}),
        },
      },
    };
  };
  if (who !== 'public') {
    add('401', ['unauthorized'], 'Missing, expired or invalid credentials.');
    add('403', ['forbidden', 'tier_locked'].filter((c) => c === 'forbidden' || codes.includes(c)), 'The role, the workspace capability or the tier does not allow this.');
  }
  if (hasPathParam) add('404', ['not_found'], 'The resource does not exist or is not visible to the caller.');
  const byStatus = {};
  for (const c of codes) {
    const s = String(STATUS_FOR[c] ?? 409);
    if (s === '403' || s === '404') continue;
    (byStatus[s] ??= []).push(c);
  }
  if (hasBody && !byStatus['422']) byStatus['422'] = ['validation_failed'];
  else if (hasBody && !byStatus['422'].includes('validation_failed')) byStatus['422'].push('validation_failed');
  const describe = { 409: 'A business rule refused the request.', 422: 'The request was understood and refused.' };
  for (const [s, cs] of Object.entries(byStatus)) add(s, cs, describe[s] ?? 'Refused.');
  add('429', ['rate_limited'], 'Rate limit reached (60 / 600 / 3,000 requests per minute on Free / Pro / Scale).');
  void key;
  return out;
}

const SECURITY = {
  public: [],
  any: [{ bearerAuth: [] }, { apiKeyAuth: ['read'] }],
  creator: [{ bearerAuth: ['creator'] }],
  brand: [{ bearerAuth: ['brand_member'] }, { apiKeyAuth: ['read'] }],
  admin: [{ bearerAuth: ['admin'] }],
};

function security(who, method, key) {
  if (who === 'public') return [];
  if (who === 'creator' || who === 'admin') return SECURITY[who];
  const scope = MONEY_MOVING.has(key) && key !== 'POST /submissions/{id}/decision' ? 'financial' : method === 'GET' ? 'read' : 'write';
  return [{ bearerAuth: [who === 'brand' ? 'brand_member' : who] }, { apiKeyAuth: [scope] }];
}

const paths = {};
const tags = [];
let endpointCount = 0;

for (const g of API_GROUPS) {
  tags.push({ name: g.title, description: g.note });
  for (const e of g.endpoints) {
    endpointCount++;
    const key = `${e.m} ${e.p}`;
    const method = e.m.toLowerCase();
    const op = {
      operationId: operationId(e.m, e.p),
      tags: [g.title],
      summary: e.summary.replace(/\.$/, ''),
      description: e.summary,
    };
    const params = [...pathParams(e.p, g), ...queryParams(e.m, e.p, e.res)];
    if (MONEY_MOVING.has(key) && ['POST', 'PUT', 'PATCH'].includes(e.m) && key !== 'POST /webhooks/revenuecat') params.push({ $ref: '#/components/parameters/IdempotencyKey' });
    if (params.length) op.parameters = params;
    const body = bodyFor(e.m, e.p);
    if (body) op.requestBody = body;
    op.security = security(e.who, e.m, key);
    op['x-flowd-who'] = e.who;
    if (e.who === 'brand' || e.who === 'any') op['x-flowd-api-key-scope'] = MONEY_MOVING.has(key) && key !== 'POST /submissions/{id}/decision' ? 'financial' : e.m === 'GET' ? 'read' : 'write';
    if (MONEY_MOVING.has(key)) op['x-flowd-moves-money'] = true;

    // success response
    const res = e.res;
    const ex = EXAMPLES[key];
    let success;
    const page = /^Page<(.+)>$/.exec(res);
    const sse = /^SSE<(.+)>$/.exec(res);
    if (res === '204') success = { '204': { description: 'No content.' } };
    else if (res === '202') success = { '202': { description: 'Accepted for processing.', content: { 'application/json': { schema: ref('Accepted') } } } };
    else if (res === 'text/csv') success = { '200': { description: 'The earnings of the tax year as CSV (not tax advice).', content: { 'text/csv': { schema: { type: 'string' } } } } };
    else if (sse) success = { '200': { description: 'A Server-Sent Events stream. Each `data:` line is one JSON FloSuggestion; the stream ends with `event: done`.', content: { 'text/event-stream': { schema: ref(sse[1]) } } } };
    else {
      const schema = key === 'POST /webhooks/revenuecat' ? ref('RevenueCatIngestResult') : page ? pageSchemaFor(page[1]) : ref(res);
      const content = { schema, ...(ex?.response ? { example: ex.response } : {}) };
      const okHeaders = { 'X-Request-Id': { $ref: '#/components/headers/XRequestId' } };
      if (MONEY_MOVING.has(key) && key !== 'POST /webhooks/revenuecat') okHeaders['Idempotent-Replayed'] = { $ref: '#/components/headers/IdempotentReplayed' };
      const okText = key === 'POST /webhooks/revenuecat' ? 'The event was stored. It is always 200 for an event flowd understood, matched or not, so RevenueCat does not retry.' : page ? `A page of ${page[1]}.` : `${res}.`;
      success = { '200': { description: okText, headers: okHeaders, content: { 'application/json': content } } };
      if (e.p === '/brands/{id}/activity') success['200'].content['text/csv'] = { schema: { type: 'string' } };
    }
    op.responses = { ...success, ...errorResponses(e.who, Boolean(body), e.p.includes('{'), [...new Set([...e.errs, ...(EXTRA_ERRORS[key] ?? [])])], key) };
    if (ex?.errors) {
      for (const [status, v] of Object.entries(ex.errors)) {
        const target = op.responses[status]?.content?.['application/json'];
        if (target) target.examples = { ...(target.examples ?? {}), [v.code]: { summary: v.code, value: v } };
      }
    }
    if (ex?.headers && op.requestBody === undefined && !op.parameters) op['x-example-headers'] = ex.headers;
    paths[e.p] ??= {};
    paths[e.p][method] = op;
  }
}

// internal provider webhook endpoint that is not in api.mjs
paths['/webhooks/stripe'] = {
  post: {
    operationId: 'receiveStripeWebhook', tags: ['Webhooks'], summary: 'Stripe webhook ingest',
    description: 'Stripe -> flowd (Supabase edge function webhook-stripe). Verified with the Stripe-Signature header. Handles payment_intent.succeeded (wallet top-up and escrow funding), payout.paid and payout.failed (creator payouts), account.updated (Connect onboarding), invoice.paid and customer.subscription.deleted (plans) and raises charge.dispute.created and charge.refunded to Ops. Idempotent on the Stripe event id.',
    security: [{ stripeSignature: [] }], 'x-flowd-who': 'public',
    requestBody: { required: true, content: { 'application/json': { schema: ref('StripeEventEnvelope') } } },
    responses: { '200': { description: 'Stored and processed (or ignored).', content: { 'application/json': { schema: { type: 'object', properties: { received: { type: 'boolean' }, duplicate: { type: 'boolean' }, outcome: { type: 'string', enum: ['processed', 'ignored'] } } } } } }, '400': { description: 'The signature does not match.', content: { 'application/json': { schema: ref('ErrorBody') } } }, '500': { description: 'Processing failed after the event was stored; Stripe retries and housekeeping replays it.', content: { 'application/json': { schema: ref('ErrorBody') } } } },
  },
};
tags.push({ name: 'Webhooks', description: 'Provider webhooks into flowd (RevenueCat, Stripe). Brand-facing outbound webhooks are in the top-level `webhooks` section.' });
// RevenueCat is authenticated by its shared secret, not a bearer token
paths['/webhooks/revenuecat'].post.security = [{ revenueCatAuth: [] }];
paths['/webhooks/revenuecat'].post.parameters = [{ name: 'app', in: 'query', required: true, description: 'The flowd app id this RevenueCat project belongs to (part of the URL the brand pastes into RevenueCat).', schema: ref('AppId') }];
paths['/webhooks/revenuecat'].post.tags = ['Attribution Kit', 'Webhooks'];

// ── outbound webhooks (OpenAPI 3.1 `webhooks`) ──────────────────────────────────────────────────────────────────────────────
schemas.WebhookEvent = {
  type: 'object', required: ['id', 'type', 'created', 'data'],
  description: 'The body of every outbound webhook. Deliveries are signed: X-Flowd-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> with your endpoint secret (same scheme as Stripe, 5 minute tolerance). Dedupe on `id`: a retried delivery carries the same id. Retries: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h, then the delivery is marked failed.',
  properties: { id: { type: 'string', format: 'uuid' }, type: ref('WebhookEventType'), created: { type: 'string', format: 'date-time' }, data: { type: 'object', additionalProperties: true } },
};
const WEBHOOK_DATA = {
  bounty_funded: 'bounty_id, status', bounty_live: 'bounty_id', bounty_filled: 'bounty_id, filled_at', bounty_ended: 'bounty_id, refunded_cents',
  submission_created: 'submission_id, bounty_id, creator_id, flow_band', submission_approved: 'submission_id, bounty_id, creator_id', submission_changes_requested: 'submission_id, bounty_id, reason_code',
  submission_rejected: 'submission_id, bounty_id, reason_code, evidence', post_live: 'post_id, bounty_id, creator_id, platform, url', post_window_closed: 'post_id, bounty_id, window_views, fraud_band',
  post_cleared: 'post_id, cleared_cents', conversion_tracked: 'app_id, bounty_id, creator_id, kind, source, revenue_cents, occurred_at', ad_live: 'ad_id, post_id, platform',
  ad_fatigued: 'post_id, drop_pct', rights_expiring: 'rights_grant_id, post_id, ends_at, days_left, renewal_price_cents', dispute_opened: 'dispute_id, kind, post_id',
  invoice_paid: 'payment_intent, wallet_credit_cents, processing_cents, ledger_txn_id', wallet_low: 'wallet_balance_cents, threshold_cents, auto_top_up_failed',
};
const webhooks = {};
for (const ev of ENUMS.find((x) => x.name === 'WebhookEventType').values) {
  webhooks[ev.value] = {
    post: {
      operationId: `webhook_${ev.value}`, tags: ['Developers and integrations'], summary: ev.label,
      description: `${ev.meaning ?? ev.label}\n\nPayload fields (in \`data\`): ${WEBHOOK_DATA[ev.value] ?? 'see the resource'}.`,
      requestBody: { required: true, content: { 'application/json': { schema: { allOf: [ref('WebhookEvent'), { properties: { type: { const: ev.value } } }] } } } },
      parameters: [{ name: 'X-Flowd-Signature', in: 'header', required: true, schema: { type: 'string' }, description: 't=<unix>,v1=<hex>' }, { name: 'X-Flowd-Event', in: 'header', required: true, schema: ref('WebhookEventType') }, { name: 'X-Flowd-Delivery', in: 'header', required: true, schema: { type: 'string' } }],
      responses: { '2XX': { description: 'Return any 2xx within 10 seconds to acknowledge. Anything else is retried.' } },
    },
  };
}

// MCP tools
const MCP_TOOLS = [
  { name: 'create_bounty', description: 'Create a draft bounty from a brief. Always a draft: publishing and funding are separate calls that need the financial scope.', input: ref('BountyDraft') },
  { name: 'fund_bounty', description: 'Fund a bounty\'s escrow from the wallet (financial scope). Idempotent per bounty.', input: { type: 'object', required: ['bounty_id'], properties: { bounty_id: ref('BountyId') } } },
  { name: 'list_submissions', description: 'List submissions for the workspace, newest first.', input: { type: 'object', properties: { bounty_id: ref('BountyId'), status: ref('SubmissionStatus'), limit: { type: 'integer', maximum: 200 } } } },
  { name: 'decide_submission', description: 'Approve, request changes or reject. Rejection needs a reason code and evidence; with a non-financial key the decision is recorded as a draft for a human to confirm.', input: { type: 'object', required: ['submission_id', 'action'], properties: { submission_id: ref('SubmissionId'), action: ref('DecisionAction'), reason_code: ref('ReasonCode'), evidence: ref('Evidence'), summary: { type: 'string' } } } },
  { name: 'get_funnel', description: 'Views to paid for a bounty, tracked versus estimated, with cost per stage and ROAS.', input: { type: 'object', required: ['bounty_id'], properties: { bounty_id: ref('BountyId') } } },
];

// ── parameters, headers, security ───────────────────────────────────────────────────────────────────────────────────────────
const api = CONSTANTS.api;
const parameters = {
  Limit: { name: 'limit', in: 'query', description: `Page size (default ${api.page_size_default}, max ${api.page_size_max}).`, schema: { type: 'integer', minimum: 1, maximum: api.page_size_max, default: api.page_size_default } },
  Cursor: { name: 'cursor', in: 'query', description: 'The next_cursor of the previous page.', schema: { type: 'string' } },
  Sort: { name: 'sort', in: 'query', description: 'A field name, prefixed with - for descending (?sort=-created_at).', schema: { type: 'string' } },
  Expand: { name: 'expand', in: 'query', description: 'Comma-separated ref fields to inline (?expand=app,brand).', schema: { type: 'string' }, example: 'app,brand' },
  IdempotencyKey: { name: api.idempotency_header, in: 'header', required: false, description: 'A unique key (a UUID) for this attempt. Repeating it returns the original response (header Idempotent-Replayed: true); reusing it with a different request is idempotency_conflict (409). Keys live 24 hours. Send one on every call that moves money.', schema: { type: 'string', minLength: 8, maxLength: 128 } },
};
const headers = {
  XRequestId: { description: 'Quote this id to support.', schema: { type: 'string' } },
  IdempotentReplayed: { description: 'true when this response replays an earlier request that used the same Idempotency-Key.', schema: { type: 'boolean' } },
};

const description = `
The flowd API: an open creator market for app growth. Money follows what works.

**Base URL** \`https://api.joinflowd.io/api/v1\` (the demo build serves the same paths from \`/api/v1\` of the web app with an in-memory world; responses carry \`X-Flowd-Demo: 1\`).

## Conventions
${API_CONVENTIONS.map((c) => `- **${c.title}.** ${c.body}`).join('\n')}

## Authentication
- **bearerAuth**: a session token (a Supabase JWT; demo: \`POST /auth/demo-login\`). Roles: \`creator\`, \`brand_member\` (scoped to a workspace by member role and capability), \`admin\`.
- **apiKeyAuth**: a brand API key, \`fd_live_...\` or \`fd_test_...\`, sent as a bearer token. A key acts as a brand with scopes \`read\`, \`write\` and \`financial\`. Writes made with a key are **drafts** by default; anything that moves money needs the \`financial\` scope. Keys are shown once and stored as a sha256 hash.
- Public endpoints (\`security: []\`) need no credentials: public pages, the free tools, the waitlist, tracking-link resolution and the provider webhooks (which authenticate the provider).

## Money
Integer cents everywhere (\`*_cents\`). Rates are \`cpm_cents\` (cents per 1,000 verified views). Every response that shows an earning carries its Money Clock state: **pending -> cleared -> paid**, with a dated \`eta_at\` and a named \`reason\`. No endpoint returns formatted money.

## Rate limits
${Object.entries(api.rate_limit_per_minute).map(([p, n]) => `${n.toLocaleString('en-US')} requests per minute on ${p[0].toUpperCase() + p.slice(1)}`).join(', ')}. Exceeding it returns \`rate_limited\` (429) with \`Retry-After\`.
`.trim();

const doc = {
  openapi: '3.1.0',
  info: {
    title: 'flowd API', version: CONTRACT_VERSION, summary: 'Money follows what works.', description,
    contact: { name: 'flowd developers', email: CONSTANTS.world.contact_email, url: `https://${CONSTANTS.world.public_domain}/docs` },
    license: { name: 'Proprietary', identifier: 'LicenseRef-flowd' },
    'x-contract-version': CONTRACT_VERSION,
  },
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  servers: [
    { url: `https://${CONSTANTS.world.api_host}/api/v1`, description: 'Production' },
    { url: `https://api-staging.${CONSTANTS.world.public_domain}/api/v1`, description: 'Staging' },
    { url: 'http://localhost:3000/api/v1', description: 'Local demo (in-memory world seeded from the fixtures)' },
  ],
  tags: [...tags],
  security: [{ bearerAuth: [] }],
  paths,
  webhooks,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'A session token. The array on an operation lists the roles allowed (creator, brand_member, admin).' },
      apiKeyAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'fd_live_ | fd_test_', description: 'A brand API key. The array on an operation names the scope required: read, write or financial.' },
      revenueCatAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'The secret configured in RevenueCat\'s webhook settings, sent back verbatim (bare or as "Bearer <secret>").' },
      stripeSignature: { type: 'apiKey', in: 'header', name: 'Stripe-Signature', description: 'Stripe\'s t=<unix>,v1=<hex> signature of the raw body.' },
    },
    parameters,
    headers,
    schemas,
  },
  'x-mcp-tools': MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input })),
};

// ── output / verify ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const header = `# flowd API (OpenAPI 3.1). GENERATED by supabase/tools/gen-openapi.mjs from packages/contract/schema/*.mjs: do not edit by hand.
# Change the contract (schema/*.mjs, api.mjs) or supabase/tools/lib/openapi/*.mjs and run: node supabase/tools/gen-openapi.mjs
# ${Object.keys(paths).length} paths, ${endpointCount + 1} operations (${endpointCount} of the contract + the Stripe webhook), ${Object.keys(schemas).length} schemas, ${Object.keys(webhooks).length} outbound webhook events, ${MCP_TOOLS.length} MCP tools.
`;
const text = header + toYaml(doc);

function verify() {
  const errors = [];
  // 1. every $ref resolves
  const refs = [];
  (function walk(v, at) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === '$ref' && typeof x === 'string') refs.push([x, at]);
        else walk(x, `${at}.${k}`);
      }
    }
  })(doc, '$');
  for (const [r, at] of refs) {
    const parts = r.replace(/^#\//, '').split('/');
    let cur = doc;
    for (const p of parts) cur = cur?.[p];
    if (cur === undefined) errors.push(`unresolved $ref ${r} at ${at}`);
  }
  // 2. operationIds unique
  const ids = new Map();
  for (const [p, item] of Object.entries(paths)) for (const [m, op] of Object.entries(item)) {
    if (ids.has(op.operationId)) errors.push(`duplicate operationId ${op.operationId}: ${ids.get(op.operationId)} and ${m} ${p}`);
    ids.set(op.operationId, `${m} ${p}`);
  }
  // 3. every endpoint of api.mjs is present
  for (const g of API_GROUPS) for (const e of g.endpoints) if (!paths[e.p]?.[e.m.toLowerCase()]) errors.push(`missing ${e.m} ${e.p}`);
  // 4. path parameters match the path template
  for (const [p, item] of Object.entries(paths)) for (const [m, op] of Object.entries(item)) {
    const want = [...p.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]).sort().join(',');
    const have = (op.parameters ?? []).filter((x) => x.in === 'path').map((x) => x.name).sort().join(',');
    if (want !== have) errors.push(`${m} ${p}: path params ${have} do not match ${want}`);
  }
  // 5. entity names equal types.ts names
  const types = fs.readFileSync(path.resolve(here, '../../packages/contract/types.ts'), 'utf8');
  for (const e of ENTITIES) if (!new RegExp(`export interface ${e.name}\\b`).test(types)) errors.push(`entity ${e.name} is not in types.ts`);
  for (const v of VALUE_TYPES) if (!new RegExp(`export interface ${v.name}\\b`).test(types)) errors.push(`value type ${v.name} is not in types.ts`);
  for (const e of ENUMS) if (!new RegExp(`export type ${e.name}\\b`).test(types)) errors.push(`enum ${e.name} is not in types.ts`);
  // 6. PyYAML round trip and the OpenAPI validator
  const py = process.env.PYTHON ?? 'python';
  const tmp = path.join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'flowd-openapi-check.json');
  fs.writeFileSync(tmp, JSON.stringify(doc));
  const script = `
import json, sys, yaml
want = json.load(open(sys.argv[1], encoding='utf8'))
got = yaml.safe_load(open(sys.argv[2], encoding='utf8'))
if want != got:
    print('YAML does not round-trip to the generated document'); sys.exit(3)
try:
    from openapi_spec_validator import validate
    validate(got)
    print('openapi-spec-validator: ok')
except ImportError:
    print('openapi-spec-validator not installed: skipped')
`;
  const r = spawnSync(py, ['-c', script, tmp, outFile], { encoding: 'utf8' });
  if (r.error) console.log(`python not available (${r.error.message}): YAML round trip and spec validation skipped`);
  else if (r.status !== 0) errors.push(`python check failed: ${(r.stdout + r.stderr).trim().slice(0, 2000)}`);
  else console.log(r.stdout.trim());
  return errors;
}

if (args.has('--check')) {
  const cur = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  if (cur !== text) {
    console.error('stale: packages/contract/openapi.yaml (run: node supabase/tools/gen-openapi.mjs)');
    process.exit(1);
  }
  console.log('packages/contract/openapi.yaml is up to date');
} else {
  fs.writeFileSync(outFile, text);
  console.log(`wrote packages/contract/openapi.yaml (${text.split('\n').length} lines): ${Object.keys(paths).length} paths, ${endpointCount + 1} operations, ${Object.keys(schemas).length} schemas`);
  if (args.has('--verify')) {
    const errors = verify();
    if (errors.length) {
      console.error(`openapi verify: ${errors.length} problem(s)\n  ${errors.slice(0, 60).join('\n  ')}`);
      process.exit(2);
    }
    console.log('openapi verify: ok (refs resolve, operation ids unique, every contract endpoint present, names match types.ts)');
  }
}
