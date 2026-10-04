/**
 * "What should I do today?": up to three lines, in priority order, from the signals the caller has. Flo only talks about what it can see,
 * skips what it cannot, and never guilts: a quiet week is fine, a rest week is allowed, and money that is pending always comes with its date.
 */

import type { FloAction } from "@/lib/contract/types";
import { formatMoney } from "@/lib/engine/money";
import type { FloTaskOf } from "../schemas";
import { FLO_LABEL } from "../types";
import { act, type MockAnswer } from "./common";

interface Line {
  text: string;
  action?: FloAction;
}

const plural = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function creatorLines(task: FloTaskOf<"next_action">): Line[] {
  const s = task.signals;
  const lines: Line[] = [];
  if (s.drop_state === "live" && (s.drop_spots_left ?? 1) > 0) {
    lines.push({ text: `Today's Daily Drop is live${s.drop_spots_left !== undefined ? ` with ${plural(s.drop_spots_left, "spot")} left` : ""}. The count is real, so claim a spot if a bounty fits.`, action: act("Open the Daily Drop", "open_drop") });
  } else if (s.drop_state === "pre_drop") {
    lines.push({ text: "Today's Daily Drop lands at 16:00 UTC. Nothing to do until then.", action: act("Open the Daily Drop", "open_drop") });
  } else if (s.drop_state === "sold_out") {
    lines.push({ text: "Today's Daily Drop is sold out. The next one lands tomorrow at 16:00 UTC." });
  }
  if ((s.posts_counting ?? 0) > 0) {
    lines.push({ text: `${plural(s.posts_counting ?? 0, "post is", "posts are")} still counting views. Nothing to do on ${s.posts_counting === 1 ? "it" : "them"} until the 72-hour window${s.posts_counting === 1 ? "" : "s"} close${s.posts_counting === 1 ? "s" : ""}.` });
  }
  if (s.pending_cents !== undefined && s.pending_cents > 0 && s.next_clear_label) {
    lines.push({ text: `${formatMoney(s.pending_cents)} is pending and ${s.next_clear_label}.` });
  }
  if (s.streak_weeks !== undefined && s.streak_weeks > 0) {
    lines.push(
      s.posted_this_week
        ? { text: `You have posted this week, so your streak holds at ${plural(s.streak_weeks, "week")}. Rest is fine too: a rest week keeps it.` }
        : {
            text: `${plural(s.streak_weeks, "week")} in a row so far. One post this week makes it ${s.streak_weeks + 1}${(s.freezes_banked ?? 0) > 0 ? `, and ${plural(s.freezes_banked ?? 0, "freeze")} banked if the week gets away from you` : ""}.`,
            action: act("Open Studio", "open_studio"),
          },
    );
  }
  if (s.avg_hook_seconds !== undefined && s.avg_hook_seconds > 2) {
    lines.push({ text: `Your last openings landed at ${s.avg_hook_seconds.toFixed(1)} seconds on average. The Hook Score gives full points at 2.0, so tighten the first line.`, action: act("Open Studio", "open_studio") });
  }
  return lines;
}

function brandLines(task: FloTaskOf<"next_action">): Line[] {
  const s = task.signals;
  const lines: Line[] = [];
  if ((s.submissions_waiting ?? 0) > 0) {
    const oldest = s.oldest_waiting_hours;
    const age = oldest === undefined ? "" : oldest >= 72 ? ` The oldest has waited ${Math.round(oldest)} hours, past the 72-hour review SLA.` : oldest >= 48 ? ` The oldest has waited ${Math.round(oldest)} hours: past 48 it counts as stale, and at 72 the review SLA is breached.` : ` The oldest has waited ${Math.round(oldest)} hours; a decision is due within 72.`;
    lines.push({ text: `${plural(s.submissions_waiting ?? 0, "submission")} waiting for a decision.${age}`, action: act("Open the review queue", "open_review") });
  }
  if ((s.drafts_unfunded ?? 0) > 0) {
    lines.push({ text: `${plural(s.drafts_unfunded ?? 0, "draft bounty", "draft bounties")} waiting on funding. A bounty cannot go live until it is fully escrowed.`, action: act("Open the builder", "open_builder") });
  }
  if (s.rights_expiring_days !== undefined) {
    lines.push({ text: `A usage licence ends in ${plural(s.rights_expiring_days, "day")}. Renew it or let it end: the Rights Vault shows the price.` });
  }
  if ((s.fatigue_alerts ?? 0) > 0) {
    lines.push({ text: `${plural(s.fatigue_alerts ?? 0, "winning post is", "winning posts are")} down 30% from peak. A refresh bounty can bring the audience back.` });
  }
  return lines;
}

export function answerNextAction(task: FloTaskOf<"next_action">): MockAnswer {
  const all = task.role === "creator" ? creatorLines(task) : brandLines(task);
  const lines = all.slice(0, 3);
  if (lines.length === 0) {
    lines.push({
      text: task.role === "creator" ? "Nothing is waiting on you. A good moment to look at the feed or make a take, if you feel like it." : "Nothing is waiting on you. A good moment to start a bounty or check the Market view.",
      action: task.role === "creator" ? act("Open Studio", "open_studio") : act("Start a bounty", "open_builder"),
    });
  }
  const seen = new Set<string>();
  const actions = lines.flatMap((l) => (l.action ? [l.action] : [])).filter((a) => (seen.has(a.kind) ? false : (seen.add(a.kind), true)));

  return {
    surface: task.surface ?? "home",
    title: "What to do today",
    outputs: lines.map((l) => l.text),
    notes: [],
    actions,
    label: FLO_LABEL,
  };
}
