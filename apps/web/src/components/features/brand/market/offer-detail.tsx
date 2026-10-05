"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Lock, MessageSquare, Send, ShieldAlert, Undo2, X } from "lucide-react";
import { ArtAvatar, DomainStatusPill, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, ConfirmDialog, Field, Input, Textarea, buttonVariants, notify } from "@/components/ui";
import { Money } from "@/components/ui/money";
import { OFFER_STATUS_META, SCAM_REASON_META, type OfferMessage } from "@/lib/contract/types";
import { mulRate, parseMoney } from "@/lib/engine";
import { useBrandWallet, useThread } from "@/lib/data";
import type { OfferView } from "@/lib/data/selectors/offers";
import { formatDate, formatDateTime, formatMoney, formatPct, formatRelative } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { hoursLabel } from "./fmt";
import { RightsCardList } from "./rights-card-list";
import { settle } from "./report";

const KIND_LABEL = { direct: "Direct offer", invite: "Invite to a bounty", rebuy: "Re-buy" } as const;

const EVENT_COPY: Partial<Record<OfferMessage["type"], string>> = {
  accept: "accepted",
  decline: "declined",
  withdraw: "withdrew the offer",
};

function authorName(offer: OfferView, message: OfferMessage): string {
  if (message.author_role === "system") return "flowd";
  if (message.author_role === "creator") return `@${offer.creator.handle}`;
  return message.author_role === "brand" ? offer.brand.name : "flowd";
}

function Thread({ offer }: { offer: OfferView }) {
  return (
    <ol className="grid gap-3.5" aria-label="Conversation">
      {offer.thread.map((message) => {
        const name = authorName(offer, message);
        const event = EVENT_COPY[message.type];
        if (event) {
          return (
            <li key={message.id} className="flex items-center justify-center gap-2 py-1 text-caption text-fg-subtle">
              <span className="h-px w-8 bg-divider" aria-hidden="true" />
              <span>
                <span className="font-medium text-fg-muted">{name}</span> {event}
                {message.body ? <span className="text-fg-muted">: {message.body}</span> : null} · {formatDate(message.at, "short")}
              </span>
              <span className="h-px w-8 bg-divider" aria-hidden="true" />
            </li>
          );
        }
        const mine = message.author_role === "brand";
        const priced = (message.type === "offer" || message.type === "counter") && message.amount_cents !== undefined && message.amount_cents > 0;
        return (
          <li key={message.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
            {message.author_role === "creator" ? <ArtAvatar art={offer.creator.avatar} name={offer.creator.display_name} size={28} decorative className="mt-0.5" /> : <span className="size-7 shrink-0" aria-hidden="true" />}
            <div className={cn("grid max-w-[34rem] min-w-0 gap-1.5", mine && "justify-items-end")}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-caption text-fg-subtle">
                <span className="font-semibold text-fg-muted">{name}</span>
                <span>{message.type === "offer" ? "opened with" : message.type === "counter" ? "countered" : "wrote"}</span>
                <time dateTime={message.at}>{formatDateTime(message.at)}</time>
              </p>
              <div className={cn("grid gap-2 rounded-2xl px-4 py-3 text-body-sm", mine ? "rounded-tr-md bg-accent-soft text-fg" : "rounded-tl-md bg-surface-field text-fg")}>
                {priced ? <p className="font-display text-figure-md text-fg tabular-nums">{formatMoney(message.amount_cents ?? 0)}</p> : null}
                {message.body ? <p className="whitespace-pre-line">{message.body}</p> : null}
                {message.rights_days !== undefined && message.type === "offer" ? <p className="text-caption text-fg-muted">{message.rights_days > 0 ? `${message.rights_days} days of paid-ad usage` : "Organic posting only"}</p> : null}
              </div>
              {message.warning_code ? (
                <Callout tone="sun" icon={<ShieldAlert />} title="Scam Shield flagged this message" role="status" className="text-left">
                  {SCAM_REASON_META[message.warning_code].meaning ?? SCAM_REASON_META[message.warning_code].label}. flowd never asks anyone to pay to join or to move the chat out of the app.
                </Callout>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The negotiation of one offer: price against the ask, the rights, the whole conversation, and the next move. */
export function OfferDetail({ offer, onBack, onReoffer }: { offer: OfferView; onBack: () => void; onReoffer: (offer: OfferView) => void }) {
  const wallet = useBrandWallet();
  const thread = useThread(offer.thread_id);
  const [confirm, setConfirm] = useState<"accept" | "decline" | "withdraw" | null>(null);
  const [countering, setCountering] = useState(false);
  const [counterText, setCounterText] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterBusy, setCounterBusy] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [message, setMessage] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
  const [short, setShort] = useState<number | null>(null);

  const total = offer.all_in.total_cents;
  const fee = offer.all_in.fee_cents;
  const counterCents = parseMoney(counterText);
  const counterError = counterText.trim() !== "" && (counterCents === null || counterCents < 2500) ? "Enter $25 or more, like 240 or 240.50." : undefined;
  const lastCreatorPrice = [...offer.thread].reverse().find((entry) => entry.author_role === "creator" && entry.amount_cents)?.amount_cents;
  const meetMiddle = offer.ask_cents && offer.original_amount_cents ? Math.round((offer.ask_cents + offer.amount_cents) / 2 / 100) * 100 : undefined;
  const status = offer.my_turn ? { label: "Your move", tone: "ember" as const } : offer.open ? { label: "Waiting on them", tone: "info" as const } : OFFER_STATUS_META[offer.status];
  const expires = offer.open ? `Expires in ${hoursLabel(offer.expires_in_hours).replace("about ", "")}` : offer.closed_at ? `Closed ${formatDate(offer.closed_at, "medium")}` : "Closed";
  const canWrite = offer.status !== "declined" && offer.status !== "expired" && offer.status !== "withdrawn";
  const rateLimited = thread ? !thread.can_send : false;
  const requiredNow = total;
  const walletShort = Math.max(0, requiredNow - wallet.wallet.available_cents);

  const accept = async (): Promise<void> => {
    setShort(null);
    const result = await settle(actions.acceptOffer({ offer_id: offer.id }), offer.kind === "invite" ? "Invite accepted" : { title: "Offer accepted", description: `${formatMoney(total)} is held in escrow. @${offer.creator.handle} has ${offer.turnaround_days} days to submit.` });
    if (!result.ok) {
      if (result.error.code === "insufficient_funds") setShort(walletShort);
      throw new Error(result.error.message);
    }
  };

  const counter = async (): Promise<void> => {
    if (counterCents === null || counterCents < 2500) return;
    setCounterBusy(true);
    const result = await settle(actions.counterOffer({ offer_id: offer.id, amount_cents: counterCents, ...(counterNote.trim() ? { message: counterNote.trim() } : {}) }), `Countered at ${formatMoney(counterCents, { cents: "never" })}`);
    setCounterBusy(false);
    if (result.ok) {
      setCountering(false);
      setCounterText("");
      setCounterNote("");
    }
  };

  const send = async (): Promise<void> => {
    if (!message.trim()) return;
    setMessageBusy(true);
    const result = await settle(actions.sendOfferMessage({ offer_id: offer.id, body: message.trim() }));
    setMessageBusy(false);
    if (result.ok) {
      setMessage("");
      if (result.data.warning) notify.warning("Scam Shield flagged your message", { description: "Offers stay in flowd. Asking to pay, or to move off the app, is how scams start." });
    }
  };

  return (
    <GlassCard padding="none" className="grid min-w-0 content-start overflow-hidden" aria-label={`Offer: ${offer.title}`}>
      <header className="grid gap-4 border-b border-divider p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <Button variant="plain" size="sm" leadingIcon={<ArrowLeft />} onClick={onBack}>
            All offers
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <ArtAvatar art={offer.creator.avatar} name={offer.creator.display_name} size={52} decorative />
            <div className="grid min-w-0 gap-0.5">
              <h2 className="truncate font-display text-title-md text-fg">{offer.title}</h2>
              <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-fg-muted">
                <Link href={`/brand/creators/${offer.creator.handle}`} className="rounded-sm font-semibold text-fg hover:underline">
                  @{offer.creator.handle}
                </Link>
                <TierBadge tier={offer.creator.tier} size={20} decorative />
                <span aria-hidden="true">·</span>
                <span>{offer.app.name}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" size="lg">
              {KIND_LABEL[offer.kind]}
            </Badge>
            <DomainStatusPill meta={status} value={offer.my_turn ? "in_review" : offer.status} />
          </div>
        </div>
        <p className="flex items-center gap-2 text-caption text-fg-subtle">
          <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          {expires}
          {offer.open ? <span>· {offer.rounds_left} of 3 counters left</span> : null}
        </p>
      </header>

      <div className="grid gap-6 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-1.5 rounded-2xl bg-surface-field p-4">
            <p className="text-caption font-medium text-fg-muted">{offer.kind === "invite" ? "Pay" : offer.status === "accepted" || offer.status === "completed" ? "Agreed price" : "Current price"}</p>
            {offer.kind === "invite" ? (
              <>
                <p className="font-display text-figure-md text-fg">The bounty&apos;s rates</p>
                {offer.bounty ? (
                  <Link href={`/brand/bounties/${offer.bounty.id}`} className="text-caption text-accent hover:underline">
                    {offer.bounty.title}
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <Money cents={offer.amount_cents} size="xl" decimals="auto" splitCents={false} />
                {offer.vs_ask ? (
                  <p className="text-caption text-fg-muted">
                    {offer.vs_ask.delta_cents === 0 ? "At their ask of " : offer.vs_ask.delta_cents < 0 ? `${formatPct(1 - offer.vs_ask.ratio, 0)} below their ask of ` : `${formatPct(offer.vs_ask.ratio - 1, 0)} above their ask of `}
                    <span className="font-semibold text-fg tabular-nums">{formatMoney(offer.ask_cents ?? 0, { cents: "never" })}</span>
                  </p>
                ) : null}
                {offer.suggested ? (
                  <p className="text-caption text-fg-subtle">
                    Market band {formatMoney(offer.suggested.low_cents, { cents: "never" })} to {formatMoney(offer.suggested.high_cents, { cents: "never" })} per video
                  </p>
                ) : null}
              </>
            )}
          </div>

          <dl className="grid content-start gap-2 rounded-2xl bg-surface-field p-4 text-body-sm">
            {offer.kind === "invite" ? (
              <p className="text-caption text-fg-muted">An invite adds no cost of its own. Pay follows the bounty&apos;s CPM and CPA rates, from its funded pool.</p>
            ) : (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Creator price</dt>
                  <dd className="font-medium text-fg tabular-nums">{formatMoney(offer.all_in.amount_cents)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">flowd fee ({formatPct(offer.take_rate, 0)})</dt>
                  <dd className="font-medium text-fg tabular-nums">{formatMoney(fee)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
                  <dt className="flex items-center gap-1.5 font-semibold text-fg">
                    <Lock aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={2} />
                    {offer.escrow_funded ? "In escrow" : "Held on accept"}
                  </dt>
                  <dd className="font-semibold text-fg tabular-nums">{formatMoney(total)}</dd>
                </div>
                <p className="text-micro text-fg-subtle">Creators are never charged. Pay is released only for approved work.</p>
              </>
            )}
          </dl>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <RightsCardList lines={offer.rights.lines} summary={offer.rights.summary} />
          <div className="grid content-start gap-3">
            <h3 className="text-body-sm font-semibold text-fg">Deliverables</h3>
            <dl className="grid gap-px overflow-hidden rounded-xl bg-divider">
              {[
                ["Videos", `${offer.deliverables.videos_per_creator} ${offer.deliverables.videos_per_creator === 1 ? "video" : "videos"}`],
                ["Length", `${offer.deliverables.min_duration_s} to ${offer.deliverables.max_duration_s} seconds, ${offer.deliverables.aspect}`],
                ["Platforms", offer.deliverables.platforms.map((p) => ({ tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" })[p]).join(", ")],
                ["Turnaround", `${offer.turnaround_days} days from acceptance`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 bg-surface-field px-3.5 py-2.5 text-body-sm">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="text-right font-medium text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <section aria-label="Conversation" className="grid gap-4">
          <h3 className="flex items-center gap-2 text-body-sm font-semibold text-fg">
            <MessageSquare aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
            Conversation
            <span className="text-caption font-normal text-fg-subtle">Stays in flowd</span>
          </h3>
          <Thread offer={offer} />
        </section>

        {offer.open && offer.my_turn ? (
          <div className="grid gap-4 rounded-2xl bg-accent-soft p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body-sm font-semibold text-fg">{offer.kind === "invite" ? "@" + offer.creator.handle + " is waiting on your answer" : `Your move on ${formatMoney(offer.amount_cents, { cents: "never" })}`}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" leadingIcon={<Check />} onClick={() => setConfirm("accept")}>
                  {offer.kind === "invite" ? "Accept" : `Accept ${formatMoney(offer.amount_cents, { cents: "never" })}`}
                </Button>
                {offer.kind !== "invite" ? (
                  <Button variant="secondary" disabled={offer.rounds_left === 0} onClick={() => setCountering((open) => !open)} aria-expanded={countering}>
                    Counter
                  </Button>
                ) : null}
                <Button variant="ghost" leadingIcon={<X />} onClick={() => setConfirm("decline")}>
                  Decline
                </Button>
              </div>
            </div>
            {offer.rounds_left === 0 && offer.kind !== "invite" ? <p className="text-caption text-fg-muted">Three counters are used. Accept this price or decline it.</p> : null}
            {countering ? (
              <form
                className="grid gap-4 border-t border-rim pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void counter();
                }}
              >
                <Field label="Your counter, total for the deliverables" error={counterError} hint={`${offer.rounds_left} of 3 counters left. They have seven days to answer.`}>
                  <Input inputMode="decimal" leading="$" value={counterText} onChange={(event) => setCounterText(event.target.value)} placeholder={String(Math.round(offer.amount_cents / 100))} autoComplete="off" autoFocus />
                </Field>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
                  {offer.ask_cents ? (
                    <Button type="button" size="xs" variant="secondary" onClick={() => setCounterText(String(Math.round(offer.ask_cents! / 100)))}>
                      Their ask {formatMoney(offer.ask_cents, { cents: "never" })}
                    </Button>
                  ) : null}
                  {lastCreatorPrice && lastCreatorPrice !== offer.ask_cents ? (
                    <Button type="button" size="xs" variant="secondary" onClick={() => setCounterText(String(Math.round(lastCreatorPrice / 100)))}>
                      Their last {formatMoney(lastCreatorPrice, { cents: "never" })}
                    </Button>
                  ) : null}
                  {meetMiddle ? (
                    <Button type="button" size="xs" variant="secondary" onClick={() => setCounterText(String(Math.round(meetMiddle / 100)))}>
                      Halfway {formatMoney(meetMiddle, { cents: "never" })}
                    </Button>
                  ) : null}
                </div>
                <Field label="Add a note" optional>
                  <Textarea rows={2} value={counterNote} onChange={(event) => setCounterNote(event.target.value)} maxLength={300} />
                </Field>
                {counterCents !== null && counterCents >= 2500 ? <p className="text-caption text-fg-muted">All in with the {formatPct(offer.take_rate, 0)} fee: {formatMoney(counterCents + mulRate(counterCents, offer.take_rate))}.</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setCountering(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={counterBusy} disabled={counterCents === null || counterCents < 2500}>
                    {counterCents !== null && counterCents >= 2500 ? `Counter at ${formatMoney(counterCents, { cents: "never" })}` : "Send counter"}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}

        {offer.open && !offer.my_turn ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-field p-4">
            <p className="text-body-sm text-fg-muted">
              Waiting on <span className="font-semibold text-fg">@{offer.creator.handle}</span>. They have {hoursLabel(offer.expires_in_hours).replace("about ", "about ")} to answer.
            </p>
            <Button variant="ghost" leadingIcon={<Undo2 />} onClick={() => setConfirm("withdraw")}>
              Withdraw offer
            </Button>
          </div>
        ) : null}

        {offer.status === "accepted" || offer.status === "completed" ? (
          <Callout
            tone="mint"
            title={offer.status === "completed" ? "Completed" : "Accepted"}
            action={
              offer.bounty_id ? (
                <Link href={`/brand/bounties/${offer.bounty_id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Open the bounty
                </Link>
              ) : undefined
            }
          >
            {offer.kind === "invite" ? "The creator joined your bounty. Their video lands in your review queue." : `${formatMoney(total)} is in escrow for this private bounty. Review the video when it arrives, within your promise of ${offer.brand.review_sla_hours} hours.`}
          </Callout>
        ) : null}

        {offer.status === "declined" || offer.status === "expired" || offer.status === "withdrawn" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-field p-4">
            <p className="text-body-sm text-fg-muted">
              This offer is {offer.status}. {offer.status === "expired" ? "Nobody answered in seven days." : "You can send a fresh one."}
            </p>
            <Button variant="secondary" leadingIcon={<Send />} disabled={!offer.creator.open_to_offers} onClick={() => onReoffer(offer)}>
              Send a new offer
            </Button>
          </div>
        ) : null}

        {canWrite ? (
          <form
            className="grid gap-2.5 border-t border-divider pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Field label="Message" hint={rateLimited ? `You can write again after @${offer.creator.handle} replies. This keeps first messages from becoming spam.` : "Keep it in flowd. Scam Shield flags requests to pay, or to move to another app."} labelHidden>
              <Textarea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} disabled={rateLimited} placeholder={rateLimited ? "Waiting for a reply" : `Write to @${offer.creator.handle}`} maxLength={500} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" leadingIcon={<Send />} loading={messageBusy} disabled={!message.trim() || rateLimited}>
                Send message
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirm === "accept"}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title={offer.kind === "invite" ? "Accept this invite?" : `Accept ${formatMoney(offer.amount_cents, { cents: "never" })}?`}
        description={offer.kind === "invite" ? "The creator joins your bounty and can submit videos." : `We hold ${formatMoney(total)} in escrow from your wallet and open a private bounty for @${offer.creator.handle}. It is released only for approved work.`}
        confirmLabel={offer.kind === "invite" ? "Accept invite" : `Hold ${formatMoney(total, { cents: "never" })} and accept`}
        onConfirm={accept}
      >
        {offer.kind !== "invite" ? (
          <dl className="grid gap-2 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Wallet available</dt>
              <dd className="font-medium text-fg tabular-nums">{formatMoney(wallet.wallet.available_cents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Held in escrow</dt>
              <dd className="font-medium text-fg tabular-nums">{formatMoney(total)}</dd>
            </div>
            {walletShort > 0 || short !== null ? (
              <Callout tone="sun" title={`Add ${formatMoney(Math.max(walletShort, short ?? 0))} first`} action={<Link href="/brand/wallet" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add funds</Link>}>
                Your wallet does not cover the escrow yet.
              </Callout>
            ) : null}
          </dl>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "decline"}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title="Decline this offer?"
        description="The creator is told, and the offer closes. Nothing is charged."
        confirmLabel="Decline offer"
        tone="danger"
        onConfirm={async () => {
          const result = await settle(actions.declineOffer({ offer_id: offer.id, ...(declineReason.trim() ? { reason: declineReason.trim() } : {}) }), "Offer declined");
          if (!result.ok) throw new Error(result.error.message);
          setDeclineReason("");
        }}
      >
        <Field label="Reason" optional hint="A short, kind reason helps them with the next brand.">
          <Textarea rows={2} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={240} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "withdraw"}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title="Withdraw this offer?"
        description={`@${offer.creator.handle} will see that you withdrew it. Nothing is charged.`}
        confirmLabel="Withdraw offer"
        tone="danger"
        onConfirm={async () => {
          const result = await settle(actions.withdrawOffer({ offer_id: offer.id }), "Offer withdrawn");
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </GlassCard>
  );
}

/** A quiet time-ago line for list rows. */
export function updatedAgo(offer: OfferView): string {
  return formatRelative(offer.updated_at);
}
