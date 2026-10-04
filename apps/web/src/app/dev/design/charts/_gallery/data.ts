/**
 * Demo data for the charts gallery. Fictional apps and creators only (Nap Nest, Fernlingo, Loafly); every figure is
 * deterministic (no Math.random at render) so server and client agree. "Now" is the demo clock, 2026-10-03.
 */

import type { BarDatum, Cohort, FunnelStage, RangePoint, ScatterGroup, ScatterPoint, XYPoint } from "@/components/charts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3);

/** Cheap deterministic noise in -1..1 for index `i` and a salt. */
function wobble(i: number, salt: number): number {
  const value = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function lastDays(count: number): Date[] {
  return Array.from({ length: count }, (_, index) => new Date(NOW - (count - 1 - index) * DAY));
}

const THIRTY = lastDays(30);

/** Cleared earnings per day for one creator, cents: climbs from about $38 to about $212 with a Friday payout bump. */
export const clearedDaily: XYPoint[] = THIRTY.map((date, index) => {
  const base = 3800 + index * 560;
  const weekday = date.getUTCDay();
  const bump = weekday === 5 ? 2600 : weekday === 6 ? 1400 : 0;
  return { x: date, y: Math.round(base + bump + wobble(index, 1) * 900) };
});

/** Views per day by platform (three series: palette slots 1 to 3). */
export const viewsByPlatform = [
  { id: "tiktok", label: "TikTok", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(78_000 + index * 2_900 + wobble(index, 2) * 9_000) })) },
  { id: "instagram", label: "Instagram", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(41_000 + index * 1_350 + wobble(index, 3) * 6_500) })) },
  { id: "youtube", label: "YouTube", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(18_500 + index * 620 + wobble(index, 4) * 3_200) })) },
];

/** Daily spend by app, cents (stacked area). */
export const spendByApp = [
  { id: "nap-nest", label: "Nap Nest", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(61_000 + index * 1_800 + wobble(index, 5) * 7_000) })) },
  { id: "fernlingo", label: "Fernlingo", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(34_000 + index * 900 + wobble(index, 6) * 5_000) })) },
  { id: "loafly", label: "Loafly", points: THIRTY.map((date, index) => ({ x: date, y: Math.round(19_000 + index * 420 + wobble(index, 7) * 3_000) })) },
];

/** Estimated tail: the last three days of a series are modelled until their 72-hour window closes. */
export const installsWithEstimate: XYPoint[] = THIRTY.map((date, index) => ({
  x: date,
  y: Math.round(96 + index * 5.5 + wobble(index, 8) * 14),
  estimated: index >= 27,
}));

/** Clearing CPM, cents per 1,000 verified views, 45 days: median drifts up, band is p25 to p75. */
export const cpmMarket: RangePoint[] = lastDays(45).map((date, index) => {
  const median = 198 + index * 0.9 + wobble(index, 9) * 7;
  return { x: date, p25: Math.round(median * 0.78), median: Math.round(median), p75: Math.round(median * 1.34) };
});

/** Retention by cohort. Observed to the cohort's age, the rest is modelled (dotted). */
export const retentionCohorts: Cohort[] = [
  {
    id: "aug-17",
    label: "Aug 17 installs",
    points: [
      { day: 0, value: 1 },
      { day: 1, value: 0.44 },
      { day: 7, value: 0.23 },
      { day: 14, value: 0.16 },
      { day: 30, value: 0.108 },
      { day: 60, value: 0.074, estimated: true },
      { day: 90, value: 0.058, estimated: true },
    ],
  },
  {
    id: "sep-7",
    label: "Sep 7 installs",
    points: [
      { day: 0, value: 1 },
      { day: 1, value: 0.46 },
      { day: 7, value: 0.25 },
      { day: 14, value: 0.18 },
      { day: 30, value: 0.121, estimated: true },
      { day: 60, value: 0.084, estimated: true },
      { day: 90, value: 0.066, estimated: true },
    ],
  },
  {
    id: "sep-21",
    label: "Sep 21 installs",
    points: [
      { day: 0, value: 1 },
      { day: 1, value: 0.49 },
      { day: 7, value: 0.27 },
      { day: 14, value: 0.2, estimated: true },
      { day: 30, value: 0.136, estimated: true },
      { day: 60, value: 0.094, estimated: true },
      { day: 90, value: 0.073, estimated: true },
    ],
  },
];

/** Cumulative ROAS (revenue / bounty cost) by days since install. */
export const paybackCohorts: Cohort[] = [
  {
    id: "aug-17",
    label: "Aug 17 installs",
    points: [
      { day: 0, value: 0.06 },
      { day: 7, value: 0.31 },
      { day: 14, value: 0.54 },
      { day: 30, value: 0.88 },
      { day: 60, value: 1.34, estimated: true },
      { day: 90, value: 1.71, estimated: true },
    ],
  },
  {
    id: "sep-7",
    label: "Sep 7 installs",
    points: [
      { day: 0, value: 0.05 },
      { day: 7, value: 0.28 },
      { day: 14, value: 0.5 },
      { day: 30, value: 0.79, estimated: true },
      { day: 60, value: 1.18, estimated: true },
      { day: 90, value: 1.49, estimated: true },
    ],
  },
];

export const approvedPerWeek: BarDatum[] = [
  { label: "Aug 10", values: { value: 38 } },
  { label: "Aug 17", values: { value: 44 } },
  { label: "Aug 24", values: { value: 41 } },
  { label: "Aug 31", values: { value: 57 } },
  { label: "Sep 7", values: { value: 63 } },
  { label: "Sep 14", values: { value: 71 } },
  { label: "Sep 21", values: { value: 69 } },
  { label: "Sep 28", values: { value: 88 } },
];

export const viewsByPlatformWeekly: BarDatum[] = [
  { label: "Sep 7", values: { tiktok: 612_000, instagram: 288_000, youtube: 121_000 } },
  { label: "Sep 14", values: { tiktok: 688_000, instagram: 301_000, youtube: 140_000 } },
  { label: "Sep 21", values: { tiktok: 731_000, instagram: 344_000, youtube: 152_000 } },
  { label: "Sep 28", values: { tiktok: 826_000, instagram: 371_000, youtube: 168_000 } },
];

export const spendByBountyType: BarDatum[] = [
  { label: "Sep 7", title: "Week of Sep 7", values: { cpm: 412_000, cpa: 96_000, stacked: 180_000 } },
  { label: "Sep 14", title: "Week of Sep 14", values: { cpm: 448_000, cpa: 131_000, stacked: 204_000 } },
  { label: "Sep 21", title: "Week of Sep 21", values: { cpm: 466_000, cpa: 158_000, stacked: 231_000 } },
  { label: "Sep 28", title: "Week of Sep 28", values: { cpm: 497_000, cpa: 202_000, stacked: 249_000 } },
];

/** Clearing CPM by app category, cents per 1,000 verified views. */
export const cpmByCategory: BarDatum[] = [
  { label: "Money & budgeting", values: { value: 342 } },
  { label: "AI photo & video", values: { value: 287 } },
  { label: "AI assistants", values: { value: 264 } },
  { label: "Sleep & mind", values: { value: 231 } },
  { label: "Language & learning", values: { value: 218 } },
  { label: "Fitness", values: { value: 204 } },
  { label: "Productivity", values: { value: 191 } },
  { label: "Music & audio", values: { value: 163 } },
  { label: "Lifestyle & travel", values: { value: 142 } },
];

export const funnelStages: FunnelStage[] = [
  { id: "views", label: "Views", value: 4_212_880, kind: "tracked", note: "Platform-reported, verified at the 72-hour window." },
  { id: "clicks", label: "Clicks", value: 75_832, kind: "tracked", note: "Counted at joinflowd.io/r/ links and offer-code lookups." },
  { id: "installs", label: "Installs", value: 3_310, kind: "tracked", detail: "$2.58 per install", note: "Deferred link and code redemptions. This is what install bonuses pay on." },
  { id: "trials", label: "Trials", value: 1_026, kind: "tracked", detail: "$8.31 per trial", note: "RevenueCat events matched to a flowd link or code." },
  { id: "paid", label: "Paid", value: 214, kind: "estimated", detail: "CAC $39.80", note: "Trials are still converting. Estimated at the 31% historical trial-to-paid rate." },
];

const HOURS = ["12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p"];
export const HEATMAP_COLS = HOURS;
export const HEATMAP_ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Median views in the first 24 hours by posting day and hour. Evenings and weekends peak; 3 to 5 AM has no posts. */
export const bestTimeToPost: (number | null)[][] = HEATMAP_ROWS.map((_, row) =>
  HOURS.map((_, col) => {
    if (col >= 3 && col <= 5 && row !== 5) return null;
    const evening = Math.exp(-((col - 19.5) ** 2) / 18) * 9_000;
    const lunch = Math.exp(-((col - 12.5) ** 2) / 10) * 3_200;
    const weekend = row >= 5 ? 1.22 : 1;
    return Math.round((2_400 + evening + lunch) * weekend + wobble(row * 24 + col, 11) * 700);
  }),
);

export const HOOK_ROWS = ["Confession", "Before and after", "POV", "Screen reaction", "Myth bust"];
export const CTA_COLS = ["Link in bio", "Code", "Comment", "Duet"];
/** Installs per 1,000 verified views by hook type and call to action. */
export const hookByCta: (number | null)[][] = [
  [0.92, 1.31, 0.58, null],
  [1.18, 1.64, 0.71, 0.49],
  [0.74, 0.96, 0.44, 0.38],
  [1.41, 1.88, 0.82, 0.61],
  [0.88, 1.12, 0.51, null],
];

export const marketGroups: ScatterGroup[] = [
  { id: "fitness", label: "Fitness" },
  { id: "sleep", label: "Sleep & mind" },
  { id: "ai", label: "AI photo & video" },
];

const NAMES: Record<string, string[]> = {
  fitness: ["Stride Club", "Kettle Daily", "Rowly", "Peak Pace", "Mile Notes", "Plank Pal", "Tempo Run"],
  sleep: ["Nap Nest", "Drift Off", "Calm Hour", "Lull", "Moonbeam", "Dozy", "Hush Hush"],
  ai: ["Pixel Pal", "Reelwise", "Lensly", "Glimmer", "Clipsmith", "Framey", "Studio Loop"],
};

/** CPM (cents) against days to fill: higher prices fill faster. */
export const marketPoints: ScatterPoint[] = (["fitness", "sleep", "ai"] as const).flatMap((group, groupIndex) =>
  (NAMES[group] ?? []).map((name, index) => {
    const cpm = 150 + groupIndex * 38 + index * 29 + Math.round(wobble(index + groupIndex * 9, 13) * 14);
    const days = Math.max(1, 14.2 - cpm * 0.036 + wobble(index + groupIndex * 5, 14) * 1.1);
    return { id: `${group}-${index}`, label: name, group, x: cpm, y: Math.round(days * 10) / 10 };
  }),
);

export const spendShare = [
  { id: "nap-nest", label: "Nap Nest", value: 1_284_000 },
  { id: "fernlingo", label: "Fernlingo", value: 842_000 },
  { id: "loafly", label: "Loafly", value: 531_000 },
  { id: "kettle", label: "Kettle Daily", value: 266_000 },
  { id: "pixel-pal", label: "Pixel Pal", value: 148_000 },
  { id: "lull", label: "Lull", value: 94_000 },
  { id: "moonbeam", label: "Moonbeam", value: 61_000 },
];

export const sparkSets = {
  views: [310, 322, 305, 340, 368, 361, 392, 405, 398, 431, 452, 470],
  spend: [88, 91, 90, 95, 99, 97, 104, 110, 108, 114, 121, 126],
  installs: [210, 198, 224, 241, 236, 259, 271, 268, 290, 312, 318, 331],
  cost: [9.4, 9.1, 9.3, 8.8, 8.9, 8.4, 8.6, 8.2, 8.0, 8.1, 7.7, 7.4],
  earnings: [18, 22, 21, 27, 31, 29, 38, 41, 39, 47, 52, 58],
};
