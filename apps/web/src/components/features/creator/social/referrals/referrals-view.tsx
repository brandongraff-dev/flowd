"use client";

import { Gift, Info, ShieldCheck, Users } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, CopyField, EmptyState, Money } from "@/components/ui";
import { PageHeader, Section } from "@/components/shell";
import { useReferrals, useStoreReady, useWaitlist } from "@/lib/data";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SocialSkeleton } from "../shared/skeletons";
import { InviteForm } from "./invite-form";
import { ReferralRow } from "./referral-row";

function Tile({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl bg-surface-field p-4">
      <dt className="text-caption font-medium text-fg-subtle">{label}</dt>
      <dd className="font-display text-figure-lg text-fg tabular-nums">{children}</dd>
      {note ? <p className="text-caption text-fg-subtle">{note}</p> : null}
    </div>
  );
}

export function ReferralsView() {
  const ready = useStoreReady();
  const data = useReferrals();
  const waitlist = useWaitlist();
  if (!ready) return <SocialSkeleton label="Loading referrals" layout="hero" />;

  const { totals, rules, referrals } = data;
  const leaders = waitlist.leaders.slice(0, 5);
  const myRank = waitlist.leaders.filter((leader) => leader.referrals > totals.joined).length + 1;
  const ranked = myRank <= waitlist.leaders.length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Grow"
        title="Referrals"
        description={`Invite a creator. When their money clears you earn ${formatPct(rules.rate, 0)} of it for ${rules.days} days, up to $${rules.cap_per_referee_cents / 100} per person. flowd pays it. The person you invite pays nothing.`}
        meta={
          <Badge tone="mint" size="lg" icon={<ShieldCheck />}>
            Funded by flowd, never by the people you invite
          </Badge>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <GlassCard padding="lg" aria-labelledby="share-code" className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <div className="grid gap-2">
            <p className="fd-eyebrow text-accent">Your invite</p>
            <h2 id="share-code" className="font-display text-display-md tracking-wide text-fg tabular-nums">
              {data.code}
            </h2>
            <p className="max-w-[52ch] text-body-sm text-fg-muted">Share your code or link. When you post it publicly, say you get a reward for invites, for example with &ldquo;referral link&rdquo; or #ad.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <CopyField aria-label="Referral link" value={data.link} />
            <CopyField aria-label="Referral code" value={data.code} className="sm:w-40" />
          </div>
          <div className="border-t border-divider pt-6">
            <h3 className="mb-4 font-display text-title-sm text-fg">Save an invite</h3>
            <InviteForm />
          </div>
        </GlassCard>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <GlassCard className="grid gap-4" aria-labelledby="ref-totals">
            <h2 id="ref-totals" className="font-display text-title-md text-fg">
              How it is going
            </h2>
            <dl className="grid grid-cols-2 gap-3">
              <Tile label="Invited">{totals.invited}</Tile>
              <Tile label="Joined">{totals.joined}</Tile>
              <Tile label="Earning now">{totals.earning}</Tile>
              <Tile label="Earned so far">
                <Money cents={totals.earned_cents} size="lg" state={totals.earned_cents > 0 ? "cleared" : "neutral"} icon={false} />
              </Tile>
            </dl>
            <p className="flex items-start gap-2 text-caption text-fg-subtle">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Not every invite joins and not every one earns. {totals.invited > 0 ? `${totals.earning} of your ${totals.invited} invites ${totals.earning === 1 ? "is" : "are"} earning you money today.` : "Start with someone who already makes videos."}
            </p>
          </GlassCard>

          <GlassCard className="grid gap-3" aria-labelledby="ref-rules">
            <h2 id="ref-rules" className="flex items-center gap-2 font-display text-title-sm text-fg">
              <Gift aria-hidden="true" className="size-[18px] text-mint" />
              The rules, in numbers
            </h2>
            <ul className="grid gap-2 text-body-sm text-fg-muted">
              <li>{formatPct(rules.rate, 0)} of the other creator&rsquo;s cleared earnings, for {rules.days} days after their first dollar.</li>
              <li>Capped at ${rules.cap_per_referee_cents / 100} per person. One level only: no second tier, no chance-based prizes.</li>
              <li>Paid by flowd into your Wallet as cleared money. It never reduces what they earn.</li>
              <li>Referring yourself earns nothing.</li>
            </ul>
          </GlassCard>
        </div>
      </div>

      <Section title="Your invites" description="Everyone you invited, what happened, and what it earned you. Each row says what comes next.">
        {referrals.length > 0 ? (
          <GlassCard padding="sm">
            <ul className="grid divide-y divide-divider">
              {referrals.map((referral) => (
                <ReferralRow key={referral.id} referral={referral} />
              ))}
            </ul>
          </GlassCard>
        ) : (
          <GlassCard>
            <EmptyState
              art="inbox"
              title="No invites yet"
              description="Save an invite above, then send your link or code. Your reward appears here the day their first dollar clears."
            />
          </GlassCard>
        )}
      </Section>

      <Section title="Top referrers" description="The creators who have brought the most people to flowd, many since April. There is no prize for rank: your reward is the share above.">
        <GlassCard padding="sm" className="min-w-0">
          <ol className="grid divide-y divide-divider">
            {leaders.map((leader) => (
              <li key={leader.position} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <span className="text-center font-display text-title-sm text-fg-muted tabular-nums">{leader.position}</span>
                <span className="truncate text-body-sm font-semibold text-fg">@{leader.handle}</span>
                <span className="inline-flex items-center gap-1.5 text-body-sm text-fg-muted tabular-nums">
                  <Users aria-hidden="true" className="size-4" />
                  {leader.referrals} joined
                </span>
              </li>
            ))}
            <li className={cn("grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 bg-accent-soft px-4 py-3")}>
              <span className="text-center font-display text-title-sm text-accent tabular-nums">{ranked ? myRank : "·"}</span>
              <span className="text-body-sm font-semibold text-fg">You{ranked ? "" : `: outside the top ${waitlist.leaders.length}`}</span>
              <span className="inline-flex items-center gap-1.5 text-body-sm text-fg-muted tabular-nums">
                <Users aria-hidden="true" className="size-4" />
                {totals.joined} joined
              </span>
            </li>
          </ol>
        </GlassCard>
      </Section>
    </div>
  );
}
