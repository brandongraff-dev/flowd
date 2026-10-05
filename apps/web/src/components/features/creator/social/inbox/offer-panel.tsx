"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock, HandCoins, MessageSquareReply, X } from "lucide-react";
import { ArtAvatar } from "@/components/brand";
import { Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Money, Textarea, notify } from "@/components/ui";
import { OFFER_KIND_META, OFFER_STATUS_META } from "@/lib/contract/types";
import type { OfferView } from "@/lib/data/selectors";
import { CONSTANTS } from "@/lib/engine";
import { formatCountdown, formatDate, formatMoney, formatPct, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { MoneyInput } from "../shared/money-input";
import { useRun } from "../shared/run-action";
import { RightsLines } from "../shared/rights-lines";

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
      <dt className="text-body-sm text-fg-muted">{label}</dt>
      <dd className="grid gap-0.5 sm:justify-items-end">
        <span className="text-body-sm font-semibold text-fg tabular-nums">{children}</span>
        {note ? <span className="text-caption text-fg-subtle">{note}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The offer, with its Pay Math and Rights Card inline, so nobody has to leave the conversation to decide. You see what you would be
 * paid, how it compares to your ask, what you are licensing and for how long, and whose move it is. Accepting, countering and
 * declining are real actions; a refusal says why in plain words.
 */
export function OfferPanel({ offer }: { offer: OfferView }) {
  const { busy, run } = useRun();
  const [accepting, setAccepting] = useState(false);
  const [countering, setCountering] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [counterCents, setCounterCents] = useState(Math.max(2_500, offer.ask_cents ?? offer.amount_cents));
  const [counterNote, setCounterNote] = useState("");
  const [reason, setReason] = useState("");

  const invite = offer.kind === "invite";
  const status = OFFER_STATUS_META[offer.status];
  const videos = Math.max(1, offer.deliverables.videos_per_creator);
  const renewal = Math.round(offer.amount_cents * offer.rights.card.renewal_pct_per_30d);
  const askNote = offer.vs_ask
    ? offer.vs_ask.delta_cents === 0
      ? "Exactly your ask"
      : offer.vs_ask.delta_cents < 0
        ? `${formatMoney(Math.abs(offer.vs_ask.delta_cents))} under your ask (${formatPct(offer.vs_ask.ratio, 0)} of it)`
        : `${formatMoney(offer.vs_ask.delta_cents)} over your ask`
    : undefined;

  const accept = async (): Promise<void> => {
    const data = await run("accept", () => actions.acceptOffer({ offer_id: offer.id }));
    if (!data) throw new Error("accept_failed");
    notify.success(invite ? "You joined the bounty" : `You accepted ${formatMoney(offer.amount_cents)}`, {
      description: invite ? "Open the brief and make your take." : "The brand's money is in escrow. Make the video and submit it before the turnaround ends.",
    });
  };

  const counter = async (): Promise<void> => {
    const data = await run("counter", () => actions.counterOffer({ offer_id: offer.id, amount_cents: counterCents, ...(counterNote.trim() ? { message: counterNote } : {}) }));
    if (!data) return;
    notify.success(`Countered at ${formatMoney(counterCents)}`, { description: `The brand has ${CONSTANTS.windows.offer_expiry_days} days to answer. ${data.offer.rounds >= CONSTANTS.windows.max_counter_rounds ? "That was the last counter." : `${CONSTANTS.windows.max_counter_rounds - data.offer.rounds} left.`}` });
    setCountering(false);
    setCounterNote("");
  };

  const decline = async (): Promise<void> => {
    const data = await run("decline", () => actions.declineOffer({ offer_id: offer.id, ...(reason.trim() ? { reason } : {}) }));
    if (!data) return;
    notify.success("Offer declined", { description: "The brand is told, and can offer again later." });
    setDeclining(false);
    setReason("");
  };

  return (
    <section aria-labelledby={`offer-${offer.id}`} className="grid gap-5 rounded-2xl bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ArtAvatar art={offer.brand.logo} name={offer.brand.name} shape="square" size={44} decorative />
          <div className="grid min-w-0 gap-0.5">
            <h3 id={`offer-${offer.id}`} className="truncate font-display text-title-sm text-fg">
              {offer.title}
            </h3>
            <p className="text-caption text-fg-subtle">
              {OFFER_KIND_META[offer.kind].label} from {offer.brand.name} for {offer.app.name}
            </p>
          </div>
        </div>
        <Badge tone={status.tone} size="lg">
          {offer.my_turn ? "Waiting on you" : status.label}
        </Badge>
      </header>

      {invite ? (
        <p className="text-body-sm text-fg-muted">
          This is an invite to an open bounty. It pays that bounty&rsquo;s own rates, so there is nothing to negotiate.{" "}
          {offer.bounty ? (
            <Link href={`/creator/bounties/${offer.bounty.id}`} className="font-semibold text-accent underline underline-offset-4">
              Read the bounty
            </Link>
          ) : null}
        </p>
      ) : (
        <dl className="grid gap-3">
          <Row label={`Offer for ${pluralise(videos, "video")}`} note={videos > 1 ? `${formatMoney(Math.round(offer.amount_cents / videos))} each` : undefined}>
            <Money cents={offer.amount_cents} size="md" icon={false} />
          </Row>
          {offer.ask_cents ? (
            <Row label="Your ask" note={askNote}>
              {formatMoney(offer.ask_cents)}
            </Row>
          ) : null}
          <Row label="You receive" note="The brand pays the platform fee on top, never you.">
            <Money cents={offer.amount_cents} size="md" state="cleared" icon={false} />
          </Row>
          <Row label="Brand pays in total" note={`Includes the ${formatPct(offer.take_rate, 0)} platform fee`}>
            {formatMoney(offer.all_in.total_cents)}
          </Row>
          <Row label="Money lands" note="Held in escrow when you accept. Cleared after approval and the 72-hour window, then paid Friday 18:00 UTC.">
            Escrowed first
          </Row>
          <Row label="Turnaround">{offer.turnaround_days} days</Row>
        </dl>
      )}

      <div className="grid gap-2">
        <h4 className="text-body-sm font-semibold text-fg">What you would be licensing</h4>
        <RightsLines lines={offer.rights.lines} summary={offer.rights.summary} />
        {!invite && offer.rights.card.paid_ads_days > 0 ? <p className="text-caption text-fg-subtle">Extending paid-ad use costs the brand {formatMoney(renewal)} per extra 30 days, paid to you.</p> : null}
      </div>

      {offer.open ? (
        <footer className="grid gap-3 border-t border-divider pt-4">
          <p className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
            <Clock aria-hidden="true" className="size-4" />
            {offer.expires_in_hours > 0 ? `Expires in ${formatCountdown(offer.expires_in_hours * 3_600_000)} (${formatDate(offer.expires_at, "short")})` : "Expired"}
            {!invite ? ` · ${offer.rounds_left} counter ${offer.rounds_left === 1 ? "round" : "rounds"} left` : ""}
          </p>
          {offer.my_turn ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="mint" leadingIcon={<Check />} onClick={() => setAccepting(true)}>
                {invite ? "Join this bounty" : `Accept ${formatMoney(offer.amount_cents, { cents: "never" })}`}
              </Button>
              {!invite && offer.rounds_left > 0 ? (
                <Button variant="secondary" leadingIcon={<HandCoins />} onClick={() => setCountering(true)}>
                  Counter
                </Button>
              ) : null}
              <Button variant="ghost" leadingIcon={<X />} onClick={() => setDeclining(true)}>
                Decline
              </Button>
            </div>
          ) : (
            <p className="text-body-sm text-fg-muted">It is {offer.brand.name}&rsquo;s move. You will be told the moment they answer.</p>
          )}
        </footer>
      ) : null}

      <ConfirmDialog
        open={accepting}
        onOpenChange={setAccepting}
        title={invite ? "Join this bounty?" : `Accept ${formatMoney(offer.amount_cents)}?`}
        description={invite ? "You can open the brief and submit a take right away." : `${offer.brand.name}'s money moves into escrow now. You deliver ${pluralise(videos, "video")} within ${offer.turnaround_days} days and the licence above applies.`}
        confirmLabel={invite ? "Join bounty" : "Accept offer"}
        onConfirm={accept}
      />

      <Dialog open={countering} onOpenChange={setCountering}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Counter {offer.brand.name}&rsquo;s offer</DialogTitle>
            <DialogDescription>Name the price you would say yes to. They have {CONSTANTS.windows.offer_expiry_days} days to answer, and you have {offer.rounds_left} {offer.rounds_left === 1 ? "counter" : "counters"} left.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-5">
            <MoneyInput label="Your price" value={counterCents} onChange={setCounterCents} min={2_500} hint={offer.suggested ? `The market range for your views is ${formatMoney(offer.suggested.low_cents, { cents: "never" })} to ${formatMoney(offer.suggested.high_cents, { cents: "never" })}.` : undefined} />
            <Field label="A note" optional hint="Why this price. Keep it in flowd so the Rights Card and escrow protect you.">
              <Textarea value={counterNote} onChange={(event) => setCounterNote(event.target.value)} rows={3} maxLength={400} showCount />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCountering(false)}>
              Cancel
            </Button>
            <Button variant="primary" leadingIcon={<MessageSquareReply />} loading={busy === "counter"} onClick={() => void counter()}>
              Send counter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Decline this offer?</DialogTitle>
            <DialogDescription>Saying no is fine. A reason helps the brand ask better next time, but it is optional.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason" optional>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={300} placeholder="The usage terms are longer than I can do." />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Keep it open
            </Button>
            <Button variant="danger" loading={busy === "decline"} onClick={() => void decline()}>
              Decline offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

