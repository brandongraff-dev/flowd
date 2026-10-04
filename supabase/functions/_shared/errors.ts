// Errors. The database raises business-rule failures with a stable SQLSTATE FDnnn (supabase/migrations/0001_schema.sql, "Error codes");
// PostgREST hands the code back as `error.code`. This table maps each one to the API error code and HTTP status of
// packages/contract/openapi.yaml (ErrorCode), so the edge functions, the API server and the clients speak one vocabulary.
//
// Erasable TypeScript only (no enums, no parameter properties): this file also runs under Node's type stripping in the unit tests.

export interface ErrorSpec {
  code: string;
  status: number;
}

export const SQLSTATE_ERRORS: Readonly<Record<string, ErrorSpec>> = {
  FD001: { code: 'pool_exhausted', status: 409 },
  FD002: { code: 'bounty_not_funded', status: 409 },
  FD003: { code: 'reason_required', status: 422 },
  FD004: { code: 'revision_limit', status: 409 },
  FD005: { code: 'appeal_used', status: 409 },
  FD006: { code: 'below_minimum', status: 422 },
  FD007: { code: 'method_missing', status: 409 },
  FD008: { code: 'tax_info_missing', status: 409 },
  FD009: { code: 'identity_check_required', status: 409 },
  FD010: { code: 'tier_locked', status: 403 },
  FD011: { code: 'sla_not_started', status: 409 },
  FD012: { code: 'idempotency_conflict', status: 409 },
  FD013: { code: 'invalid_transition', status: 409 },
  FD014: { code: 'ledger_unbalanced', status: 500 },
  FD015: { code: 'append_only', status: 409 },
  FD016: { code: 'conflict', status: 409 },
  FD017: { code: 'forbidden', status: 403 },
  FD018: { code: 'insufficient_funds', status: 409 },
  FD019: { code: 'escrow_ledger_mismatch', status: 500 },
  FD020: { code: 'snapshot_regression', status: 409 },
  FD021: { code: 'not_found', status: 404 },
  FD022: { code: 'validation_failed', status: 422 },
};

/** The error body every non-2xx response carries: { code, message, hint }. */
export interface ErrorBody {
  code: string;
  message: string;
  hint?: string;
}

export class FlowdError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint: string | undefined;
  readonly sqlstate: string | undefined;

  constructor(code: string, message: string, status = 400, options: { hint?: string; sqlstate?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'FlowdError';
    this.code = code;
    this.status = status;
    this.hint = options.hint;
    this.sqlstate = options.sqlstate;
  }

  toBody(): ErrorBody {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.hint) body.hint = this.hint;
    return body;
  }
}

/** The shape of a PostgREST / supabase-js error. */
export interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/** Translate a database error: FDnnn becomes its API code, everything else is an internal error (never leaked verbatim). */
export function fromDatabaseError(err: PostgrestLikeError): FlowdError {
  const spec = err.code ? SQLSTATE_ERRORS[err.code] : undefined;
  if (spec) {
    return new FlowdError(spec.code, err.details ?? err.message, spec.status, { hint: err.hint ?? undefined, sqlstate: err.code });
  }
  return new FlowdError('internal', 'The database rejected the request.', 500, { sqlstate: err.code, cause: err });
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Raised by an adapter when the provider says "slow down". Callers stop the batch and retry at the next run. */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number;
  constructor(provider: string, retryAfterSeconds = 60) {
    super(`${provider} rate limit reached; retry in ${retryAfterSeconds}s`);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The stored OAuth token no longer works and cannot be refreshed: the creator has to reconnect (social_accounts.status = needs_reauth). */
export class ReauthRequiredError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider} needs the account to be reconnected: ${detail}`);
    this.name = 'ReauthRequiredError';
  }
}

/** The platform no longer has the post (deleted or made private). */
export class PostGoneError extends Error {
  constructor(platform: string, platformPostId: string) {
    super(`${platform} post ${platformPostId} is gone`);
    this.name = 'PostGoneError';
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
