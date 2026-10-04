/**
 * Privacy guards for analytics (docs/PRODUCT_SPEC.md sections 8 and 10): no free text, no video content, no amounts in URLs, money as
 * integer cents, ids pseudonymous. Everything here is pure, so the rules are testable and apply to every adapter.
 */

import { hashString } from "@/lib/engine/rng";
import type { AnalyticsProps, AnalyticsValue } from "./events";

/** Property names that signal free text or personal data. A property with one of these tokens in its name is dropped. */
const FORBIDDEN_KEY_TOKENS = [
  "email", "name", "text", "note", "notes", "body", "message", "comment", "caption", "script", "prompt", "transcript",
  "password", "token", "secret", "phone", "address", "title", "bio", "description", "query",
] as const;

const MAX_STRING = 64;
const MAX_ARRAY = 20;

function hasForbiddenKey(key: string): boolean {
  const tokens = key.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((t) => (FORBIDDEN_KEY_TOKENS as readonly string[]).includes(t));
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function unsafeString(value: string): string | null {
  if (value.length > MAX_STRING) return "too long to be a code or enum (looks like free text)";
  if (EMAIL_LIKE.test(value)) return "looks like an email address";
  if ((value.match(/\s/g) ?? []).length >= 4) return "looks like a sentence";
  return null;
}

export interface SanitizeResult {
  props: Record<string, AnalyticsValue | AnalyticsValue[]>;
  /** `key: reason` for each property that was removed, so a dev adapter can warn. */
  dropped: string[];
}

/**
 * Keeps only what analytics may carry: numbers, booleans, null and short code-like strings (and arrays of those, up to 20). Drops names
 * that suggest free text or personal data ("email", "note", "prompt"...), strings that look like sentences or emails, non-finite
 * numbers, nested objects and undefined. Returns what was dropped and why.
 */
export function sanitizeProps(props: AnalyticsProps | undefined): SanitizeResult {
  const out: Record<string, AnalyticsValue | AnalyticsValue[]> = {};
  const dropped: string[] = [];
  if (!props) return { props: out, dropped };
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (hasForbiddenKey(key)) {
      dropped.push(`${key}: name suggests free text or personal data`);
      continue;
    }
    if (Array.isArray(value)) {
      const items: AnalyticsValue[] = [];
      let bad: string | null = null;
      for (const item of (value as readonly AnalyticsValue[]).slice(0, MAX_ARRAY)) {
        const problem = scalarProblem(item);
        if (problem) bad = problem;
        else items.push(item);
      }
      if (bad && items.length === 0) dropped.push(`${key}: ${bad}`);
      else out[key] = items;
      continue;
    }
    if (typeof value === "object" && value !== null) {
      dropped.push(`${key}: nested objects are not allowed`);
      continue;
    }
    const problem = scalarProblem(value as AnalyticsValue);
    if (problem) {
      dropped.push(`${key}: ${problem}`);
      continue;
    }
    out[key] = value as AnalyticsValue;
  }
  return { props: out, dropped };
}

function scalarProblem(value: AnalyticsValue): string | null {
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : "not a finite number";
  if (typeof value === "string") return unsafeString(value);
  return "unsupported type";
}

/** Query parameters whose value is an amount, a person or free text. Their values are removed from any path that is sent. */
const SENSITIVE_PARAMS = /^(amount|cents|total|price|fee|balance|budget|pool|spend|email|name|q|query|search|token|code|handle|note)$/i;

/**
 * A path safe to send: query values for amount, identity, search and token parameters are dropped, any "$12.50" style figure is
 * masked, and the hash is removed. "/brand/wallet?amount=5000&tab=ledger" becomes "/brand/wallet?tab=ledger".
 */
export function sanitizePath(path: string): string {
  const noHash = path.split("#")[0] ?? "";
  const queryAt = noHash.indexOf("?");
  const rawPath = (queryAt === -1 ? noHash : noHash.slice(0, queryAt)) || "/";
  const rawQuery = queryAt === -1 ? "" : noHash.slice(queryAt + 1);
  const kept: string[] = [];
  for (const pair of rawQuery.split("&")) {
    if (!pair) continue;
    const [key = ""] = pair.split("=", 1);
    if (SENSITIVE_PARAMS.test(decodeSafe(key))) continue;
    kept.push(pair);
  }
  const maskedPath = rawPath.replace(/\$\d[\d,]*(?:\.\d+)?/g, "$$_");
  return kept.length > 0 ? `${maskedPath}?${kept.join("&")}` : maskedPath;
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * A stable pseudonymous id for analytics: "u_" plus base-36 of an FNV-1a hash of the real id. Deterministic in the browser and in
 * tests, and not reversible by reading the output. Production replaces this with a server-side keyed hash; the demo keeps it
 * client-side because every person is a demo persona.
 */
export function pseudonymise(id: string, salt = "flowd"): string {
  const a = hashString(`${salt}:${id}`).toString(36);
  const b = hashString(`${id}:${salt}`).toString(36);
  return `u_${a}${b}`.slice(0, 18);
}

/** The browser signals that mean "do not track". Pass the `navigator` object (or a stub): DNT and Global Privacy Control both opt out. */
export interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  msDoNotTrack?: string | null;
}

export function privacyOptOut(signals: PrivacySignals | undefined): boolean {
  if (!signals) return false;
  return signals.doNotTrack === "1" || signals.doNotTrack === "yes" || signals.msDoNotTrack === "1" || signals.globalPrivacyControl === true;
}
