"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, Lock, Send, ShieldCheck } from "lucide-react";
import { ArtAvatar, TierBadge } from "@/components/brand";
import {
  Button,
  Callout,
  Field,
  Input,
  SegmentedControl,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  buttonVariants,
  notify,
} from "@/components/ui";
import type { ArtSeed, RateCard, Tier } from "@/lib/contract/types";
import { mulRate, parseMoney, takeRateFor } from "@/lib/engine";
import { useApps, useBounties, useBrandWallet, useMe } from "@/lib/data";
import { actions } from "@/lib/store";
import { formatCpm, formatMoney, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The slice of a creator the composer needs. A discovery card, a profile and a list row all produce it. */
export interface OfferTarget {
  id: string;
  handle: string;
  display_name: string;
  avatar: ArtSeed;
  tier: Tier;
  open_to_offers: boolean;
  rate_card?: RateCard;
}

export type OfferKindChoice = "direct" | "invite" | "rebuy";

export interface OfferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: readonly OfferTarget[];
  initialKind?: OfferKindChoice;
  /** A re-buy: the winning post the new hooks build on. Fixes the kind to `rebuy`. */
  rebuy?: { post_id: string; title: string; app_id: string };
  /** Called with the ids of the creators who received an offer. */
  onSent?: (creatorIds: readonly string[]) => void;
}

const PAID_DAYS = [
  { value: "0", label: "Organic only, no paid ads" },
  { value: "30", label: "30 days of paid ads" },
  { value: "60", label: "60 days of paid ads" },
  { value: "90", label: "90 days of paid ads (platform default)" },
  { value: "180", label: "180 days of paid ads" },
] as const;

const TURNAROUND = [
  { value: "3", label: "3 days" },
  { value: "5", label: "5 days" },
  { value: "7", label: "7 days" },
  { value: "10", label: "10 days" },
] as const;

const VIDEOS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? "1 video" : `${n} videos` }));

/** The composer for direct offers, invites and re-buys. One creator gets a priced offer; several get an offer each at their own ask. */
export function OfferSheet({ open, onOpenChange, targets, initialKind = "direct", rebuy, onSent }: OfferSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {open ? <OfferForm key={targets.map((target) => target.id).join(",")} targets={targets} initialKind={rebuy ? "rebuy" : initialKind} rebuy={rebuy} onClose={() => onOpenChange(false)} onSent={onSent} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function OfferForm({ targets, initialKind, rebuy, onClose, onSent }: { targets: readonly OfferTarget[]; initialKind: OfferKindChoice; rebuy: OfferSheetProps["rebuy"]; onClose: () => void; onSent: OfferSheetProps["onSent"] }) {
  const me = useMe();
  const apps = useApps();
  const wallet = useBrandWallet();
  const live = useBounties({ brand: "mine", status: "live" });

  const single = targets.length === 1 ? targets[0] : undefined;
  const [kind, setKind] = useState<OfferKindChoice>(initialKind);
  const [appId, setAppId] = useState<string>(rebuy?.app_id ?? me.app?.id ?? "");
  const app = apps.find((entry) => entry.id === appId) ?? me.app;
  const [videos, setVideos] = useState("1");
  const [title, setTitle] = useState<string>(rebuy ? `Two new hooks on ${rebuy.title}` : "");
  const [amountText, setAmountText] = useState<string>("");
  const [paidDays, setPaidDays] = useState("90");
  const [turnaround, setTurnaround] = useState<string>(String(single?.rate_card?.turnaround_days ?? 5));
  const [bountyId, setBountyId] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<readonly { handle: string; message: string }[]>([]);

  const plan = me.brand?.plan ?? "free";
  const take = takeRateFor({ plan, type: "direct" });
  const n = Number(videos);
  const asks = useMemo(() => targets.map((target) => ({ target, ask: target.rate_card && target.rate_card.accepts_direct_offers ? target.rate_card.price_per_video_cents * n : null })), [targets, n]);

  const direct = kind !== "invite";
  const typed = parseMoney(amountText);
  const singleAsk = asks[0]?.ask ?? null;
  /** The price per creator: what was typed for one creator, otherwise each creator's own ask. */
  const priceFor = (ask: number | null): number | null => (single ? (amountText.trim() === "" ? ask : typed) : ask);
  const totals = asks.map(({ target, ask }) => ({ target, price: priceFor(ask) }));
  const sendable = totals.filter((entry) => (direct ? entry.price !== null && entry.price >= 2500 && entry.target.open_to_offers && entry.target.rate_card?.accepts_direct_offers : entry.target.open_to_offers));
  const subtotal = sendable.reduce((sum, entry) => sum + (direct ? (entry.price ?? 0) : 0), 0);
  const fee = sendable.reduce((sum, entry) => sum + (direct ? mulRate(entry.price ?? 0, take) : 0), 0);
  const total = subtotal + fee;
  const short = Math.max(0, total - wallet.wallet.available_cents);

  const messageError = touched && message.trim().length < 10 ? "Add a short note: what you want, and why this creator." : undefined;
  const amountError = touched && single && direct && (typed === null ? amountText.trim() !== "" : typed < 2500) ? "Enter an amount of $25 or more, like 240 or 240.50." : undefined;
  const titleError = touched && title.trim().length < 3 ? "Give the offer a short title." : undefined;
  const bountyError = touched && kind === "invite" && !bountyId ? "Pick one of your live bounties." : undefined;
  const blocked = direct ? sendable.length === 0 : kind === "invite" ? sendable.length === 0 || !bountyId : false;

  const effectiveTitle = title.trim() || (app ? (kind === "invite" ? `Invite: ${live.find((b) => b.id === bountyId)?.title ?? app.name}` : `${n === 1 ? "One video" : `${n} videos`} for ${app.name}`) : "");

  const send = async (): Promise<void> => {
    setTouched(true);
    if (!app || message.trim().length < 10 || effectiveTitle.length < 3 || blocked || amountError || bountyError) return;
    setBusy(true);
    setFailures([]);
    const sent: string[] = [];
    const failed: { handle: string; message: string }[] = [];
    for (const entry of sendable) {
      const result = await actions.sendOffer({
        creator_id: entry.target.id,
        app_id: app.id,
        title: effectiveTitle,
        amount_cents: kind === "invite" ? 0 : (entry.price ?? 0),
        kind,
        ...(kind === "invite" ? { bounty_id: bountyId } : {}),
        ...(rebuy ? { rebuy_of_post_id: rebuy.post_id } : {}),
        deliverables: { videos_per_creator: n },
        rights: { paid_ads_days: Number(paidDays) },
        turnaround_days: Number(turnaround),
        message: message.trim(),
      });
      if (result.ok) sent.push(entry.target.id);
      else failed.push({ handle: entry.target.handle, message: result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message });
    }
    setBusy(false);
    if (sent.length > 0) {
      onSent?.(sent);
      notify.success(sent.length === 1 ? "Offer sent" : `${sent.length} offers sent`, { description: "They have seven days to answer. Everything stays in flowd." });
    }
    if (failed.length === 0) onClose();
    else setFailures(failed);
  };

  const skipped = totals.filter((entry) => !sendable.includes(entry));

  return (
    <>
      <SheetHeader>
        <SheetTitle>{kind === "invite" ? "Invite to a bounty" : kind === "rebuy" ? "Re-buy new hooks" : single ? `Send @${single.handle} an offer` : `Send ${targets.length} offers`}</SheetTitle>
        <SheetDescription>
          {kind === "invite"
            ? "An invite points a creator at one of your open bounties. They are paid that bounty's rates."
            : "You agree a price in flowd. The money is held in escrow when they accept, and released only for approved work."}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="grid gap-6">
        <ul className="grid gap-2" aria-label="Recipients">
          {targets.slice(0, 5).map((target) => (
            <li key={target.id} className="flex items-center gap-3 rounded-lg bg-surface-field p-2.5 pr-3">
              <ArtAvatar art={target.avatar} name={target.display_name} size={32} decorative />
              <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-fg">@{target.handle}</span>
              <TierBadge tier={target.tier} size={20} decorative />
              {direct ? <span className="shrink-0 text-caption text-fg-subtle tabular-nums">{target.rate_card?.accepts_direct_offers ? `Asks ${formatMoney(target.rate_card.price_per_video_cents * n, { cents: "never" })}` : "No rate card"}</span> : null}
            </li>
          ))}
          {targets.length > 5 ? <li className="px-1 text-caption text-fg-subtle">and {targets.length - 5} more</li> : null}
        </ul>

        {!rebuy ? (
          <SegmentedControl
            aria-label="Offer type"
            fullWidth
            value={kind}
            onValueChange={(next) => setKind(next as OfferKindChoice)}
            options={[
              { value: "direct", label: "Direct offer" },
              { value: "invite", label: "Invite to bounty" },
            ]}
          />
        ) : (
          <Callout tone="accent" title="Re-buy at the creator's price">
            New hooks on the idea that won. You pay the creator&apos;s ask, and the Rights Card carries over.
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="App">
            <Select
              value={appId}
              onValueChange={setAppId}
              disabled={Boolean(rebuy)}
              options={apps.map((entry) => ({ value: entry.id, label: entry.name }))}
              placeholder="Choose an app"
            />
          </Field>
          {kind === "invite" ? (
            <Field label="Bounty" error={bountyError}>
              <Select
                value={bountyId}
                onValueChange={setBountyId}
                placeholder={live.length === 0 ? "No live bounties" : "Choose a live bounty"}
                options={live.map((bounty) => ({ value: bounty.id, label: bounty.title, description: `${bounty.app.name} · ${formatCpm(bounty.cpm_cents, "short")}` }))}
              />
            </Field>
          ) : (
            <Field label="Videos">
              <Select value={videos} onValueChange={setVideos} options={VIDEOS} />
            </Field>
          )}
        </div>

        <Field label="Title" error={titleError} hint="Creators see this first.">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={effectiveTitle || "One video for your app"} maxLength={80} autoComplete="off" />
        </Field>

        {direct ? (
          <div className="grid gap-4">
            {single ? (
              <Field
                label={n === 1 ? "Your price for the video" : `Your price for ${n} videos`}
                error={amountError}
                hint={
                  single.rate_card?.suggested
                    ? `Market band ${formatMoney(single.rate_card.suggested.low_cents * n, { cents: "never" })} to ${formatMoney(single.rate_card.suggested.high_cents * n, { cents: "never" })}. Their ask is ${formatMoney(singleAsk ?? 0, { cents: "never" })}.`
                    : singleAsk !== null
                      ? `Their ask is ${formatMoney(singleAsk, { cents: "never" })}.`
                      : "This creator has no rate card, so you cannot send a direct offer."
                }
              >
                <Input
                  inputMode="decimal"
                  leading="$"
                  value={amountText}
                  placeholder={singleAsk !== null ? String(Math.round(singleAsk / 100)) : "0"}
                  onChange={(event) => setAmountText(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            ) : (
              <p className="text-body-sm text-fg-muted">
                Each creator gets an offer at their own rate-card price. You can counter or accept their replies from <span className="font-medium text-fg">Offers</span>.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid-ad usage" hint="Renewals are 25% of the base price per extra 30 days.">
                <Select value={paidDays} onValueChange={setPaidDays} options={PAID_DAYS} />
              </Field>
              <Field label="Turnaround">
                <Select value={turnaround} onValueChange={setTurnaround} options={TURNAROUND} />
              </Field>
            </div>
          </div>
        ) : null}

        <Field label="Your note" error={messageError} hint="What you want, and why them. Keep it in flowd: offers that ask for payment or a move to another app are flagged by Scam Shield.">
          <Textarea
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            showCount
            placeholder="Your hook about the first-photo reveal is what we want to see on our app. Two takes, 20 seconds each."
          />
        </Field>

        {direct && sendable.length > 0 ? (
          <dl className="grid gap-2 rounded-xl bg-surface-field p-4 text-body-sm" aria-label="What this costs">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{sendable.length === 1 ? "Creator price" : `Creator prices (${sendable.length})`}</dt>
              <dd className="font-medium text-fg tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">flowd fee ({Math.round(take * 100)}%, {plan === "pro" ? "Pro" : plan === "scale" ? "Scale" : "Free"} plan)</dt>
              <dd className="font-medium text-fg tabular-nums">{formatMoney(fee)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
              <dt className="flex items-center gap-1.5 font-semibold text-fg">
                <Lock aria-hidden="true" className="size-3.5 text-fg-subtle" strokeWidth={2} />
                Held in escrow when they accept
              </dt>
              <dd className="font-display text-figure-md text-fg tabular-nums">{formatMoney(total)}</dd>
            </div>
          </dl>
        ) : null}

        {direct && short > 0 ? (
          <Callout
            tone="sun"
            title={`Your wallet has ${formatMoney(wallet.wallet.available_cents)} available`}
            action={
              <Link href="/brand/wallet" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Add funds
              </Link>
            }
          >
            Add {formatMoney(short)} before they accept, so the escrow can lock. You can still send the offer now.
          </Callout>
        ) : null}

        {skipped.length > 0 ? (
          <Callout tone="info" icon={<Info />} title={skipped.length === 1 ? "One creator is left out" : `${skipped.length} creators are left out`}>
            {skipped.map((entry) => `@${entry.target.handle}`).join(", ")} {direct ? "cannot take a direct offer at this price (no rate card, not open to offers, or under $25). Invite them to a bounty instead." : "is not open to offers right now."}
          </Callout>
        ) : null}

        {failures.length > 0 ? (
          <Callout tone="rose" role="alert" title={failures.length === 1 ? "That offer did not send" : `${failures.length} offers did not send`}>
            <ul className="grid gap-1">
              {failures.map((failure) => (
                <li key={failure.handle}>
                  <span className="font-medium">@{failure.handle}:</span> {failure.message}
                </li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <p className="flex items-start gap-2 text-caption text-fg-subtle">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>Offers expire after seven days and allow three counters. Rights default to organic posting plus the paid-ad term you pick, with no AI likeness.</span>
        </p>
      </SheetBody>
      <SheetFooter className={cn("sm:justify-between")}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" leadingIcon={<Send />} loading={busy} onClick={() => void send()} disabled={blocked && touched}>
          {direct ? (sendable.length > 1 ? `Send ${pluralise(sendable.length, "offer")}` : `Send offer${single && sendable[0]?.price ? ` at ${formatMoney(sendable[0].price, { cents: "never" })}` : ""}`) : sendable.length > 1 ? `Send ${pluralise(sendable.length, "invite")}` : "Send invite"}
        </Button>
      </SheetFooter>
    </>
  );
}
