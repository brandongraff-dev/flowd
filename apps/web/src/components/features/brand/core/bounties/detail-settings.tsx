"use client";

import { useState } from "react";
import { CalendarClock, CirclePause, Megaphone, OctagonX, Play, Plus } from "lucide-react";
import { useBrandWallet } from "@/lib/data";
import type { BountyDetail } from "@/lib/data/selectors";
import { cardProcessing, formatMoney, mulRate } from "@/lib/engine";
import { formatDate } from "@/lib/format";
import { actions } from "@/lib/store";
import { FEATURED_PIN_WEEK_CENTS } from "@/lib/store/core/bounties";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { parseDollars } from "../dollars";
import { Panel } from "../common";

const DAY_MS = 86_400_000;

/**
 * Settings: pause or resume, extend the end date, top up the pool, pin the bounty to the top of the feed, end it, or cancel it. Each control says when
 * it does not apply and why (a button that cannot work is disabled with its reason, never silent), and anything that moves money shows the exact
 * amount before it runs.
 */
export function SettingsTab({ detail, onFund }: { detail: BountyDetail; onFund: () => void }) {
  const { bounty } = detail;
  const open = ["scheduled", "live", "paused", "filled"].includes(bounty.status);
  const canEnd = ["live", "paused", "filled"].includes(bounty.status);
  const canCancel = bounty.status === "draft" || bounty.status === "awaiting_funding" || (open && detail.submissions.every((s) => s.status !== "approved" && s.status !== "posted"));

  return (
    <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
      <StatusPanel detail={detail} onFund={onFund} />
      <ExtendPanel detail={detail} enabled={["scheduled", "live", "paused", "filled", "ended"].includes(bounty.status)} />
      <TopUpPanel detail={detail} enabled={open} />
      <FeaturePanel detail={detail} enabled={["scheduled", "live", "filled"].includes(bounty.status)} />
      <ClosePanel detail={detail} canEnd={canEnd} canCancel={canCancel} />
    </div>
  );
}

function StatusPanel({ detail, onFund }: { detail: BountyDetail; onFund: () => void }) {
  const { bounty } = detail;
  const [busy, setBusy] = useState(false);
  const run = async (kind: "pause" | "resume"): Promise<void> => {
    setBusy(true);
    const result = kind === "pause" ? await actions.pauseBounty({ bounty_id: bounty.id }) : await actions.resumeBounty({ bounty_id: bounty.id });
    setBusy(false);
    if (result.ok) notify.success(kind === "pause" ? "Bounty paused" : "Bounty resumed", { description: kind === "pause" ? "No new submissions. Videos in review are still decided and paid." : "Creators can submit again." });
    else notify.error(result.error.message, { description: result.error.hint });
  };
  return (
    <Panel title="Status" description="Pause stops new submissions. Videos already in review are still decided and paid.">
      {bounty.status === "awaiting_funding" ? (
        <>
          <p className="text-body-sm text-fg-muted">This bounty is waiting for escrow. Creators cannot see it until the whole pool and fee are in.</p>
          <Button variant="primary" onClick={onFund} className="justify-self-start">
            Fund to go live
          </Button>
        </>
      ) : bounty.status === "paused" ? (
        <Button variant="primary" loading={busy} leadingIcon={<Play aria-hidden="true" />} onClick={() => run("resume")} className="justify-self-start">
          Resume bounty
        </Button>
      ) : bounty.status === "live" || bounty.status === "filled" ? (
        <Button variant="secondary" loading={busy} leadingIcon={<CirclePause aria-hidden="true" />} onClick={() => run("pause")} className="justify-self-start">
          Pause bounty
        </Button>
      ) : (
        <p className="text-body-sm text-fg-muted">This bounty is {bounty.status.replace(/_/g, " ")}, so there is nothing to pause or resume.</p>
      )}
    </Panel>
  );
}

function ExtendPanel({ detail, enabled }: { detail: BountyDetail; enabled: boolean }) {
  const { bounty } = detail;
  const [date, setDate] = useState(() => new Date(Date.parse(bounty.ends_at) + 7 * DAY_MS).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const current = bounty.ends_at.slice(0, 10);
  const error = date <= current ? `Pick a date after ${formatDate(bounty.ends_at, "medium")}.` : undefined;
  const save = async (): Promise<void> => {
    if (error) return;
    setBusy(true);
    const result = await actions.extendBounty({ bounty_id: bounty.id, ends_at: `${date}T23:59:00Z` });
    setBusy(false);
    if (result.ok) notify.success("End date moved", { description: `It now ends ${formatDate(result.data.bounty.ends_at, "medium")}.` });
    else notify.error(result.error.message, { description: result.error.hint });
  };
  return (
    <Panel title="Extend the end date" description={`Ends ${formatDate(bounty.ends_at, "medium")}. An ended bounty that is extended reopens.`}>
      <Field label="New end date" error={enabled ? error : undefined}>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={!enabled} min={current} />
      </Field>
      <Button variant="secondary" leadingIcon={<CalendarClock aria-hidden="true" />} loading={busy} disabled={!enabled || Boolean(error)} onClick={save} className="justify-self-start">
        Extend the end date
      </Button>
      {!enabled ? <p className="text-caption text-fg-subtle">A {bounty.status.replace(/_/g, " ")} bounty cannot be extended.</p> : null}
    </Panel>
  );
}

function TopUpPanel({ detail, enabled }: { detail: BountyDetail; enabled: boolean }) {
  const { bounty } = detail;
  const wallet = useBrandWallet();
  const [text, setText] = useState("500");
  const [card, setCard] = useState(true);
  const [busy, setBusy] = useState(false);
  const cents = parseDollars(text);
  const valid = cents !== null && cents >= 1000;
  const added = valid ? cents : 0;
  // The store's own sum: the extra pool plus the change in the fee reserve at the bounty's take rate.
  const feeDelta = valid ? mulRate(bounty.budget_cents + added, bounty.take_rate) - bounty.fee_reserve_cents : 0;
  const needed = added + feeDelta;
  const available = wallet.wallet.available_cents;
  const short = Math.max(0, needed - available);
  const error = text.trim() === "" ? undefined : cents === null ? "Enter an amount in dollars." : cents < 1000 ? "The smallest top-up to a bounty is $10." : undefined;
  const run = async (): Promise<void> => {
    if (!valid || cents === null) return;
    setBusy(true);
    const result = await actions.topUpBounty({ bounty_id: bounty.id, amount_cents: cents, top_up_from_card: card && short > 0 });
    setBusy(false);
    if (result.ok) notify.success(`Added ${formatMoney(cents, { cents: "auto" })} to the pool`, { description: `${formatMoney(result.data.added_cents)} moved into escrow, including the fee reserve.` });
    else notify.error(result.error.message, { description: result.error.hint });
  };
  return (
    <Panel title="Top up the pool" description="More budget means more videos fit. The fee reserve moves into escrow with it.">
      <Field label="Add to the pool" error={enabled ? error : undefined}>
        <Input value={text} onChange={(event) => setText(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" disabled={!enabled} />
      </Field>
      <dl className="grid gap-1.5 rounded-[20px] bg-surface-field p-4 text-body-sm shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Added to the pool</dt>
          <dd className="font-semibold text-fg tabular-nums">{formatMoney(added)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Fee reserve, {Math.round(bounty.take_rate * 100)}%</dt>
          <dd className="font-semibold text-fg tabular-nums">{formatMoney(feeDelta)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-divider pt-1.5">
          <dt className="text-fg">From your wallet</dt>
          <dd className="font-semibold text-fg tabular-nums">{formatMoney(needed)}</dd>
        </div>
        <p className="pt-1 text-caption text-fg-subtle">Wallet {formatMoney(available)}. {short > 0 ? `Short by ${formatMoney(short)}.` : "It covers this."}</p>
      </dl>
      {short > 0 ? (
        <Checkbox
          checked={card}
          onCheckedChange={(next) => setCard(next === true)}
          label={`Add ${formatMoney(short)} by card`}
          description={`Charged ${formatMoney(short + cardProcessing(short))} with processing at cost, then topped up in one step.`}
          disabled={!enabled}
        />
      ) : null}
      <Button variant="primary" leadingIcon={<Plus aria-hidden="true" />} loading={busy} disabled={!enabled || !valid || (short > 0 && !card)} onClick={run} className="justify-self-start">
        Add {valid ? formatMoney(added, { cents: "auto" }) : "to the pool"}
      </Button>
      {!enabled ? <p className="text-caption text-fg-subtle">Only a scheduled, live, paused or full bounty can take more budget.</p> : null}
    </Panel>
  );
}

function FeaturePanel({ detail, enabled }: { detail: BountyDetail; enabled: boolean }) {
  const { bounty } = detail;
  const wallet = useBrandWallet();
  const [weeks, setWeeks] = useState("1");
  const [busy, setBusy] = useState(false);
  const fee = FEATURED_PIN_WEEK_CENTS * Number(weeks);
  const covers = wallet.wallet.available_cents >= fee;
  const run = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.featureBounty({ bounty_id: bounty.id, weeks: Number(weeks) });
    setBusy(false);
    if (result.ok) notify.success("Pinned to the top of the feed", { description: `${formatMoney(result.data.fee_cents)} from the wallet. Pinned until ${formatDate(result.data.bounty.featured_until, "medium")}.` });
    else notify.error(result.error.message, { description: result.error.hint });
  };
  return (
    <Panel title="Pin to the top of the feed" description={`${formatMoney(FEATURED_PIN_WEEK_CENTS)} a week from the wallet. It labels the bounty Featured, and it still has to be funded.`}>
      {bounty.featured && bounty.featured_until ? <p className="text-body-sm text-fg">Pinned until {formatDate(bounty.featured_until, "medium")}.</p> : null}
      <SegmentedControl
        aria-label="How long to pin"
        value={weeks}
        onValueChange={setWeeks}
        options={[
          { value: "1", label: "1 week" },
          { value: "2", label: "2 weeks" },
          { value: "4", label: "4 weeks" },
        ]}
      />
      <Button variant="secondary" leadingIcon={<Megaphone aria-hidden="true" />} loading={busy} disabled={!enabled || !covers} onClick={run} className="justify-self-start">
        Pin for {formatMoney(fee, { cents: "auto" })}
      </Button>
      {!enabled ? <p className="text-caption text-fg-subtle">Only an open bounty can be pinned.</p> : !covers ? <p className="text-caption text-fg-subtle">The wallet has {formatMoney(wallet.wallet.available_cents)}. Add funds to pin.</p> : null}
    </Panel>
  );
}

function ClosePanel({ detail, canEnd, canCancel }: { detail: BountyDetail; canEnd: boolean; canCancel: boolean }) {
  const { bounty } = detail;
  const [endOpen, setEndOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const unspent = bounty.remaining_cents;

  return (
    <Panel title="End or cancel" description="Both are final. Money that was not spent returns to your wallet.">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <p className="text-body-sm font-semibold text-fg">End the bounty now</p>
          <p className="text-caption text-fg-muted">No new submissions. Videos already in review are still decided, and posted videos are paid when they clear. The bounty settles when every window has closed.</p>
          <Button variant="danger" leadingIcon={<OctagonX aria-hidden="true" />} disabled={!canEnd} onClick={() => setEndOpen(true)} className="justify-self-start">
            End bounty
          </Button>
          {!canEnd ? <p className="text-caption text-fg-subtle">Only a live, paused or full bounty can be ended.</p> : null}
        </div>
        <div className="grid gap-2 border-t border-divider pt-4">
          <p className="text-body-sm font-semibold text-fg">Cancel the bounty</p>
          <p className="text-caption text-fg-muted">
            {bounty.status === "draft" || bounty.status === "awaiting_funding"
              ? "Nothing has been escrowed, so nothing moves."
              : `Releases pending submissions and returns ${formatMoney(unspent, { cents: "auto" })} of unspent escrow to your wallet. Not possible once a video is approved.`}
          </p>
          <Button variant="destructive" disabled={!canCancel} onClick={() => setCancelOpen(true)} className="justify-self-start">
            Cancel bounty
          </Button>
          {!canCancel ? <p className="text-caption text-fg-subtle">A bounty with approved videos cannot be cancelled. End it instead.</p> : null}
        </div>
      </div>

      <ConfirmDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title="End this bounty now?"
        description="Creators can no longer submit. Videos in review are still decided and paid. This cannot be undone."
        confirmLabel="End bounty"
        tone="danger"
        onConfirm={async () => {
          const result = await actions.endBounty({ bounty_id: bounty.id });
          if (result.ok) notify.success("Bounty ended", { description: "It settles when every post window has closed." });
          else {
            notify.error(result.error.message, { description: result.error.hint });
            throw new Error(result.error.code);
          }
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this bounty?"
        description={bounty.status === "draft" || bounty.status === "awaiting_funding" ? "The draft closes. Nothing was escrowed." : `Pending submissions are released and ${formatMoney(unspent, { cents: "auto" })} returns to your wallet.`}
        confirmLabel="Cancel bounty"
        tone="danger"
        onConfirm={async () => {
          const result = await actions.cancelBounty({ bounty_id: bounty.id, ...(reason.trim() ? { reason: reason.trim() } : {}) });
          if (result.ok) notify.success("Bounty cancelled", { description: result.data.refunded_cents > 0 ? `${formatMoney(result.data.refunded_cents, { cents: "auto" })} returned to your wallet.` : "Nothing was escrowed." });
          else {
            notify.error(result.error.message, { description: result.error.hint });
            throw new Error(result.error.code);
          }
        }}
      >
        <Field label="Reason" optional hint="Creators with a pending submission see it.">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={200} />
        </Field>
      </ConfirmDialog>
    </Panel>
  );
}

