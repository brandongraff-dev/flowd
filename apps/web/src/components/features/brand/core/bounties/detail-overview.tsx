"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import type { BountyDetail } from "@/lib/data/selectors";
import { formatMoney, rightsLines } from "@/lib/engine";
import { formatCpm, formatDate, formatDateTime, formatHours, formatMoneyRange, formatPct } from "@/lib/format";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Fact, Panel } from "../common";
import { FillMeter } from "../fill-meter";

/**
 * Overview: where the pool is (pool, reserved, settled, left, with the clock), the price and what a creator is likely to earn at the median, the
 * brief, the review clock, the Rights Card and Brief Lint. Every money figure is read from the bounty and agrees with the ledger; the identity
 * funded = reserved + settled + open + returned is shown and checked, never assumed.
 */
export function OverviewTab({ detail, onFund }: { detail: BountyDetail; onFund: () => void }) {
  const { bounty, money } = detail;
  const total = money.escrow_funded_cents;
  const startMs = Date.parse(bounty.starts_at);
  const endMs = Date.parse(bounty.ends_at);
  const spanMs = endMs - startMs;
  // Share of the bounty's time that has passed, from the demo clock via `hours_left` (no wall clock in render).
  const timeRatio = bounty.funded && spanMs > 0 ? Math.min(1, Math.max(0, (spanMs - bounty.hours_left * 3_600_000) / spanMs)) : undefined;
  const ledgerAgrees = money.ledger.funded_cents === money.escrow_funded_cents && money.ledger.balance_cents === money.reserved_cents + money.remaining_cents && money.ledger.spent_cents === money.spent_cents;
  const lines = rightsLines(bounty.rights_card);
  const lintIssues = bounty.brief_lint.issues;
  const pm = bounty.pay_math;
  const needs = bounty.status === "awaiting_funding";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start">
      <div className="grid gap-5">
        {needs ? (
          <Callout
            tone="ember"
            title={`Needs ${formatMoney(bounty.budget_cents + bounty.fee_reserve_cents - bounty.matched_cents, { cents: "auto" })} in escrow to go live`}
            action={
              <Button variant="primary" size="sm" onClick={onFund}>
                Fund to go live
              </Button>
            }
          >
            Nothing goes live until the whole pool and its fee are escrowed. Creators do not see this bounty yet.
          </Callout>
        ) : null}

        <Panel title="Pool" description={bounty.funded ? "Pool plus fee reserve, held in escrow" : "Not funded yet"}>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-4">
            <Fact label="Pool">
              <Money cents={money.pool_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Reserved in review">
              <Money cents={money.reserved_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Settled">
              <Money cents={money.spent_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Open to new videos">
              <Money cents={money.remaining_cents} size="inherit" decimals="auto" />
            </Fact>
          </div>
          {bounty.funded || total > 0 ? (
            <>
              <FillMeter settled={money.spent_cents} reserved={money.reserved_cents} total={total} {...(timeRatio !== undefined ? { time: timeRatio } : {})} label="Pool committed" size="md" />
              <p className="text-caption text-fg-muted">
                {Math.round(bounty.fill_ratio * 100)}% of the pool is committed. {bounty.spots_left > 0 ? `${bounty.spots_left} more videos fit at the per-video cap.` : "No more videos fit at the per-video cap."}
              </p>
            </>
          ) : null}
          <dl className="grid gap-2 rounded-[20px] bg-surface-field p-4 text-body-sm shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-fg-muted">
              <dt>Funded</dt>
              <dd className="font-semibold text-fg tabular-nums">{formatMoney(money.escrow_funded_cents)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-caption text-fg-subtle">
              <dt>= reserved + settled + open + returned</dt>
              <dd className="tabular-nums">
                {formatMoney(money.reserved_cents)} + {formatMoney(money.spent_cents)} + {formatMoney(money.remaining_cents)} + {formatMoney(money.refunded_cents)}
              </dd>
            </div>
            {money.matched_cents > 0 ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-caption text-fg-subtle">
                <dt>Includes flowd&apos;s match</dt>
                <dd className="tabular-nums">{formatMoney(money.matched_cents)}</dd>
              </div>
            ) : null}
            <div className="flex items-center gap-2 border-t border-divider pt-2 text-caption">
              {money.identity_ok && ledgerAgrees ? <CircleCheck aria-hidden="true" className="size-4 text-mint" strokeWidth={2} /> : <TriangleAlert aria-hidden="true" className="size-4 text-rose" strokeWidth={2} />}
              <span className="text-fg-muted">{money.identity_ok && ledgerAgrees ? "Balances to the cent and agrees with the ledger." : "The pool does not agree with the ledger. No money has moved; see the ledger."}</span>
            </div>
          </dl>
        </Panel>

        <Panel title="Price and pay" description="What creators are paid and what you pay all in">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {bounty.cpm_cents > 0 ? <Fact label="Views pay">{formatCpm(bounty.cpm_cents, "bare")} per 1,000</Fact> : null}
            {bounty.cpa_install_cents > 0 ? <Fact label="Per install">{formatMoney(bounty.cpa_install_cents)}</Fact> : null}
            {bounty.cpa_trial_cents > 0 ? <Fact label="Per trial">{formatMoney(bounty.cpa_trial_cents)}</Fact> : null}
            {bounty.cpa_paid_cents > 0 ? <Fact label="Per paid subscription">{formatMoney(bounty.cpa_paid_cents)}</Fact> : null}
            {bounty.flat_fee_cents > 0 ? <Fact label="Flat fee per video">{formatMoney(bounty.flat_fee_cents)}</Fact> : null}
            <Fact label="Cap per video">{formatMoney(bounty.per_video_cap_cents, { cents: "auto" })}</Fact>
            <Fact label="Platform fee">{bounty.take_rate === 0 ? "Waived (first bounty)" : formatPct(bounty.take_rate, 0)}</Fact>
            {bounty.all_in_cpm_cents > 0 ? <Fact label="All-in cost per 1,000 views">{formatCpm(bounty.all_in_cpm_cents, "bare")}</Fact> : null}
          </dl>
          <div className="grid gap-1.5 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="text-body-sm text-fg">
              A typical video earns its creator about <span className="font-semibold tabular-nums">{formatMoney(pm.median_cents, { cents: "auto" })}</span> (median).
              <span className="text-fg-muted"> Half of videos land between {formatMoneyRange(pm.p25_cents, pm.p75_cents)}.</span>
            </p>
            <p className="text-caption text-fg-subtle">{pm.basis} Checklist estimate; results vary.</p>
          </div>
        </Panel>

        <Panel title="Brief" description="What creators see on the bounty page">
          <p className="text-body-sm text-fg">{bounty.brief.summary}</p>
          <ol className="grid gap-1.5" aria-label="Beats">
            {bounty.brief.beats.map((beat, index) => (
              <li key={`${beat.beat}-${index}`} className="flex items-baseline gap-2.5 text-body-sm">
                <span aria-hidden="true" className="w-5 shrink-0 text-right font-display text-caption font-bold text-fg-subtle tabular-nums">
                  {index + 1}
                </span>
                <span className="text-fg">
                  {beat.label}
                  {beat.required ? <span className="ml-2 text-caption text-fg-subtle">Required</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <Accordion type="multiple" variant="plain">
            <AccordionItem value="dos">
              <AccordionTrigger description={`${bounty.brief.dos.length} do, ${bounty.brief.donts.length} do not`}>Do and do not</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ul className="grid gap-1.5 text-body-sm text-fg-muted">
                    {bounty.brief.dos.map((line) => (
                      <li key={line}>Do: {line}</li>
                    ))}
                  </ul>
                  <ul className="grid gap-1.5 text-body-sm text-fg-muted">
                    {bounty.brief.donts.map((line) => (
                      <li key={line}>Do not: {line}</li>
                    ))}
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="say">
              <AccordionTrigger description="Call to action, offer line and disclosure">Say and tag</AccordionTrigger>
              <AccordionContent>
                <dl className="grid gap-2 text-body-sm">
                  <div>
                    <dt className="text-caption text-fg-subtle">Call to action</dt>
                    <dd className="text-fg">{bounty.brief.cta}</dd>
                  </div>
                  {bounty.brief.offer_line ? (
                    <div>
                      <dt className="text-caption text-fg-subtle">Offer line</dt>
                      <dd className="text-fg">{bounty.brief.offer_line}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-caption text-fg-subtle">Disclosure, added to every post</dt>
                    <dd className="text-fg">{bounty.brief.disclosure_text}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-fg-subtle">Hashtags</dt>
                    <dd className="text-fg">{bounty.brief.hashtags.join(" ")}</dd>
                  </div>
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Panel>
      </div>

      <div className="grid gap-5">
        <Panel title="Review" description={`You decide within ${bounty.review_sla_hours} hours of a submission`}>
          <dl className="grid grid-cols-3 gap-4">
            <Fact label="In review">{detail.review.in_review}</Fact>
            <Fact label="Oldest">{detail.review.oldest_hours === null ? "None" : formatHours(detail.review.oldest_hours)}</Fact>
            <Fact label="Past the promise">{detail.review.breached}</Fact>
          </dl>
          {bounty.owner ? <p className="text-caption text-fg-muted">Owner of the queue: {bounty.owner.name}.</p> : null}
          <div>
            <Link href={`/brand/review?bounty=${bounty.id}`} className={buttonVariants({ variant: detail.review.in_review > 0 ? "primary" : "secondary", size: "sm" })}>
              Open the review queue
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Panel>

        <Panel title="Rights Card" description="The licence every creator accepts when they submit">
          <dl className="grid gap-2">
            {lines.map((line) => (
              <div key={line.id} className="flex items-baseline justify-between gap-4 text-body-sm">
                <dt className="text-fg-muted">{line.label}</dt>
                <dd className="text-right font-medium text-fg">{line.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-fg-subtle">{bounty.rights_card.summary}</p>
        </Panel>

        <Panel title="Brief Lint" actions={<Badge tone={bounty.brief_lint.passed ? "mint" : "rose"} size="md" icon={bounty.brief_lint.passed ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}>{bounty.brief_lint.passed ? "Passed" : "Blocked"}</Badge>}>
          {lintIssues.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No findings. Nothing in the brief, pay or rights trips a rule.</p>
          ) : (
            <ul className="grid gap-2">
              {lintIssues.map((issue) => (
                <li key={`${issue.code}-${issue.field ?? ""}`} className="flex items-start gap-2 text-body-sm">
                  <Badge tone={issue.severity === "blocker" ? "rose" : issue.severity === "warning" ? "sun" : "neutral"} size="sm">
                    {issue.severity}
                  </Badge>
                  <span className="text-fg-muted">{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Dates">
          <dl className="grid gap-2 text-body-sm">
            <DateRow label="Starts" value={formatDateTime(bounty.starts_at)} />
            <DateRow label="Ends" value={formatDateTime(bounty.ends_at)} />
            {bounty.published_at ? <DateRow label="Published" value={formatDate(bounty.published_at, "medium")} /> : null}
            {bounty.funded_at ? <DateRow label="Funded" value={formatDate(bounty.funded_at, "medium")} /> : null}
            {bounty.filled_at ? <DateRow label="Filled" value={formatDate(bounty.filled_at, "medium")} /> : null}
            {bounty.settled_at ? <DateRow label="Settled" value={formatDate(bounty.settled_at, "medium")} /> : null}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg tabular-nums">{value}</dd>
    </div>
  );
}
