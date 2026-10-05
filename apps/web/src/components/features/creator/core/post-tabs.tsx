"use client";

import { useState } from "react";
import { Check, Clock, ExternalLink, Info, Scale, TriangleAlert } from "lucide-react";
import { CONVERSION_KIND_META, EXCLUSION_CAUSE_META, HOLD_REASON_META, SNAPSHOT_FLAG_META, SNAPSHOT_SOURCE_META, TRAFFIC_SOURCE_META, type DisputeKind, type ViewSnapshot } from "@/lib/contract/types";
import type { ConversionRow, PostView } from "@/lib/data/selectors";
import { formatClockEta, formatCompact, formatDate, formatDateTime, formatInt, formatMoney, formatPct } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { actions } from "@/lib/store";
import { Thumb } from "@/components/brand";
import { AreaChart, LineChart } from "@/components/charts";
import { GlassCard } from "@/components/glass";
import { DataTable, Timeline, type DataColumn, type TimelineItem } from "@/components/shell";
import { Badge, Button, Callout, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Progress, RadioGroup, RadioGroupItem, Select, StatusPill, Textarea, notify } from "@/components/ui";
import { Amount } from "./amount";
import { PostStatusPill, WindowBar, moneyStateOf, retentionLine } from "./post-parts";
import type { PostTabContext } from "./post-tab-extensions";

const utc = (iso: string, now: number): string => `${formatClockEta(iso, { now })} UTC`;

// ── Overview ───────────────────────────────────────────────────────────────────────────────────

function FunnelRow({ label, tracked, estimated, first }: { label: string; tracked: number; estimated: number; first?: boolean }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <div className="grid gap-1">
        <p className="text-body-sm font-semibold text-fg">{label}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-caption text-fg-muted">
          <Badge tone="mint" size="sm">
            Tracked
          </Badge>
          {first ? "Verified by flowd" : "From your link and code"}
          {estimated > 0 ? (
            <>
              <Badge tone="info" size="sm">
                Estimated
              </Badge>
              <span className="tabular-nums">+{formatInt(estimated)} modelled or reported, never paid</span>
            </>
          ) : null}
        </p>
      </div>
      <p className="font-display text-figure-lg text-fg tabular-nums">{formatInt(tracked)}</p>
    </li>
  );
}

export function OverviewTab({ post }: PostTabContext) {
  const now = useNow();
  const f = post.funnel;
  const retention = post.retention.curve.map((value, i) => ({ x: i * 10, y: Math.round(value * 1000) / 10 }));
  const capUsed = post.cap.used_cents;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Thumb art={post.thumb} hook={post.tags.hook_words} aspect="9:16" app={{ name: post.app.name, art: post.app.icon }} durationSec={Math.round(post.duration_ms / 1000)} label={`${post.tags.hook_words}, ${post.app.name}`} className="mx-auto max-w-64" />
        <p className="flex items-center justify-center gap-1.5 text-center text-caption text-fg-muted">
          <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-accent hover:underline">
            Open on {post.platform === "tiktok" ? "TikTok" : post.platform === "instagram" ? "Instagram" : "YouTube"}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>

      <div className="grid min-w-0 gap-5">
        {post.status === "removed" ? (
          <Callout tone="sun" icon={<TriangleAlert />} title="Removed before the window closed">
            A post you take down before its 72-hour window closes earns nothing. Views already counted are not paid.
          </Callout>
        ) : null}
        {post.status === "clawed_back" ? (
          <Callout tone="rose" title="Part of this post was clawed back">
            Views proven invalid were reversed. Legitimate views delivered before that are still paid. The View Ledger tab names the cause.
          </Callout>
        ) : null}
        {post.status === "held" && post.hold_reason ? (
          <Callout tone="sun" title={`On hold: ${HOLD_REASON_META[post.hold_reason].label}`}>
            {HOLD_REASON_META[post.hold_reason].meaning} A person decides within 24 hours. Your other money keeps clearing.
          </Callout>
        ) : null}

        <GlassCard padding="lg" className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-title-md text-fg">How it is doing</h2>
            <PostStatusPill status={post.status} />
          </div>
          <WindowBar post={post} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-0.5">
              <p className="text-caption text-fg-muted">Verified views</p>
              <p className="font-display text-figure-lg text-fg tabular-nums">{formatCompact(post.window.is_open ? post.views : post.window_views)}</p>
              <p className="text-micro text-fg-subtle">{post.window.is_open ? "so far, inside the window" : "final for pay"}</p>
            </div>
            <div className="grid gap-0.5">
              <p className="text-caption text-fg-muted">Earned on this post</p>
              <Amount cents={post.earnings.total_cents} size="lg" state={moneyStateOf(post.status)} decimals="auto" />
              <p className="text-micro text-fg-subtle">{post.money?.eta_label ?? "No money waiting"}</p>
            </div>
            <div className="grid gap-0.5">
              <p className="text-caption text-fg-muted">Per-video cap</p>
              <p className="font-display text-figure-lg text-fg tabular-nums">{formatMoney(post.cap.cap_cents, { cents: "never" })}</p>
              <p className="text-micro text-fg-subtle">{post.earnings.capped ? "Reached: pay stopped here" : `${formatMoney(post.cap.remaining_cents, { cents: "never" })} of room left`}</p>
            </div>
          </div>
          <Progress value={Math.round(post.cap.ratio * 100)} tone={post.cap.ratio >= 1 ? "ember" : "mint"} size="sm" aria-label="Per-video cap used" valueText={`${formatMoney(capUsed, { cents: "auto" })} of ${formatMoney(post.cap.cap_cents, { cents: "never" })} used`} label="Cap used" trailing={`${formatMoney(capUsed, { cents: "auto" })} of ${formatMoney(post.cap.cap_cents, { cents: "never" })}`} />
        </GlassCard>

        <GlassCard padding="lg" className="grid gap-2">
          <div className="grid gap-1">
            <h2 className="font-display text-title-md text-fg">Views to paid</h2>
            <p className="text-body-sm text-fg-muted">Only tracked installs, trials and paid subscriptions (from your link and code) can earn a bonus. Estimated ones are shown apart and never paid.</p>
          </div>
          <ul className="grid divide-y divide-divider">
            <FunnelRow label="Views" tracked={f.views} estimated={0} first />
            <FunnelRow label="Visits to your link" tracked={f.clicks} estimated={0} />
            <FunnelRow label="Installs" tracked={f.installs} estimated={f.est_installs} />
            <FunnelRow label="Trials started" tracked={f.trials} estimated={f.est_trials} />
            <FunnelRow label="Paid subscriptions" tracked={f.paid} estimated={f.est_paid} />
          </ul>
          {post.trial_rate === null ? <p className="text-caption text-fg-subtle">Trial rate shows after 20 installs. Before that a percentage would mislead.</p> : <p className="text-caption text-fg-muted">{formatPct(post.trial_rate, 1)} of tracked installs started a trial.</p>}
        </GlassCard>

        <AreaChart
          title="Who stays"
          subtitle="Share of viewers still watching, by point in the video"
          summary={retentionLine(post)}
          data={retention}
          seriesLabel="Still watching"
          xFormat={(x) => `${x}%`}
          xTooltipFormat={(x) => `${x}% through the video`}
          yFormat={(v) => `${Math.round(v)}%`}
          yDomain={[0, 100]}
          height={240}
        />

        <GlassCard className="grid gap-2">
          <h2 className="fd-eyebrow text-fg-subtle">The caption you posted</h2>
          <p className="text-body-sm text-fg">{post.caption}</p>
          <p className="text-caption text-fg-subtle">Posted {utc(post.posted_at, now)} on {post.app.name}'s bounty “{post.bounty.title}”. The disclosure was added automatically.</p>
        </GlassCard>
      </div>
    </div>
  );
}

// ── View Ledger ────────────────────────────────────────────────────────────────────────────────

const REASONS: readonly { value: string; label: string; kind: DisputeKind; hint: string }[] = [
  { value: "low", label: "Verified views look too low", kind: "view_count", hint: "The platform shows more real views than flowd counted." },
  { value: "excluded", label: "Views were excluded that were real", kind: "flagged_botting", hint: "A bot or geo flag hit views you believe were genuine." },
  { value: "missing", label: "Installs or trials are missing", kind: "wrong_attribution", hint: "People used your link or code and it was not counted." },
  { value: "other", label: "Something else", kind: "other", hint: "Describe it below." },
];

function DisputeDialog({ post, snapshots }: { post: PostView; snapshots: readonly ViewSnapshot[] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("low");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState(snapshots[0]?.taken_at ?? "");
  const [to, setTo] = useState(snapshots[snapshots.length - 1]?.taken_at ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const pick = REASONS.find((r) => r.value === reason) ?? REASONS[0];

  const submit = async (): Promise<void> => {
    if (!pick) return;
    setBusy(true);
    setError(undefined);
    const result = await actions.disputePost({ post_id: post.id, kind: pick.kind, reason: pick.label, note, ...(from ? { range_from: from } : {}), ...(to ? { range_to: to } : {}) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    notify.success("Dispute opened", { description: "A person replies within 24 hours. Only this post's money is held; everything else keeps clearing." });
  };

  const times = snapshots.map((s) => ({ value: s.taken_at, label: formatDateTime(s.taken_at, { now: post.posted_at }) }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" leadingIcon={<Scale />} onClick={() => setOpen(true)}>
        Dispute these numbers
      </Button>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Dispute the View Ledger</DialogTitle>
          <DialogDescription>The ledger is attached for you. A dispute never blocks money that is not in dispute. It shows as held with the reason "dispute open".</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="What looks wrong">
            <RadioGroup value={reason} onValueChange={setReason} aria-label="What looks wrong">
              {REASONS.map((r) => (
                <RadioGroupItem key={r.value} value={r.value} label={r.label} description={r.hint} />
              ))}
            </RadioGroup>
          </Field>
          {times.length > 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From snapshot">
                <Select value={from} onValueChange={setFrom} options={times} />
              </Field>
              <Field label="To snapshot">
                <Select value={to} onValueChange={setTo} options={times} />
              </Field>
            </div>
          ) : null}
          <Field label="Tell us what you see" error={error} hint="Point at a time and a number. Keep it about the data.">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={600} showCount placeholder="At 24 h the platform shows 41,200 views and the ledger verified 36,900." />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Open dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LedgerTab({ post, ledger }: PostTabContext) {
  const now = useNow();
  const d = post.dispute;
  const snapshotColumns: DataColumn<ViewSnapshot>[] = [
    { id: "time", header: "Time", card: "title", cell: (s) => <span className="font-medium text-fg">{formatDateTime(s.taken_at, { now })} UTC</span> },
    { id: "reported", header: "Reported", align: "end", cell: (s) => <span className="text-fg-muted">{formatInt(s.views_reported)}</span> },
    { id: "verified", header: "Verified", align: "end", card: "value", cell: (s) => <span className="font-semibold text-fg">{formatInt(s.views_verified)}</span> },
    { id: "excluded", header: "Excluded", align: "end", cell: (s) => <span className={s.views_invalid > 0 ? "font-medium text-ember" : "text-fg-subtle"}>{formatInt(s.views_invalid)}</span> },
    {
      id: "source",
      header: "Source",
      hideBelow: "md",
      cell: (s) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Badge tone={SNAPSHOT_SOURCE_META[s.source].tone} size="sm">
            {SNAPSHOT_SOURCE_META[s.source].label}
          </Badge>
          {s.flags.filter((flag) => flag !== "reconciled").map((flag) => (
            <Badge key={flag} tone={SNAPSHOT_FLAG_META[flag].tone} size="sm">
              {SNAPSHOT_FLAG_META[flag].label}
            </Badge>
          ))}
        </span>
      ),
    },
  ];
  const conversionColumns: DataColumn<ConversionRow>[] = [
    { id: "kind", header: "Event", card: "title", cell: (c) => <span className="font-medium text-fg">{CONVERSION_KIND_META[c.kind].label}</span> },
    { id: "qty", header: "Count", align: "end", card: "value", cell: (c) => <span className="font-semibold text-fg">{c.quantity}</span> },
    {
      id: "source",
      header: "Attributed by",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={c.chip.kind === "tracked" ? "mint" : "info"} size="sm">
            {c.chip.kind === "tracked" ? "Tracked" : "Estimated"}
          </Badge>
          <span className="text-fg-muted">{c.chip.label}</span>
        </span>
      ),
    },
    { id: "pays", header: "Pays?", hideBelow: "md", cell: (c) => <span className={c.chip.pays ? "text-mint" : "text-fg-subtle"}>{c.chip.pays ? "Yes" : "No, estimated"}</span> },
    { id: "date", header: "Date", hideBelow: "md", cell: (c) => <span className="text-fg-muted">{formatDate(c.occurred_on, "short", { now })}</span> },
  ];

  const series = ledger.series;
  const excludedShare = ledger.views.reported > 0 ? ledger.views.excluded / ledger.views.reported : 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Reported by the platform", value: ledger.views.reported, hint: "what the app shows you" },
          { label: "Verified by flowd", value: ledger.views.verified, hint: "what pay is based on" },
          { label: "Excluded", value: ledger.views.excluded, hint: ledger.views.excluded > 0 ? `${formatPct(excludedShare, 1)} of reported views` : "nothing was excluded" },
        ].map((tile) => (
          <GlassCard key={tile.label} className="grid gap-1" padding="md">
            <p className="text-caption font-medium text-fg-muted">{tile.label}</p>
            <p className="font-display text-figure-lg text-fg tabular-nums">{formatInt(tile.value)}</p>
            <p className="text-caption text-fg-subtle">{tile.hint}</p>
          </GlassCard>
        ))}
      </div>

      {ledger.bot_flag_cause ? (
        <Callout tone="sun" icon={<TriangleAlert />} title="Why some views were excluded">
          {ledger.bot_flag_cause}
        </Callout>
      ) : null}
      {ledger.exclusions.length > 0 ? (
        <ul className="grid gap-2">
          {ledger.exclusions.map((x) => (
            <li key={x.cause} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface-field p-3.5 text-body-sm shadow-[inset_0_0_0_1px_var(--fd-rim)]">
              <Badge tone={EXCLUSION_CAUSE_META[x.cause].tone} size="md">
                {EXCLUSION_CAUSE_META[x.cause].label}
              </Badge>
              <span className="font-semibold text-fg tabular-nums">{formatInt(x.views)} views</span>
              <span className="text-fg-muted">{x.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <LineChart
        title="Views over time"
        subtitle="Reported by the platform against verified by flowd"
        summary={`${formatInt(ledger.views.reported)} views reported and ${formatInt(ledger.views.verified)} verified${ledger.views.excluded > 0 ? `, ${formatInt(ledger.views.excluded)} excluded` : ""}.`}
        series={[
          { id: "reported", label: "Reported", points: series.map((s) => ({ x: s.hours, y: s.reported })) },
          { id: "verified", label: "Verified", points: series.map((s) => ({ x: s.hours, y: s.verified })) },
        ]}
        xFormat={(x) => `${x} h`}
        xTooltipFormat={(x) => `${x} hours after posting`}
        yFormat={(v) => formatCompact(v)}
        yTooltipFormat={(v) => formatInt(v)}
        state={ledger.loading ? "loading" : series.length === 0 ? "empty" : "ready"}
        empty={{ title: "No snapshots yet", description: "The first snapshot is taken when the post goes live, then every 6 hours through the 72-hour window." }}
        xLabel="Hours after posting"
        height={260}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard className="grid gap-3">
          <h2 className="fd-eyebrow text-fg-subtle">Where views came from</h2>
          {ledger.sources.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No traffic split recorded yet.</p>
          ) : (
            <ul className="grid gap-3">
              {ledger.sources.map((s) => (
                <li key={s.source}>
                  <Progress value={Math.round(s.ratio * 100)} size="sm" tone={s.source === "other" ? "ember" : "accent"} aria-label={TRAFFIC_SOURCE_META[s.source].label} valueText={`${Math.round(s.ratio * 100)} percent`} label={TRAFFIC_SOURCE_META[s.source].label} trailing={`${Math.round(s.ratio * 100)}%`} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard className="grid gap-3">
          <h2 className="fd-eyebrow text-fg-subtle">Audience by country</h2>
          {ledger.geo.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No country split recorded yet.</p>
          ) : (
            <ul className="grid gap-3">
              {ledger.geo.slice(0, 5).map((g) => (
                <li key={g.country}>
                  <Progress value={Math.round(g.ratio * 100)} size="sm" tone="neutral" aria-label={g.country} valueText={`${Math.round(g.ratio * 100)} percent`} label={g.country} trailing={`${Math.round(g.ratio * 100)}%`} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <DataTable
        caption="View Ledger snapshots"
        columns={snapshotColumns}
        rows={[...ledger.snapshots].reverse()}
        getRowId={(s) => s.id}
        getRowLabel={(s) => formatDateTime(s.taken_at, { now })}
        density="compact"
        loading={ledger.loading}
        empty={{ art: "chart", title: "No snapshots yet", description: "Snapshots start when the post goes live." }}
        toolbar={<h2 className="font-display text-title-sm text-fg">Every snapshot, oldest at the bottom</h2>}
      />

      <DataTable
        caption="Conversions on this post"
        columns={conversionColumns}
        rows={ledger.conversions}
        getRowId={(c) => c.id}
        getRowLabel={(c) => `${c.quantity} ${CONVERSION_KIND_META[c.kind].label}`}
        density="compact"
        loading={ledger.loading}
        empty={{ art: "chart", title: "No conversions yet", description: "Installs, trials and paid subscriptions from your link and code appear here, labelled Tracked or Estimated." }}
        toolbar={<h2 className="font-display text-title-sm text-fg">Conversions, with how each was attributed</h2>}
      />

      <GlassCard padding="lg" className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="font-display text-title-md text-fg">Something look wrong?</h2>
          <p className="text-body-sm text-fg-muted">Open a dispute with the ledger attached. A person at flowd replies within 24 hours. Only this post's money is held while it is open.</p>
        </div>
        {d ? (
          <div className="grid gap-3 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-fg">
              <StatusPill status="disputed" label={`Dispute ${d.status.replace(/_/g, " ")}`} />
              <span className="font-normal text-fg-muted">Opened {formatDate(d.opened_at, "medium", { now })}. Reply due {utc(d.reply_due_at, now)}.</span>
            </p>
            <p className="text-caption text-fg-muted">
              <span className="font-semibold text-fg">{d.reason}.</span> {d.note}
            </p>
            {d.status === "open" || d.status === "evidence_requested" ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() =>
                  void actions.withdrawDispute({ dispute_id: d.id }).then((r) => {
                    if (r.ok) notify.message("Dispute withdrawn", { description: "The hold on this post is released." });
                    else notify.error(r.error.message, { description: r.error.hint });
                  })
                }
              >
                Withdraw the dispute
              </Button>
            ) : null}
          </div>
        ) : ledger.can_dispute ? (
          <DisputeDialog post={post} snapshots={ledger.snapshots} />
        ) : (
          <p className="text-caption text-fg-subtle">{post.status === "removed" ? "A removed post earned nothing, so there is nothing to dispute." : "You can only dispute your own posts."}</p>
        )}
      </GlassCard>
    </div>
  );
}

// ── Money ──────────────────────────────────────────────────────────────────────────────────────

export function MoneyTab({ post, ledger }: PostTabContext) {
  const now = useNow();
  const e = post.earnings;
  const timeline: TimelineItem[] = post.timeline.map((step) => ({
    id: step.id,
    title: step.label.split(". ")[0] ?? step.label,
    time: `${step.done ? "" : "planned "}${utc(step.at, now)}`,
    description: step.label.split(". ").slice(1).join(". ") || undefined,
    state: step.done ? "done" : "upcoming",
  }));
  const firstOpen = timeline.findIndex((t) => t.state !== "done");
  if (firstOpen >= 0 && timeline[firstOpen]) timeline[firstOpen] = { ...timeline[firstOpen], state: "active" };

  const parts: [string, number][] = [
    ["Views (CPM)", e.cpm_cents],
    ["Outcomes (CPA, tracked only)", e.cpa_cents],
    ["Ad commission", e.commission_cents],
    ["Flat fee", e.flat_cents],
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid gap-5">
        <GlassCard padding="lg" className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="font-display text-title-md text-fg">What this post earned</h2>
            <p className="text-body-sm text-fg-muted">{e.capped ? "The per-video cap stopped pay at this total." : "Pay is views first, then outcomes, up to the per-video cap."}</p>
          </div>
          <dl className="grid divide-y divide-divider rounded-2xl bg-surface-field px-4 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            {parts
              .filter(([, cents]) => cents !== 0)
              .map(([label, cents]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-body-sm text-fg-muted">{label}</dt>
                  <dd>
                    <Amount cents={cents} size="sm" state="neutral" icon={false} />
                  </dd>
                </div>
              ))}
            <div className="flex items-baseline justify-between gap-3 py-3">
              <dt className="text-body-sm font-semibold text-fg">Total on this post</dt>
              <dd>
                <Amount cents={e.total_cents} size="md" state={moneyStateOf(post.status)} decimals="always" />
              </dd>
            </div>
          </dl>
        </GlassCard>

        <GlassCard padding="lg" className="grid gap-4">
          <h2 className="font-display text-title-md text-fg">Each part, with its date</h2>
          {post.clock_rows.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No earnings rows yet. The first appears when views start counting.</p>
          ) : (
            <ul className="grid divide-y divide-divider">
              {post.clock_rows.map((row) => (
                <li key={row.id} className="grid gap-1 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="flex items-center gap-2 text-body-sm font-semibold text-fg">
                      <StatusPill status={row.state === "accruing" ? "pending" : row.state === "reversed" ? "clawed_back" : row.state} size="md" />
                      {row.source === "cpm" ? "Views" : row.source === "flat_fee" ? "Flat fee" : row.source.replace(/_/g, " ")}
                    </p>
                    <Amount cents={row.amount_cents} size="sm" state={row.state === "cleared" ? "cleared" : row.state === "paid" ? "paid" : row.state === "reversed" ? "negative" : "pending"} icon={false} />
                  </div>
                  <p className="text-caption text-fg-muted">{row.reason_text}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <div className="grid gap-5">
        <GlassCard padding="lg" className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="font-display text-title-md text-fg">The settlement path</h2>
            <p className="text-body-sm text-fg-muted">The same five steps for every post. Times are UTC.</p>
          </div>
          <Timeline items={timeline} />
        </GlassCard>
        {ledger.earnings.length > 0 ? (
          <GlassCard padding="lg" className="grid gap-3">
            <h2 className="font-display text-title-md text-fg">On the ledger</h2>
            <ul className="grid divide-y divide-divider">
              {ledger.earnings.map((ev, i) => (
                <li key={`${ev.at}-${ev.kind}-${i}`} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                  <p className="flex items-center gap-2 text-body-sm text-fg">
                    {ev.kind === "clawback" ? <TriangleAlert aria-hidden="true" className="size-4 text-rose" strokeWidth={2} /> : ev.kind === "settled" ? <Clock aria-hidden="true" className="size-4 text-info" strokeWidth={2} /> : <Check aria-hidden="true" className="size-4 text-mint" strokeWidth={2.5} />}
                    <span className="font-medium capitalize">{ev.kind}</span>
                    <span className="text-caption text-fg-muted">{utc(ev.at, now)}</span>
                  </p>
                  <Amount cents={ev.amount_cents} size="sm" state={ev.kind === "clawback" ? "negative" : ev.kind === "cleared" ? "cleared" : ev.kind === "paid" ? "paid" : "pending"} icon={false} />
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-2 text-caption text-fg-subtle">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              Cleared money pays out in the weekly run on Fridays at 6 PM UTC, free.
            </p>
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}

