"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CircleCheck, Copy, ShieldAlert } from "lucide-react";
import { CURVE_SHAPE_META, FRAUD_BAND_META, FRAUD_SIGNAL_META, type SnapshotFlag, type VideoAnalysis } from "@/lib/contract/types";
import { usePostLedger, usePosts } from "@/lib/data";
import type { SubmissionView } from "@/lib/data/selectors";
import { expectedViewCurve, hoursBetween } from "@/lib/engine";
import { formatCompact, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LineChart, type XYMarker } from "@/components/charts";
import { PlatformGlyph } from "@/components/brand";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { accountAge, useCreatorAccounts } from "./focus-data";
import { DuplicateBadge, FraudBadge } from "./parts";

const FLAG_LABEL: Partial<Record<SnapshotFlag, string>> = {
  spike: "Spike",
  bot_pattern: "Bot-like pattern",
  geo_shift: "Audience moved abroad",
  plateau: "Flat run",
};

const CURVE_NOTE: Record<keyof typeof CURVE_SHAPE_META, string> = {
  organic: "A fast start and a natural decay, like real viewers finding a video.",
  spiky: "One hour carries far more than its neighbours. Worth a look at where it came from.",
  flat: "Views keep arriving at the same rate for a day or more, with no decay.",
  stepped: "Most views land in two hours and little elsewhere: the signature of bought views.",
};

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ember" | "rose" | "mint" }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className={cn("font-display text-title-sm tabular-nums", tone === "ember" ? "text-ember" : tone === "rose" ? "text-rose" : tone === "mint" ? "text-mint" : "text-fg")}>{value}</dd>
      {hint ? <dd className="text-caption text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}

export interface FraudEvidenceProps {
  submission: SubmissionView;
  analysis?: VideoAnalysis;
}

/**
 * The fraud evidence a reviewer sees before approving (F-046): the creator's fraud score and band, the shape of their views, where their
 * audience is, how old their account is, whether this video matches another, and the hourly curve of their latest post with the
 * moments that stood out. It is saved with the decision, so a dispute later can see exactly what the reviewer saw.
 */
export function FraudEvidence({ submission, analysis }: FraudEvidenceProps) {
  const evidence = submission.fraud_evidence;
  const accounts = useCreatorAccounts(submission.creator_id);
  const latest = usePosts({ creator: submission.creator_id, sort: "newest", limit: 1 })[0];
  const ledger = usePostLedger(latest?.id);
  const primary = accounts[0];
  const duplicate = evidence.duplicate_of_submission_id;
  const band = FRAUD_BAND_META[evidence.creator_fraud_band];
  const shape = CURVE_SHAPE_META[evidence.view_curve_shape];

  const curve = useMemo(() => {
    if (!latest || ledger.snapshots.length === 0) return null;
    const inWindow = ledger.snapshots.filter((s) => hoursBetween(latest.posted_at, s.taken_at) <= 72.5);
    if (inWindow.length < 3) return null;
    const total = inWindow[inWindow.length - 1]?.views_verified ?? 0;
    const expected = expectedViewCurve({ total_views: Math.max(total, 1), hours: 72 });
    const points: { x: number; y: number }[] = [];
    const band: { x: number; low: number; high: number }[] = [];
    const markers: XYMarker[] = [];
    let previous = 0;
    for (const s of inWindow) {
      const hour = Math.round(hoursBetween(latest.posted_at, s.taken_at));
      if (hour <= 0) continue;
      let low = 0;
      let high = 0;
      for (let h = previous; h < Math.min(hour, 72); h += 1) {
        low += expected.low[h] ?? 0;
        high += expected.high[h] ?? 0;
      }
      previous = hour;
      points.push({ x: hour, y: s.delta_verified });
      band.push({ x: hour, low: Math.round(low), high: Math.round(high) });
      const flag = s.flags.find((f) => FLAG_LABEL[f] !== undefined);
      if (flag) markers.push({ id: s.id, x: hour, y: s.delta_verified, label: FLAG_LABEL[flag] ?? flag });
    }
    return { points, band, markers };
  }, [latest, ledger.snapshots]);

  return (
    <GlassCard padding="lg" className="grid scroll-mt-40 gap-5" id="fraud">
      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-title-md text-fg">Fraud evidence</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <FraudBadge band={evidence.creator_fraud_band} score={evidence.creator_fraud_score} always />
            {duplicate ? <DuplicateBadge distance={evidence.phash_distance} /> : null}
          </div>
        </div>
        <p className="max-w-[62ch] text-body-sm text-fg-muted">{band.meaning} Built from the creator&rsquo;s recent posts, because there is no post for this video yet.</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Fact label="Fraud score" value={`${evidence.creator_fraud_score} of 100`} hint={band.label} tone={evidence.creator_fraud_band === "high" ? "rose" : evidence.creator_fraud_band === "review" ? "ember" : undefined} />
        <Fact label="US audience" value={formatPct(evidence.audience_us_ratio, 0)} hint={primary ? `on @${primary.handle}` : undefined} />
        <Fact label="View curve" value={shape.label} hint="their typical shape" tone={evidence.view_curve_shape === "organic" ? "mint" : "ember"} />
        <Fact label="Account age" value={primary ? accountAge(primary.age_days) : "Unknown"} hint={primary ? `${formatCompact(primary.followers)} followers` : undefined} tone={primary && primary.age_days < 60 ? "ember" : undefined} />
      </dl>
      <p className="text-caption text-fg-subtle">{CURVE_NOTE[evidence.view_curve_shape]}</p>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-body-sm font-semibold text-fg">How their latest post&rsquo;s views arrived</h3>
          <p className="text-caption text-fg-subtle">Verified views per 6 hours, against the range organic views usually fall in</p>
        </div>
        {ledger.loading && latest ? (
          <Skeleton className="h-52 w-full" />
        ) : curve ? (
          <>
            <LineChart
              bare
              height={210}
              summary={`Verified views per six hours across the first 72 hours of the creator's latest post, with the expected organic range shaded. ${curve.markers.length === 0 ? "Nothing stood out." : `${curve.markers.length} moments stood out: ${curve.markers.map((m) => `${m.label} at ${m.x} hours`).join(", ")}.`}`}
              series={[{ id: "views", label: "Verified views", points: curve.points }]}
              band={{ id: "expected", label: "Expected range", lowLabel: "Expected low", highLabel: "Expected high", points: curve.band }}
              markers={curve.markers}
              xFormat={(x) => `${x} h`}
              xTooltipFormat={(x) => `${x} hours after posting`}
              xTicks={[6, 12, 24, 36, 48, 60, 72]}
              xAxisTitle="Hours after posting"
              yFormat={formatCompact}
              yTooltipFormat={(v) => v.toLocaleString("en-US")}
              curve="monotone"
              legend
            />
            {curve.markers.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-caption font-medium text-mint">
                <CircleCheck aria-hidden="true" className="size-3.5" />
                Nothing stood out: every interval sits inside the organic range.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Moments that stood out">
                {curve.markers.map((m) => (
                  <li key={m.id}>
                    <Badge tone="ember" icon={<ShieldAlert aria-hidden="true" />}>
                      {m.label} at {String(m.x)} h
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-surface-field px-4 py-3.5 text-body-sm text-fg-muted">
            {latest ? "Their latest post is too new to draw a curve." : "No posts yet. First videos are always reviewed by a person, and the curve appears after their first post settles."}
          </p>
        )}
      </div>

      {latest && latest.fraud.signals.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-body-sm font-semibold text-fg">Rules that fired on that post</h3>
          <ul className="grid gap-1.5">
            {latest.fraud.signals.map((s) => (
              <li key={s.signal} className="flex items-start gap-3 rounded-xl bg-surface-field px-3.5 py-2.5">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ember" />
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-body-sm font-medium text-fg">{FRAUD_SIGNAL_META[s.signal].label}</p>
                  <p className="text-caption text-fg-muted">{s.detail}</p>
                </div>
                <span className="ml-auto shrink-0 text-caption font-semibold text-fg-muted tabular-nums">+{s.points}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-2xl bg-surface-field p-4 sm:grid-cols-2">
        <div className="grid min-w-0 content-start gap-1">
          <p className="flex items-center gap-1.5 text-body-sm font-semibold text-fg">
            <Copy aria-hidden="true" className="size-4 text-fg-subtle" />
            Duplicate check
          </p>
          {duplicate ? (
            <p className="text-body-sm text-fg-muted">
              This video looks like{" "}
              <Link href={`/brand/review/${duplicate}`} className="font-medium text-accent hover:underline">
                an earlier submission
              </Link>
              {evidence.phash_distance !== undefined ? ` (hash distance ${evidence.phash_distance}, where 0 is identical)` : ""}. Approving it needs a reason.
            </p>
          ) : (
            <p className="text-body-sm text-fg-muted">No near-duplicate among the videos on flowd.</p>
          )}
          {analysis ? (
            <p className="text-caption text-fg-subtle">
              Hash <span className="font-mono text-fg-muted">{analysis.phash}</span>
            </p>
          ) : null}
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <p className="text-body-sm font-semibold text-fg">Where they post</p>
          {accounts.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No connected accounts.</p>
          ) : (
            <ul className="grid gap-1.5">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 text-caption text-fg-muted">
                  <PlatformGlyph platform={a.platform} size={22} />
                  <span className="min-w-0 truncate font-medium text-fg">@{a.handle}</span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatCompact(a.followers)} · {formatPct(a.engagement_rate, 1)} engaged · {formatPct(a.us_audience_ratio, 0)} US
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
