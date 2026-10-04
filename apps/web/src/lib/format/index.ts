/**
 * flowd formatting kit. Import from "@/lib/format". Pure, server-safe, deterministic (UTC, explicit "now").
 *
 *   MONEY     formatMoney  formatCpm  formatCompact  formatPct  formatSignedPct  formatMoneyRange  formatCpmRange  formatCostPer  formatFee  splitMoney
 *   TIME      formatRelative  formatDate  formatTime  formatDateTime  formatClockEta  formatEta  formatDaysLeft  formatDuration  formatCountdown  greeting
 *   WORDS     ordinal  pluralise  pluralWord  formatList  formatRank  withArticle
 *   TEXT      truncate  truncateWords  truncateMiddle  excerpt  initials  formatHandle  displayUrl  humanize
 *
 * Money is integer cents and is formatted only here (CONVENTIONS section 1). The core money formatters are the engine's, so the web
 * app, the mock API and the tests agree to the cent.
 */

export * from "./money";
export * from "./number";
export * from "./text";
export * from "./time";
export { DEMO_NOW, DEMO_NOW_MS } from "@/lib/constants";
