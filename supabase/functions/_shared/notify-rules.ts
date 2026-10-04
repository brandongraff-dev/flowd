// Notification rules that are pure (tests/notify-rules.test.ts): which preference category a notification belongs to, whether a time is inside
// quiet hours, and whether Wellbeing Mode asks us to hide numbers. The delivery code in notify.ts applies them.
//
// Wellbeing Mode (DECISIONS 4.11): quiet hours, numbers-off, slack streaks. Cash events (priority "cash") ignore quiet hours because earnings and
// payouts are what people most want to hear about, but a category the person switched off stays off.

export interface QuietHours {
  enabled: boolean;
  /** "22:00" local. */
  start: string;
  /** "08:00" local. */
  end: string;
  timezone: string;
}

export interface NumbersOff {
  enabled: boolean;
  from?: string;
  to?: string;
}

/** notification_prefs.categories keys: money, reviews, drop, offers, tournaments, tips, safety. */
export type PrefCategory = 'money' | 'reviews' | 'drop' | 'offers' | 'tournaments' | 'tips' | 'safety';

const CATEGORY: Readonly<Record<string, PrefCategory>> = {
  cash_event: 'money', payout_cleared: 'money', payout_paid: 'money', payout_held: 'money', tax_info_needed: 'money', funding_needed: 'money', bounty_funded: 'money',
  approval: 'reviews', changes_requested: 'reviews', rejection: 'reviews', appeal_decided: 'reviews', review_waiting: 'reviews', review_sla_warning: 'reviews', auto_approve_paused: 'reviews', dispute_update: 'reviews', post_live: 'reviews',
  drop_live: 'drop', drop_reminder: 'drop', bounty_filled: 'drop',
  offer_received: 'offers', offer_countered: 'offers', offer_accepted: 'offers', rights_expiring: 'offers', rights_renewed: 'offers', ad_live: 'offers', fatigue_alert: 'offers',
  tournament_update: 'tournaments', crew_invite: 'tournaments',
  flo_tip: 'tips', academy_badge: 'tips', streak_milestone: 'tips', streak_freeze_used: 'tips', referral_joined: 'tips', tier_up: 'tips', views_milestone: 'tips',
  scam_warning: 'safety', system_notice: 'safety',
};

export function categoryOf(kind: string): PrefCategory {
  return CATEGORY[kind] ?? 'tips';
}

/** Is `now` inside the quiet-hours window, in the person's timezone? Windows may wrap midnight (22:00 to 08:00). Disabled or missing = never quiet. */
export function inQuietHours(quiet: QuietHours | null | undefined, fallbackTimeZone: string, now: Date): boolean {
  if (!quiet || !quiet.enabled) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: quiet.timezone || fallbackTimeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  }
  const minutes = (Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24) * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const toMin = (s: string): number => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const start = toMin(quiet.start);
  const end = toMin(quiet.end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Numbers-off hides amounts while it is enabled and (when dates are set) today is inside [from, to]. */
export function numbersHidden(setting: { enabled: boolean; numbers_off: NumbersOff } | null | undefined, now: Date): boolean {
  if (!setting || !setting.enabled || !setting.numbers_off.enabled) return false;
  const { from, to } = setting.numbers_off;
  if (from && now.getTime() < Date.parse(from)) return false;
  if (to && now.getTime() > Date.parse(to) + 86_400_000) return false;
  return true;
}

/** "$1,240.50" becomes "an amount" (money in free text, for numbers-off). */
export function redactMoney(text: string): string {
  return text.replace(/\$[\d,]+(\.\d{2})?/g, 'an amount');
}
