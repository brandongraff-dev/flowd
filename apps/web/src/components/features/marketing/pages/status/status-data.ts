import { cache } from "react";
import { getServerState } from "@/lib/store/server";
import { selectAdminMetrics, selectPayoutOps } from "@/lib/data/selectors";
import { seededRng } from "@/lib/engine";

export type ComponentStatus = "operational" | "degraded" | "outage";

export interface UptimeDay {
  /** ISO date. */
  date: string;
  /** Percent of the day the component was fully up, 0 to 100. */
  uptime: number;
  status: ComponentStatus;
}

export interface StatusComponent {
  id: string;
  name: string;
  detail: string;
  status: ComponentStatus;
  /** One line on the current state, from live demo-world numbers where there are any. */
  note: string;
  /** Average of the 90 days, one decimal or two. */
  uptime90: number;
  /** Oldest first, 90 entries. */
  days: readonly UptimeDay[];
}

export interface IncidentUpdate {
  at: string;
  state: "Investigating" | "Identified" | "Monitoring" | "Resolved";
  text: string;
}

export interface Incident {
  id: string;
  title: string;
  componentId: string;
  /** ISO date of the start. */
  date: string;
  minutes: number;
  updates: readonly IncidentUpdate[];
}

export interface StatusPageData {
  now: string;
  overall: ComponentStatus;
  headline: string;
  components: readonly StatusComponent[];
  incidents: readonly Incident[];
  /** Real numbers from the demo world that the components lean on. */
  live: { slaBreached: number; slaStale: number; nextRunAt: string; nextRunPayouts: number; nextRunHeld: number; lastRunPayouts: number; lastRunFailed: number; lastRunAt: string };
  avgUptime: number;
}

const DAY = 86_400_000;
const DAYS = 90;

/**
 * Days that are not fully operational, per component: `[days before now, uptime percent]`. A short, fixed list so the history is stable and tells
 * the same story as the incident log below it. Everything else is 100%.
 */
const BLIPS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  api: [[20, 99.2]],
  uploads: [[19, 96.7], [43, 99.1], [71, 98.4]],
  payouts: [[73, 94.0]],
  webhooks: [[35, 91.5], [36, 99.4]],
  sla: [],
};

const CATALOGUE = [
  { id: "api", name: "API", detail: "api.joinflowd.io, the public and partner API" },
  { id: "uploads", name: "Video uploads", detail: "Resumable uploads, processing and the first-3-seconds check" },
  { id: "payouts", name: "Payouts", detail: "The Friday 18:00 UTC run and instant cash-out" },
  { id: "webhooks", name: "Webhooks", detail: "Outbound events to brands, with retries" },
  { id: "sla", name: "Review SLAs", detail: "Decisions inside the 72-hour promise" },
] as const;

const iso = (nowMs: number, daysBack: number): string => new Date(nowMs - daysBack * DAY).toISOString().slice(0, 10);

function history(id: string, nowMs: number, todayUptime: number): UptimeDay[] {
  const rng = seededRng(`status|${id}`);
  const blips = new Map((BLIPS[id] ?? []).map(([back, value]) => [back, value] as const));
  return Array.from({ length: DAYS }, (_, index) => {
    const back = DAYS - 1 - index;
    // A hair of noise on healthy days keeps the bars honest-looking without inventing incidents: never below 99.9.
    const base = 99.9 + Math.floor(rng() * 11) / 100;
    const uptime = back === 0 ? todayUptime : (blips.get(back) ?? Math.min(100, base));
    const status: ComponentStatus = uptime >= 99.5 ? "operational" : uptime >= 95 ? "degraded" : "outage";
    return { date: iso(nowMs, back), uptime, status };
  });
}

/** The status page: current state from live demo-world numbers where they exist (review SLAs, payout runs), a seeded 90-day history, and a short incident log. Demo data throughout. */
export const getStatusData = cache(async (): Promise<StatusPageData> => {
  const db = await getServerState();
  const nowMs = Date.parse(db.clock.now);
  const admin = selectAdminMetrics(db);
  const payouts = selectPayoutOps(db);
  const slaBreached = admin.queues.sla_breached;
  const slaStale = admin.queues.sla_stale;
  const lastRun = payouts.runs.filter((run) => run.status === "complete").sort((a, b) => (a.scheduled_for < b.scheduled_for ? 1 : -1))[0];
  const live = {
    slaBreached,
    slaStale,
    nextRunAt: payouts.next_run.scheduled_for,
    nextRunPayouts: payouts.next_run.payouts,
    nextRunHeld: payouts.next_run.held,
    lastRunPayouts: lastRun?.payouts_count ?? 0,
    lastRunFailed: lastRun?.failed_count ?? 0,
    lastRunAt: lastRun?.completed_at ?? lastRun?.scheduled_for ?? db.clock.now,
  };

  const now: Record<string, { status: ComponentStatus; today: number; note: string }> = {
    api: { status: "operational", today: 100, note: "Requests are succeeding. A failed request is safe to retry." },
    uploads: { status: "operational", today: 100, note: "Uploads and processing are running normally." },
    payouts: {
      status: "operational",
      today: 100,
      note: `The last run, ${new Date(live.lastRunAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}, paid ${live.lastRunPayouts - live.lastRunFailed} of ${live.lastRunPayouts} creators${live.lastRunFailed > 0 ? `; ${live.lastRunFailed} failed and was retried` : ""}.`,
    },
    webhooks: { status: "operational", today: 100, note: "Deliveries are on time. Failed ones retry for 24 hours." },
    sla: {
      status: slaBreached > 0 ? "degraded" : "operational",
      today: slaBreached > 0 ? 97.5 : 100,
      note: slaBreached > 0 ? `${slaBreached} ${slaBreached === 1 ? "video has" : "videos have"} waited past the 72-hour promise and ${slaBreached === 1 ? "is" : "are"} escalated. ${slaStale} more ${slaStale === 1 ? "is" : "are"} past 48 hours.` : "Every submission is inside the 72-hour promise.",
    },
  };

  const components: StatusComponent[] = CATALOGUE.map((item) => {
    const state = now[item.id] ?? { status: "operational" as const, today: 100, note: "" };
    const days = history(item.id, nowMs, state.today);
    const uptime90 = days.reduce((sum, day) => sum + day.uptime, 0) / days.length;
    return { ...item, status: state.status, note: state.note, uptime90, days };
  });

  const degraded = components.filter((component) => component.status !== "operational");
  const overall: ComponentStatus = components.some((component) => component.status === "outage") ? "outage" : degraded.length > 0 ? "degraded" : "operational";
  const headline =
    overall === "operational"
      ? "All systems operational"
      : overall === "outage"
        ? "Some systems are down"
        : degraded.length === 1
          ? `${degraded[0]?.name ?? "One system"} is running slow. Everything else is operational`
          : `${degraded.length} systems are degraded`;

  const at = (daysBack: number, hours: number, minutes: number): string => `${iso(nowMs, daysBack)}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`;
  const incidents: Incident[] = [
    {
      id: "inc_upload_slow",
      title: "Slow video uploads on mobile networks",
      componentId: "uploads",
      date: iso(nowMs, 19),
      minutes: 47,
      updates: [
        { at: at(19, 15, 12), state: "Investigating", text: "Uploads from some mobile networks are taking much longer than usual. Takes are saved on the phone and resume on their own." },
        { at: at(19, 15, 38), state: "Identified", text: "A misconfigured upload region was sending some traffic the long way round. We are moving it." },
        { at: at(19, 15, 59), state: "Resolved", text: "Upload times are back to normal. No take was lost, and no submission missed its decision clock because of this." },
      ],
    },
    {
      id: "inc_webhook_delay",
      title: "Delayed webhook deliveries",
      componentId: "webhooks",
      date: iso(nowMs, 35),
      minutes: 72,
      updates: [
        { at: at(35, 9, 4), state: "Investigating", text: "Brands may see approval and settlement webhooks arrive late." },
        { at: at(35, 9, 41), state: "Identified", text: "A queue worker stalled. We restarted it and are draining the backlog." },
        { at: at(35, 10, 16), state: "Resolved", text: "Every delayed event was delivered, in order, with its original timestamp. Nothing was dropped." },
      ],
    },
    {
      id: "inc_api_errors",
      title: "Elevated API error rate",
      componentId: "api",
      date: iso(nowMs, 20),
      minutes: 18,
      updates: [
        { at: at(20, 13, 2), state: "Investigating", text: "A small share of API requests are returning errors." },
        { at: at(20, 13, 20), state: "Resolved", text: "A bad deploy was rolled back. Error rate is back to normal." },
      ],
    },
    {
      id: "inc_payout_late",
      title: "Friday payout run finished late",
      componentId: "payouts",
      date: iso(nowMs, 73),
      minutes: 55,
      updates: [
        { at: at(73, 18, 20), state: "Investigating", text: "The weekly payout run started on time and is processing more slowly than usual." },
        { at: at(73, 18, 58), state: "Monitoring", text: "The payment provider is rate limiting us. The run is continuing in smaller batches." },
        { at: at(73, 19, 15), state: "Resolved", text: "The run completed 55 minutes late. Every creator was paid the full amount, and no fee was charged for the delay." },
      ],
    },
  ];

  return { now: db.clock.now, overall, headline, components, incidents, live, avgUptime: components.reduce((sum, component) => sum + component.uptime90, 0) / components.length };
});
