import { Clock } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { Avatar, Badge, Money, Progress } from "@/components/ui";
import { REFERRAL_STATUS_META } from "@/lib/contract/types";
import { INVITE_EXPIRY_DAYS } from "@/lib/engine";
import type { ReferralView } from "@/lib/data/selectors";
import { formatDate } from "@/lib/format";

/** What each status means for you, in a sentence: never a bare chip. */
function nextStep(referral: ReferralView): string {
  switch (referral.status) {
    case "invited":
      return `Waiting for them to sign up. Invites expire after ${INVITE_EXPIRY_DAYS} days.`;
    case "joined":
      return "They joined. Your reward starts when their first dollar clears.";
    case "first_dollar":
      return "Their first dollar cleared. The 90-day reward window is open.";
    case "earning":
      return referral.reward_window_ends_at ? `Rewards run until ${formatDate(referral.reward_window_ends_at, "medium")}.` : "Rewards are running.";
    case "complete":
      return referral.reward_earned_cents >= referral.reward_cap_cents ? "You reached the cap on this person." : "The 90-day window ended.";
    case "expired":
      return "The invite expired unused. It cost nothing.";
  }
}

export function ReferralRow({ referral }: { referral: ReferralView }) {
  const status = REFERRAL_STATUS_META[referral.status];
  const capped = referral.reward_cap_cents > 0;
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-start gap-3.5">
        {referral.referee ? <ArtAvatar art={referral.referee.avatar} name={referral.referee.display_name} size={40} decorative /> : <Avatar name={referral.referee_label} size={40} decorative />}
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body-sm font-semibold text-fg">{referral.referee_label}</span>
            <Badge tone={status.tone} size="md">
              {status.label}
            </Badge>
          </div>
          <p className="text-caption text-fg-muted">{nextStep(referral)}</p>
          <p className="text-caption text-fg-subtle">
            Invited {formatDate(referral.invited_at, "medium")} by {referral.channel}
            {referral.joined_at ? ` · joined ${formatDate(referral.joined_at, "short")}` : ""}
          </p>
        </div>
      </div>
      <div className="grid gap-1.5 sm:w-56">
        <div className="flex items-baseline justify-between gap-3">
          <Money cents={referral.reward_earned_cents} size="sm" state={referral.reward_earned_cents > 0 ? "cleared" : "neutral"} icon={referral.reward_earned_cents > 0} />
          <span className="text-caption text-fg-subtle">
            of <Money cents={referral.reward_cap_cents} size="sm" decimals="never" icon={false} /> cap
          </span>
        </div>
        {capped ? <Progress size="sm" tone="mint" value={Math.min(referral.reward_earned_cents, referral.reward_cap_cents)} max={referral.reward_cap_cents} aria-label={`Reward earned from ${referral.referee_label}`} /> : null}
        {referral.window_days_left !== null && referral.status === "earning" ? (
          <p className="inline-flex items-center gap-1.5 text-caption text-fg-subtle">
            <Clock aria-hidden="true" className="size-3.5" />
            {referral.window_days_left} days left in the window
          </p>
        ) : null}
      </div>
    </li>
  );
}
