"use client";

import Link from "next/link";
import { Ban, Check, Copy, FileWarning, Fingerprint, ShieldCheck, Subtitles } from "lucide-react";
import { PlatformGlyph, platformName } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, EmptyState, ProgressRing } from "@/components/ui";
import { Section } from "@/components/shell";
import { ACCOUNT_HEALTH_STATUS_META } from "@/lib/contract/types";
import { useSubmissions } from "@/lib/data";
import type { SafetyView, SubmissionView } from "@/lib/data/selectors";
import { formatCompact, formatDate } from "@/lib/format";

const CHECKS = [
  { icon: Copy, title: "Duplicate video", body: "A perceptual fingerprint of every take is compared with videos already submitted or posted. A near copy is flagged before a brand sees it." },
  { icon: Fingerprint, title: "Another app's watermark", body: "A visible logo from another app or editor is flagged. Platforms hold back unoriginal clips, and brands cannot run them as ads." },
  { icon: Subtitles, title: "Captions-only clips", body: "A clip that is only text over stock footage or a screen capture, with no original take, is flagged as unoriginal." },
] as const;

const RULES = [
  "Post your own original videos. Reposting another creator's clip, or the same clip to many accounts, can cost you reach and payouts.",
  "Use the platform's paid-partnership label as well as #ad. flowd adds #ad and the brand wording for you.",
  "Keep one account per person. A bounty can never require a new, dedicated or burner account.",
  "A strike belongs to the account it landed on. Fix what the platform flagged before you post more bounty videos from it.",
] as const;

/** One submission's originality result in words: clear, or what was flagged and why. */
function originality(submission: SubmissionView): { tone: "mint" | "ember" | "rose"; label: string; detail: string } {
  const code = submission.decision?.reason_code;
  if (submission.fraud_evidence.duplicate_of_submission_id) {
    return { tone: "rose", label: "Duplicate flagged", detail: `Matches an earlier video (fingerprint distance ${submission.fraud_evidence.phash_distance ?? 0}). Submit a fresh take.` };
  }
  if (code === "watermark_present") return { tone: "ember", label: "Watermark flagged", detail: "Another app's watermark was visible. Re-export without it." };
  if (code === "unoriginal_clip" || code === "duplicate_content") return { tone: "rose", label: "Unoriginal clip", detail: "The brand flagged it as not original. Film your own take." };
  return { tone: "mint", label: "Original", detail: "No duplicate, watermark or unoriginal-clip flag." };
}

export function AccountHealthTab({ safety }: { safety: SafetyView }) {
  const submissions = useSubmissions({ creator: "mine" });
  const recent = [...submissions].sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)).slice(0, 8);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <Section title="Your accounts" description="Read-only health for each connected account. Healthy accounts keep earning; a watch or at-risk account tells you what to fix.">
        {safety.accounts.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {safety.accounts.map(({ account, health, guidance }) => {
              const meta = ACCOUNT_HEALTH_STATUS_META[health.status];
              return (
                <li key={account.id} className="grid">
                  <GlassCard className="grid grid-cols-[minmax(0,1fr)] content-start gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <PlatformGlyph platform={account.platform} size={40} decorative />
                        <div className="grid min-w-0 gap-0.5">
                          <h3 className="truncate font-display text-title-sm text-fg">@{account.handle}</h3>
                          <p className="text-caption text-fg-subtle">
                            {platformName(account.platform)} · {formatCompact(account.followers)} followers
                          </p>
                        </div>
                      </div>
                      <ProgressRing value={health.score} size={64} thickness={6} tone={health.status === "good" ? "mint" : health.status === "watch" ? "ember" : "rose"} aria-label={`${platformName(account.platform)} health score`} valueText={`Health score ${health.score} of 100`}>
                        <span className="text-body-sm tabular-nums">{health.score}</span>
                      </ProgressRing>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone} size="lg" icon={health.status === "good" ? <Check /> : <FileWarning />}>
                        {meta.label}
                      </Badge>
                      <Badge tone="neutral" size="lg">
                        {health.strikes} {health.strikes === 1 ? "strike" : "strikes"}
                      </Badge>
                      <Badge tone="neutral" size="lg">
                        {health.unoriginal_flags} unoriginal {health.unoriginal_flags === 1 ? "flag" : "flags"}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-pretty text-fg-muted">{guidance}</p>
                    <p className="text-caption text-fg-subtle">Last synced {formatDate(account.last_synced_at, "medium")}. flowd reads this account and can never post for you.</p>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        ) : (
          <GlassCard>
            <EmptyState
              art="inbox"
              title="No accounts linked"
              description="Link TikTok or Instagram in Settings and flowd will show each account's health here. Linking is read-only."
              action={
                <Button asChild variant="primary">
                  <Link href="/creator/settings">Link an account</Link>
                </Button>
              }
            />
          </GlassCard>
        )}
      </Section>

      <Section title="Originality checks" description="The last videos you submitted and what the checks found. Each submission is checked before a brand sees it.">
        {recent.length > 0 ? (
          <GlassCard padding="sm">
            <ul className="grid divide-y divide-divider">
              {recent.map((submission) => {
                const result = originality(submission);
                return (
                  <li key={submission.id} className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                    <div className="grid min-w-0 gap-0.5">
                      <Link href={`/creator/submissions/${submission.id}`} className="truncate text-body-sm font-semibold text-fg underline-offset-4 hover:underline">
                        {submission.title}
                      </Link>
                      <p className="text-caption text-fg-subtle">
                        {submission.brand.name} · {formatDate(submission.submitted_at, "medium")} · {result.detail}
                      </p>
                    </div>
                    <Badge tone={result.tone} size="lg" icon={result.tone === "mint" ? <Check /> : <FileWarning />}>
                      {result.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        ) : (
          <GlassCard>
            <EmptyState size="sm" art="video" title="Nothing checked yet" description="When you submit your first video, its originality result shows up here." />
          </GlassCard>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        {CHECKS.map((check) => (
          <GlassCard key={check.title} className="grid content-start gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <check.icon className="size-5" />
            </span>
            <h3 className="font-display text-title-sm text-fg">{check.title}</h3>
            <p className="text-body-sm text-pretty text-fg-muted">{check.body}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <GlassCard className="grid gap-3" aria-labelledby="platform-rules">
          <h2 id="platform-rules" className="flex items-center gap-2 font-display text-title-md text-fg">
            <ShieldCheck aria-hidden="true" className="size-5 text-mint" />
            Platform rules, short version
          </h2>
          <ul className="grid gap-2.5 text-body-sm text-fg-muted">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                <span className="text-pretty">{rule}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/creator/academy/platform-rules-and-ad-disclosure">Read the free lesson</Link>
          </Button>
        </GlassCard>
        <GlassCard className="grid gap-3" aria-labelledby="burner-rule">
          <h2 id="burner-rule" className="flex items-center gap-2 font-display text-title-md text-fg">
            <Ban aria-hidden="true" className="size-5 text-rose" />
            The no-burner-accounts rule
          </h2>
          <p className="text-body-sm text-pretty text-fg-muted">
            No bounty on flowd can require a new, dedicated or burner account, or a fixed number of posts a day. Brief Lint blocks it before a brand can publish, and flowd Ops reviews every report of one.
          </p>
          <Callout tone="sun" title="Asked to open a new account?">
            Say no and report it. It puts your other accounts at risk, and it is against the rules for brands too.
          </Callout>
        </GlassCard>
      </div>
    </div>
  );
}
