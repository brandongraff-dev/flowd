"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, Clapperboard, Lock, Sparkles, X } from "lucide-react";
import { FORMAT_ID_META } from "@/lib/contract/types";
import { briefTldrTask } from "@/lib/ai/context";
import { useBountyForCreator, useStoreReady } from "@/lib/data";
import type { CreatorBountyView } from "@/lib/data/selectors";
import { formatCompact, formatDate, formatDaysLeft, formatList, formatMoney } from "@/lib/format";
import { useFlo } from "@/lib/hooks/use-flo";
import { useNow } from "@/lib/hooks/use-now";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppIcon, ArtSurface, Thumb } from "@/components/brand";
import { Glass, GlassCard } from "@/components/glass";
import { Badge, Button, Callout, EmptyState, Skeleton, buttonVariants, notify } from "@/components/ui";
import { BudgetLeft, DecidesIn, FundedBadge, LockedBadge, PayTypeBadge, payParts } from "./bounty-parts";
import { PayMathCard, RightsCardView, ScamShieldCues } from "./rights-pay-cards";
import { ReportDialog } from "./report-dialog";
import { ScorecardSummary } from "./scorecard";
import { usePostsByIds } from "./selectors";
import { toggleSaved } from "./bounty-card";

/** Flo's five-line TL;DR of the brief: what to make, what must show, the pay, the rights, the disclosure. Streams once; it is checklist-based and says so. */
function FloTldr({ view }: { view: CreatorBountyView }) {
  const flo = useFlo();
  const { bounty } = view;
  const run = flo.run;
  useEffect(() => {
    void run(briefTldrTask({ bounty, app: bounty.app }));
  }, [run, bounty]);

  return (
    <GlassCard tint="violet" className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-title-sm text-fg">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-violet-solid text-on-violet">
            <Sparkles className="size-4" strokeWidth={2} />
          </span>
          TL;DR by Flo
        </h2>
        <Badge tone="violet" size="md">
          Checklist-based
        </Badge>
      </div>
      {flo.status === "idle" || (flo.status === "thinking" && flo.outputs.length === 0) ? (
        <div className="grid gap-2" role="status" aria-label="Flo is reading the brief">
          <Skeleton shape="text" className="w-full" />
          <Skeleton shape="text" className="w-5/6" />
          <Skeleton shape="text" className="w-2/3" />
        </div>
      ) : flo.status === "error" ? (
        <p className="text-body-sm text-fg-muted">{flo.error} The full brief is below.</p>
      ) : (
        <ul className="grid gap-2.5" aria-live="polite" aria-busy={flo.status === "streaming"}>
          {flo.outputs.map((line, i) => {
            const colon = line.indexOf(":");
            const label = colon > 0 && colon < 32 ? line.slice(0, colon) : null;
            return (
              <li key={i} className="text-body-sm text-fg-muted">
                {label ? <span className="font-semibold text-fg">{label}: </span> : null}
                {label ? line.slice(colon + 1).trimStart() : line}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-micro text-fg-subtle">{flo.result?.label ?? "Checklist-based and can be wrong. Check it against the brief before you post."}</p>
    </GlassCard>
  );
}

function BriefSection({ view }: { view: CreatorBountyView }) {
  const { brief, deliverables, eligibility } = view.bounty;
  const examples = usePostsByIds(brief.example_post_ids);
  const requiredBeats = brief.beats.filter((b) => b.required);
  return (
    <GlassCard padding="lg" className="grid gap-7">
      <section aria-labelledby="brief-title" className="grid gap-2">
        <h2 id="brief-title" className="font-display text-title-md text-fg">
          The brief
        </h2>
        <p className="max-w-[68ch] text-body text-fg-muted">{brief.summary}</p>
      </section>

      <section aria-labelledby="must-title" className="grid gap-3">
        <h3 id="must-title" className="text-body-sm font-semibold text-fg">
          Must say and show
        </h3>
        <ul className="grid gap-2">
          {brief.talking_points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-body-sm text-fg-muted">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2.5} />
              {point}
            </li>
          ))}
        </ul>
        {requiredBeats.length > 0 ? (
          <ol className="flex flex-wrap gap-2" aria-label="Required beats, in order">
            {brief.beats.map((beat, i) => (
              <li key={beat.beat} className={cn("inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-caption font-medium", beat.required ? "bg-accent-soft text-accent" : "bg-surface-field text-fg-muted")} title={beat.hint}>
                <span className="tabular-nums">{i + 1}.</span>
                {beat.label}
                {beat.required ? <span className="sr-only"> (required)</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="do-title" className="grid content-start gap-2.5">
          <h3 id="do-title" className="text-body-sm font-semibold text-fg">
            Do
          </h3>
          <ul className="grid gap-2">
            {brief.dos.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-body-sm text-fg-muted">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={2.5} />
                {line}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="dont-title" className="grid content-start gap-2.5">
          <h3 id="dont-title" className="text-body-sm font-semibold text-fg">
            Don't
          </h3>
          <ul className="grid gap-2">
            {brief.donts.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-body-sm text-fg-muted">
                <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-rose" strokeWidth={2.5} />
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-2xl bg-divider text-caption shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:grid-cols-2">
        {[
          ["One call to action", brief.cta],
          brief.offer_line ? ["The offer, said once", brief.offer_line] : null,
          ["Disclosure, added for you", brief.disclosure_text],
          ["Hashtags and tags", formatList([...brief.hashtags, ...brief.mentions]) || "None required"],
          ["Length and shape", `${deliverables.min_duration_s} to ${deliverables.max_duration_s} seconds, ${deliverables.aspect}${deliverables.require_face ? ", face on camera" : ""}`],
          ["Who can take it", `${eligibility.min_tier ? `${eligibility.min_tier[0]?.toUpperCase()}${eligibility.min_tier.slice(1)} or higher` : "Any tier"}${eligibility.min_followers ? `, ${formatCompact(eligibility.min_followers)}+ followers` : ""}. No new or burner account needed.`],
        ]
          .filter((row): row is string[] => row !== null)
          .map(([label, value]) => (
            <div key={label} className="grid gap-0.5 bg-surface px-4 py-3">
              <dt className="text-fg-subtle">{label}</dt>
              <dd className="font-medium text-fg">{value}</dd>
            </div>
          ))}
      </dl>

      {view.formats.length > 0 ? (
        <section aria-labelledby="formats-title" className="grid gap-3">
          <h3 id="formats-title" className="text-body-sm font-semibold text-fg">
            Formats that fit, best first
          </h3>
          <ul className="flex flex-wrap gap-2">
            {view.formats.slice(0, 5).map((format) => (
              <li key={format.id}>
                <Link href={`/creator/studio?bounty=${view.bounty.id}&format=${format.id}`} className="inline-flex h-9 items-center gap-2 rounded-pill bg-surface-field px-3.5 text-body-sm font-semibold text-fg shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover" title={format.summary}>
                  {FORMAT_ID_META[format.id]?.label ?? format.name}
                  <span className="text-micro font-medium text-fg-subtle">{format.min_duration_s} to {format.max_duration_s}s</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {examples.length > 0 ? (
        <section aria-labelledby="examples-title" className="grid gap-3">
          <div className="grid gap-1">
            <h3 id="examples-title" className="text-body-sm font-semibold text-fg">
              What a winning take looks like
            </h3>
            <p className="text-caption text-fg-muted">Posts from earlier bounties that cleared. Copy the structure, not the words.</p>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {examples.slice(0, 4).map((post) => (
              <li key={post.id}>
                <Thumb art={post.thumb} hook={post.tags.hook_words} caption={`${formatCompact(post.views)} views`} durationSec={Math.round(post.duration_ms / 1000)} label={`${post.tags.hook_words}, ${formatCompact(post.views)} views`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </GlassCard>
  );
}

/** The sticky action bar. "Make it" is the one primary on the page; when it cannot work it says exactly why, in words, beside the button. */
function ActionBar({ view }: { view: CreatorBountyView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { bounty } = view;
  const latest = view.submissions[0];
  const joined = view.save?.stage === "joined" || view.save?.stage === "submitted";

  const makeIt = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.claimBounty({ bounty_id: bounty.id });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    router.push(`/creator/studio?bounty=${bounty.id}`);
  };

  return (
    <Glass layer={2} interactive={false} className="sticky bottom-24 z-(--fd-z-raised) flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-[28px] p-3 pl-5 md:bottom-5">
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate text-body-sm font-semibold text-fg">{bounty.title}</p>
        <p className="truncate text-caption text-fg-muted">{view.can_submit ? `${payParts(bounty).headline}. ${view.spots_left} ${view.spots_left === 1 ? "spot" : "spots"} left.` : view.blocked_reason}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="md" aria-pressed={view.save?.stage === "saved"} leadingIcon={view.save ? <BookmarkCheck /> : <Bookmark />} onClick={() => void toggleSaved(bounty.id, view.save !== undefined)}>
          {view.save ? "Saved" : "Save"}
        </Button>
        {latest && !view.can_submit ? (
          <Link href={`/creator/submissions/${latest.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
            View your submission
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <Button variant="primary" size="md" loading={busy} disabled={!view.can_submit} leadingIcon={view.can_submit ? <Clapperboard /> : <Lock />} onClick={() => void makeIt()}>
            {joined && view.can_submit ? "Continue in Studio" : "Make it"}
          </Button>
        )}
      </div>
    </Glass>
  );
}

/** `/creator/bounties/[id]`: the brief, the Rights Card, Pay Math, the Brand Scorecard and the Scam Shield cues, with one sticky "Make it". */
export function BountyDetail({ bountyId }: { bountyId: string }) {
  const ready = useStoreReady();
  const view = useBountyForCreator(bountyId);
  const now = useNow();

  if (!ready) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-64 w-full rounded-[28px]" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-[28px]" />
          <Skeleton className="h-96 rounded-[28px]" />
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <GlassCard>
        <EmptyState
          art="search"
          headingAs="h1"
          title="That bounty isn't here"
          description="It may have ended and been archived, or the link is wrong. The feed shows every funded bounty open to you."
          action={
            <Link href="/creator/feed" className={buttonVariants({ variant: "primary" })}>
              Back to the feed
            </Link>
          }
        />
      </GlassCard>
    );
  }

  const { bounty, match } = view;
  const pay = payParts(bounty);
  const closed = bounty.status !== "live" && bounty.status !== "filled";
  const locked = match?.locked && view.submissions.length === 0;

  return (
    <div className="grid gap-6">
      <Link href="/creator/feed" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-caption font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
        Bounty feed
      </Link>

      <header className="relative isolate overflow-hidden rounded-[28px] bg-surface text-white shadow-[inset_0_0_0_1px_var(--fd-rim),var(--fd-elevation-2)]">
        <ArtSurface art={bounty.art} aspect="16:9" className={cn("absolute inset-0 -z-10 block size-full", locked && "grayscale-[0.55]")} />
        <span aria-hidden="true" className="fd-media-scrim pointer-events-none absolute inset-0 -z-10" />
        <div className="grid gap-5 p-6 pt-24 sm:p-8 sm:pt-32">
          <div className="flex flex-wrap items-center gap-2">
            {bounty.funded && bounty.status === "live" ? <FundedBadge /> : null}
            {locked ? <LockedBadge reason={match?.lock_reasons[0]} /> : null}
            {closed ? <Badge tone="neutral" size="md">{bounty.status === "filled" ? "Full" : `Bounty ${bounty.status.replace(/_/g, " ")}`}</Badge> : null}
            {bounty.is_starter ? <Badge tone="accent" size="md">Starter</Badge> : null}
            <PayTypeBadge type={bounty.type} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-3">
              <AppIcon art={bounty.app.icon} name={bounty.app.name} size={40} decorative />
              <p className="text-body-sm font-semibold text-white/90">
                {bounty.app.name} ·{" "}
                <Link href={`/creator/brands/${bounty.brand_id}`} className="underline decoration-white/40 underline-offset-2 hover:decoration-white">
                  {bounty.brand.name}
                </Link>
              </p>
            </div>
            <h1 className="max-w-[24ch] font-display text-display-md text-balance [text-shadow:0_2px_18px_rgb(1_4_20/0.55)]">{bounty.title}</h1>
            <p className="font-display text-title-lg [text-shadow:0_2px_14px_rgb(1_4_20/0.55)]">
              {pay.headline}
              {pay.extras ? <span className="mt-0.5 block text-body font-medium text-white/90">{pay.extras}</span> : null}
            </p>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Cap per video", bounty.per_video_cap_cents > 0 ? formatMoney(bounty.per_video_cap_cents, { cents: "auto" }) : "None"],
          ["Closes", `${formatDaysLeft(bounty.ends_at, now)}`],
          ["Spots left", `${view.spots_left}`],
          ["Review", `Decision in ${bounty.review_sla_hours} h or less`],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-0.5 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <dt className="text-caption text-fg-subtle">{label}</dt>
            <dd className="font-display text-title-sm text-fg tabular-nums">{value}</dd>
            {label === "Closes" ? <dd className="text-micro text-fg-subtle">{formatDate(bounty.ends_at, "medium", { now })}</dd> : null}
            {label === "Review" ? <dd className="text-micro text-fg-subtle">{bounty.decides_in ?? "New brand, no history yet"}</dd> : null}
          </div>
        ))}
      </dl>

      {view.blocked_reason && !view.can_submit && view.submissions.length === 0 ? (
        <Callout tone="sun" icon={<Lock />} title={closed ? "This bounty is not taking videos" : "You can't take this one yet"} action={locked ? <Link href="/creator/tiers" className={buttonVariants({ variant: "secondary", size: "sm" })}>See what unlocks it</Link> : undefined}>
          {view.blocked_reason}
        </Callout>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <FloTldr view={view} />
          <BriefSection view={view} />
        </div>
        <aside className="grid min-w-0 gap-5" aria-label="Pay, rights and trust">
          <PayMathCard math={bounty.pay_math} mine={view.expected} perVideoCapCents={bounty.per_video_cap_cents} />
          <GlassCard className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="fd-eyebrow text-fg-subtle">The pool</h2>
              {bounty.funded ? <FundedBadge /> : null}
            </div>
            <BudgetLeft bounty={bounty} />
            <p className="text-caption text-fg-muted">
              When you submit, the pool reserves up to one per-video cap for you. If your video is approved you are paid even if the pool empties afterwards. The spots count is real: it is what the pool can still take.
            </p>
            <DecidesIn decides={bounty.decides_in} />
          </GlassCard>
          <RightsCardView card={view.rights.card} lines={view.rights.lines} summary={view.rights.summary} />
          <ScorecardSummary brandId={bounty.brand_id} brandName={bounty.brand.name} platformFunded={bounty.platform_funded} />
          <ScamShieldCues funded={bounty.funded} verifiedBrand={bounty.brand.verification === "verified" || bounty.platform_funded} />
          <div className="flex justify-end">
            <ReportDialog targetKind="bounty" targetId={bounty.id} targetLabel={bounty.title} />
          </div>
        </aside>
      </div>

      <ActionBar view={view} />
    </div>
  );
}
