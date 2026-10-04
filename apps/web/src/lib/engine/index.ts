/**
 * flowd engine: the pure business logic of the product.
 *
 * No React, no I/O, no clock reads, no randomness except injected seeds. Every public function is deterministic and covered by Vitest tests, and the
 * money rules mirror packages/contract/DOMAIN.md (CONSTANTS and the formulas) exactly. Import from "@/lib/engine".
 */

export * from "./constants";
export * from "./money";
export * from "./time";
export * from "./stats";
export * from "./rng";
export * from "./text";

export * from "./pricing";
export * from "./ledger";
export * from "./settlement";
export * from "./moneyclock";
export * from "./funnel";
export * from "./scoring";
export * from "./hooktext";
export * from "./qa";
export * from "./fraud";
export * from "./matching";
export * from "./market";
export * from "./tiers";
export * from "./reputation";
export * from "./streaks";
export * from "./attribution";
export * from "./rights";
export * from "./brieflint";
export * from "./autoapprove";
export * from "./earnings";
export * from "./audit";
export * from "./referral";
