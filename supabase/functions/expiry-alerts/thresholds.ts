// Which expiry alert is due for a grant? Pure (tests/thresholds.test.ts).
//
// Thresholds are 30, 14 and 7 days (CONSTANTS.rights.expiry_alert_days). A grant gets ONE alert per run: the tightest threshold it has crossed
// that was not sent yet, and every looser threshold is recorded as sent with it, so a job that missed a few days does not send three alerts at once.
//   days left 29, nothing sent        -> alert "30", sent = [30]
//   days left 13, sent [30]           -> alert "14", sent = [30, 14]
//   days left 5,  sent [30]           -> alert "7",  sent = [30, 14, 7]   (the 14-day alert is skipped, not sent late)
//   days left 5,  sent [30, 14, 7]    -> nothing

export const ALERT_DAYS = [30, 14, 7] as const;

export interface AlertDecision {
  threshold: number;
  daysLeft: number;
  alertsSent: number[];
}

export function alertToSend(now: Date, endsAt: string, alreadySent: readonly number[]): AlertDecision | null {
  const daysLeft = Math.max(0, Math.ceil((Date.parse(endsAt) - now.getTime()) / 86_400_000));
  const crossed = ALERT_DAYS.filter((d) => daysLeft <= d);
  const unsent = crossed.filter((d) => !alreadySent.includes(d));
  if (unsent.length === 0) return null;
  const tightest = Math.min(...unsent);
  const alertsSent = [...new Set([...alreadySent, ...crossed])].sort((a, b) => b - a);
  return { threshold: tightest, daysLeft, alertsSent };
}
