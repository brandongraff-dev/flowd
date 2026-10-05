"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Gavel, Layers, Lock, ShieldCheck, Users } from "lucide-react";
import { ArtAvatar, ArtSurface, TierBadge } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { PageHeader, Section } from "@/components/shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Callout,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  buttonVariants,
} from "@/components/ui";
import { parseMoney } from "@/lib/engine";
import { useAuctions, useBrandWallet, useStoreReady } from "@/lib/data";
import type { AuctionView } from "@/lib/data/selectors/market";
import { formatDateTime, formatMoney, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { timeLeftLabel } from "./fmt";
import { CardGridSkeleton } from "./route-states";
import { settle } from "./report";
import { useQueryParam } from "./use-query-state";

const TABS = [
  { value: "open", label: "Open" },
  { value: "mine", label: "My bids" },
  { value: "results", label: "Results" },
] as const;

/** A bid dialog: the maximum a brand will pay for one slot, held from the wallet while the auction is open. */
function BidDialog({ auction, onClose }: { auction: AuctionView; onClose: () => void }) {
  const wallet = useBrandWallet();
  const mine = auction.my_bid;
  const [text, setText] = useState(mine ? String(Math.round(mine.amount_cents / 100)) : "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const amount = parseMoney(text);
  const previousHold = mine?.escrow_hold_cents ?? 0;
  const afterHold = wallet.wallet.available_cents + previousHold - (amount ?? 0);
  const error = touched && (amount === null || amount < auction.reserve_cents) ? `Bid at least the reserve of ${formatMoney(auction.reserve_cents, { cents: "never" })}.` : undefined;
  const short = amount !== null && afterHold < 0 ? Math.abs(afterHold) : 0;

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (amount === null || amount < auction.reserve_cents) return;
    setBusy(true);
    const result = await settle(actions.placeBid({ auction_id: auction.id, amount_cents: amount, ...(note.trim() ? { note: note.trim() } : {}) }), (data) => ({
      title: mine ? "Sealed bid updated" : "Sealed bid placed",
      description: `${formatMoney(data.held_cents)} is held from your wallet. Bids stay sealed until ${formatDateTime(auction.closes_at)}.`,
    }));
    setBusy(false);
    if (result.ok) onClose();
  };

  const nudges = [auction.reserve_cents, Math.round((auction.reserve_cents * 1.25) / 100) * 100, Math.round((auction.reserve_cents * 1.5) / 100) * 100];

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent size="md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{mine ? "Change your sealed bid" : "Place a sealed bid"}</DialogTitle>
            <DialogDescription>
              {auction.title} · @{auction.creator.handle}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-5">
            <Field label="Your maximum for one slot" error={error} hint={`Reserve ${formatMoney(auction.reserve_cents, { cents: "never" })}. You pay the clearing price, which can be lower, never higher.`}>
              <Input inputMode="decimal" leading="$" value={text} onChange={(event) => setText(event.target.value)} placeholder={String(Math.round(auction.reserve_cents / 100))} autoComplete="off" autoFocus />
            </Field>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick amounts">
              {nudges.map((cents, index) => (
                <Chip key={cents} size="sm" selected={amount === cents} onSelectedChange={() => setText(String(Math.round(cents / 100)))}>
                  {index === 0 ? "Reserve " : index === 1 ? "+25% " : "+50% "}
                  {formatMoney(cents, { cents: "never" })}
                </Chip>
              ))}
            </div>
            <Field label="Note to the creator" optional hint="What you would make together. Sealed along with your bid.">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
            </Field>
            <dl className="grid gap-2 rounded-xl bg-surface-field p-4 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Wallet available now</dt>
                <dd className="font-medium text-fg tabular-nums">{formatMoney(wallet.wallet.available_cents + previousHold)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-fg-muted">
                  <Lock aria-hidden="true" className="size-3.5" strokeWidth={2} />
                  Held while the auction is open
                </dt>
                <dd className="font-medium text-fg tabular-nums">{amount !== null ? formatMoney(amount) : "Your bid"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-divider pt-2">
                <dt className="text-fg-muted">Available after the hold</dt>
                <dd className="font-semibold text-fg tabular-nums">{amount !== null ? formatMoney(Math.max(afterHold, 0)) : "..."}</dd>
              </div>
              <p className="text-micro text-fg-subtle">The hold is released at the close if you lose, and down to the clearing price if you win. Winners then fund a private bounty at that price.</p>
            </dl>
            {short > 0 ? (
              <Callout tone="sun" title={`Add ${formatMoney(short)} to hold this bid`} action={<Link href="/brand/wallet" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add funds</Link>}>
                Your wallet does not cover the hold yet.
              </Callout>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={short > 0}>
              {amount !== null && amount >= auction.reserve_cents ? `Hold ${formatMoney(amount, { cents: "never" })} and bid` : "Place sealed bid"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BidBadge({ auction }: { auction: AuctionView }) {
  const bid = auction.my_bid;
  if (!bid) return null;
  if (bid.status === "won") return <Badge tone="mint" size="md">You won{auction.pays_cents !== undefined ? ` at ${formatMoney(auction.pays_cents, { cents: "never" })}` : ""}</Badge>;
  if (bid.status === "lost") return <Badge tone="neutral" size="md">Outbid</Badge>;
  return <Badge tone="accent" size="md">Your bid is in</Badge>;
}

function AuctionCard({ auction, onBid, onWithdraw }: { auction: AuctionView; onBid: (auction: AuctionView) => void; onWithdraw: (auction: AuctionView) => void }) {
  const closed = !auction.is_open && auction.status !== "scheduled";
  const mine = auction.my_bid;
  const scheduled = auction.status === "scheduled";
  const sorted = [...auction.bids].filter((bid) => bid.status !== "withdrawn").sort((a, b) => b.amount_cents - a.amount_cents);

  return (
    <GlassCard as="article" aria-label={auction.title} padding="none" className="grid content-start overflow-hidden">
      <div className="relative h-24 overflow-hidden">
        <ArtSurface art={auction.art} aspect="16:9" className="absolute inset-0 block size-full" />
        <span aria-hidden="true" className="fd-media-scrim absolute inset-0" />
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="flex items-center gap-2.5">
            <ArtAvatar art={auction.creator.avatar} name={auction.creator.display_name} size={32} decorative />
            <div className="grid">
              <Link href={`/brand/creators/${auction.creator.handle}`} className="rounded-sm text-body-sm font-semibold hover:underline">
                @{auction.creator.handle}
              </Link>
              <span className="text-micro opacity-80">{auction.creator.display_name}</span>
            </div>
          </div>
          <TierBadge tier={auction.creator.tier} size={28} decorative />
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">{auction.title}</h3>
          <p className="line-clamp-2 text-body-sm text-fg-muted">{auction.description}</p>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          <div className="grid gap-0.5">
            <dt className="flex items-center gap-1 text-caption text-fg-subtle">
              <Layers aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Slots
            </dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{auction.slots}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-caption text-fg-subtle">Reserve</dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{formatMoney(auction.reserve_cents, { cents: "never" })}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="flex items-center gap-1 text-caption text-fg-subtle">
              <Users aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Bids
            </dt>
            <dd className="font-display text-figure-sm font-semibold text-fg tabular-nums">{auction.bids_count}</dd>
          </div>
        </dl>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fg-muted">
          <Clock aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
          {scheduled ? (
            <>Opens {formatDateTime(auction.opens_at)}</>
          ) : closed ? (
            <>
              {auction.status === "awarded" ? "Awarded" : auction.status === "no_bids" ? "Closed with no bids" : auction.status === "cancelled" ? "Cancelled" : "Closed"} · {formatDateTime(auction.closes_at)}
            </>
          ) : (
            <>
              <span className="font-semibold text-fg">{timeLeftLabel(auction.hours_left)}</span>
              <span className="text-fg-subtle">· closes {formatDateTime(auction.closes_at)}</span>
            </>
          )}
        </p>

        {closed && auction.status === "awarded" ? (
          <div className="grid gap-2 rounded-xl bg-surface-field p-3.5 text-body-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-fg-muted">Clearing price</span>
              <span className="font-display text-figure-sm font-semibold text-fg tabular-nums">{formatMoney(auction.clearing_price_cents ?? 0, { cents: "never" })}</span>
            </p>
            <p className="text-caption text-fg-subtle">Second price: the {pluralise(auction.slots, "winner")} each paid the highest losing bid, not their own maximum.</p>
            {sorted.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="All bids, highest first">
                {sorted.map((bid) => (
                  <li key={bid.id}>
                    <Badge size="sm" tone={bid.status === "won" ? "mint" : "neutral"}>
                      {formatMoney(bid.amount_cents, { cents: "never" })}
                      {bid.status === "won" ? " won" : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {mine && !closed ? (
          <p className="flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-body-sm text-fg">
            <Lock aria-hidden="true" className="size-4 shrink-0 text-accent" strokeWidth={2} />
            <span>
              Your sealed bid <span className="font-semibold tabular-nums">{formatMoney(mine.amount_cents, { cents: "never" })}</span>, with {formatMoney(mine.escrow_hold_cents, { cents: "never" })} held.
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <BidBadge auction={auction} />
          <div className="ml-auto flex items-center gap-2">
            {auction.is_open ? (
              <>
                {mine ? (
                  <Button variant="ghost" size="sm" onClick={() => onWithdraw(auction)}>
                    Withdraw
                  </Button>
                ) : null}
                <Button variant={mine ? "secondary" : "primary"} size="sm" leadingIcon={<Gavel />} onClick={() => onBid(auction)}>
                  {mine ? "Change bid" : "Place sealed bid"}
                </Button>
              </>
            ) : scheduled ? (
              <Badge tone="neutral" size="md" variant="outline">
                Opens {formatDateTime(auction.opens_at)}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

const RULES = [
  { id: "sealed", title: "Bids are sealed", body: "You see your own bid and the number of bids. Nobody sees the amounts until the auction closes, so there is no sniping and no bidding war." },
  { id: "second", title: "Winners pay the second price", body: "The highest bids win the slots. Everyone who wins pays the same price: the highest losing bid, or the reserve if there was none. Bid what the slot is worth to you; it will not cost you more than the market sets." },
  { id: "hold", title: "Your maximum is held, not spent", body: "While an auction is open, your bid is held from your wallet so a bid is always good for the money. At the close, losing holds are released and winning holds drop to the clearing price." },
  { id: "after", title: "What a win gives you", body: "A private direct bounty for that creator at the clearing price, funded from your wallet with the usual fee, and covered by the auction's Rights Card. The creator submits, you review, and pay is released only for approved work." },
] as const;

/** Auctions for top-creator slots: sealed maximum bids, second-price clearing, a hold from the wallet, results with the clearing price. */
export function AuctionsView() {
  const ready = useStoreReady();
  const auctions = useAuctions();
  const wallet = useBrandWallet();
  const [tab, setTab] = useQueryParam("tab", "open");
  const [bidding, setBidding] = useState<AuctionView | null>(null);
  const [withdrawing, setWithdrawing] = useState<AuctionView | null>(null);

  const open = auctions.filter((a) => a.is_open || a.status === "scheduled");
  const mine = auctions.filter((a) => a.my_bid && a.my_bid.status !== "withdrawn");
  const results = auctions.filter((a) => !a.is_open && a.status !== "scheduled");
  const current = tab === "mine" ? mine : tab === "results" ? results : open;
  const active = (TABS.find((entry) => entry.value === tab)?.value ?? "open") as (typeof TABS)[number]["value"];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Auctions"
        description="Bid for a slot with a top creator. Bids are sealed and winners pay the second-highest bid, so you can bid what the slot is worth."
        meta={
          <>
            <Badge size="lg" tone="neutral" icon={<ShieldCheck />}>
              Wallet {formatMoney(wallet.wallet.available_cents, { cents: "never" })} available
            </Badge>
            {wallet.wallet.held_for_bids_cents > 0 ? (
              <Badge size="lg" tone="neutral" variant="outline" icon={<Lock />}>
                {formatMoney(wallet.wallet.held_for_bids_cents, { cents: "never" })} held for bids
              </Badge>
            ) : null}
          </>
        }
        tabs={
          <Tabs value={active} onValueChange={(next) => setTab(next === "open" ? null : next)} variant="underline">
            <TabsList aria-label="Auction views">
              <TabsTrigger value="open" count={open.length}>
                Open
              </TabsTrigger>
              <TabsTrigger value="mine" count={mine.length}>
                My bids
              </TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {!ready ? (
        <CardGridSkeleton count={3} label="Loading auctions" />
      ) : current.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="bounty"
            title={tab === "mine" ? "No bids yet" : tab === "results" ? "No results yet" : "No open auctions"}
            description={
              tab === "mine"
                ? "Place a sealed bid on an open auction and it shows here, with the money held."
                : tab === "results"
                  ? "Closed auctions appear here with their clearing price."
                  : "Platinum and Elite creators open a few slots a week. New auctions appear here when they do."
            }
            action={
              tab === "open" ? (
                <Link href="/brand/creators?tier=platinum" className={buttonVariants({ variant: "secondary" })}>
                  See Platinum creators
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => setTab(null)}>
                  See open auctions
                </Button>
              )
            }
          />
        </GlassCard>
      ) : (
        <ul className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3")}>
          {current.map((auction) => (
            <li key={auction.id} className="grid">
              <AuctionCard auction={auction} onBid={setBidding} onWithdraw={setWithdrawing} />
            </li>
          ))}
        </ul>
      )}

      <Section title="How auctions work" description="Four rules, and nothing hidden.">
        <GlassCard padding="sm">
          <Accordion variant="plain" defaultValue="second">
            {RULES.map((rule) => (
              <AccordionItem key={rule.id} value={rule.id}>
                <AccordionTrigger>{rule.title}</AccordionTrigger>
                <AccordionContent>{rule.body}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </GlassCard>
      </Section>

      {bidding ? <BidDialog key={bidding.id} auction={bidding} onClose={() => setBidding(null)} /> : null}
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(next) => {
          if (!next) setWithdrawing(null);
        }}
        title="Withdraw your bid?"
        description={withdrawing ? `The hold of ${formatMoney(withdrawing.my_bid?.escrow_hold_cents ?? 0, { cents: "never" })} is released at once. You can bid again while the auction is open.` : undefined}
        confirmLabel="Withdraw bid"
        tone="danger"
        onConfirm={async () => {
          if (!withdrawing) return;
          const result = await settle(actions.withdrawBid({ auction_id: withdrawing.id }), "Bid withdrawn. The hold is released.");
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
    </div>
  );
}
