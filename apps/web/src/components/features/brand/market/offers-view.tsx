"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { ArtAvatar, DomainStatusPill, TierBadge, Thumb } from "@/components/brand";
import { GlassCard } from "@/components/glass";
import { PageHeader } from "@/components/shell";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  SearchInput,
  Skeleton,
  SkeletonGroup,
  Tabs,
  TabsList,
  TabsTrigger,
  buttonVariants,
} from "@/components/ui";
import { OFFER_STATUS_META } from "@/lib/contract/types";
import { useCreatorDirectory, useOffers, useRebuyCandidates, useStoreReady } from "@/lib/data";
import type { OfferView } from "@/lib/data/selectors/offers";
import { formatMoney, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hoursLabel } from "./fmt";
import { OfferDetail } from "./offer-detail";
import { OfferSheet, type OfferKindChoice, type OfferTarget } from "./offer-sheet";
import { offerTargetOf } from "./creator-card";
import { useQueryParams } from "./use-query-state";

const PARAMS = { tab: "", offer: "" } as const;
const TABS = [
  { value: "needs", label: "Needs you" },
  { value: "waiting", label: "Waiting on them" },
  { value: "closed", label: "Closed" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const KIND_SHORT = { direct: "Direct", invite: "Invite", rebuy: "Re-buy" } as const;

/** Open offers say whose move it is, in the brand's words; closed ones keep the contract's label. */
export function offerStatusMeta(offer: OfferView): { label: string; tone: "ember" | "info" | "mint" | "neutral" | "rose" | "sun" | "accent" | "violet" } {
  if (offer.my_turn) return { label: "Your move", tone: "ember" };
  if (offer.open) return { label: "Waiting on them", tone: "info" };
  return OFFER_STATUS_META[offer.status];
}

function tabOf(offer: OfferView): TabValue {
  return offer.my_turn ? "needs" : offer.open ? "waiting" : "closed";
}

function OfferRow({ offer, active, onSelect }: { offer: OfferView; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group grid w-full gap-2 rounded-xl p-3.5 text-left transition-colors duration-(--fd-dur-fast) ease-standard",
          active ? "bg-surface-active shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "hover:bg-surface-hover",
        )}
      >
        <span className="flex items-center gap-3">
          <ArtAvatar art={offer.creator.avatar} name={offer.creator.display_name} size={36} decorative />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-body-sm font-semibold text-fg">@{offer.creator.handle}</span>
              <TierBadge tier={offer.creator.tier} size={20} decorative />
            </span>
            <span className="truncate text-caption text-fg-subtle">{offer.title}</span>
          </span>
          <span className="text-right text-body-sm font-semibold text-fg tabular-nums">{offer.kind === "invite" ? "Invite" : formatMoney(offer.amount_cents, { cents: "never" })}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DomainStatusPill meta={offerStatusMeta(offer)} value={offer.my_turn ? "in_review" : offer.status} size="sm" />
          <span className="text-micro text-fg-subtle">{KIND_SHORT[offer.kind]}</span>
          {offer.open ? <span className="text-micro text-fg-subtle">· {hoursLabel(offer.expires_in_hours).replace("about ", "")} to answer</span> : null}
          {offer.has_warning ? (
            <span className="inline-flex items-center gap-1 text-micro font-medium text-sun">
              <ShieldAlert aria-hidden="true" className="size-3" strokeWidth={2} />
              Scam Shield
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Choose who to send a first offer to. Shows creators who take offers, searchable. */
function CreatorPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (target: OfferTarget) => void }) {
  const [q, setQ] = useState("");
  const directory = useCreatorDirectory({ ...(q.trim() ? { q: q.trim() } : {}), open_to_offers: true, sort: "reliability", limit: 8 });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Who is this offer for?</DialogTitle>
          <DialogDescription>Creators with a rate card who are open to offers. To compare first, use Discover.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <SearchInput aria-label="Search creators" placeholder="Search handle, name or niche" value={q} onValueChange={setQ} autoFocus />
          <ul className="grid gap-1" aria-label="Creators open to offers">
            {directory.items.map((row) => (
              <li key={row.creator.id}>
                <button
                  type="button"
                  disabled={!row.rate_card?.accepts_direct_offers}
                  onClick={() => {
                    onPick(offerTargetOf(row));
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-(--fd-dur-fast) hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArtAvatar art={row.creator.avatar} name={row.creator.display_name} size={36} decorative />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body-sm font-semibold text-fg">@{row.creator.handle}</span>
                    <span className="truncate text-caption text-fg-subtle">{row.creator.display_name}</span>
                  </span>
                  <TierBadge tier={row.creator.tier} size={20} decorative />
                  <span className="w-20 text-right text-body-sm text-fg-muted tabular-nums">{row.rate_card?.accepts_direct_offers ? formatMoney(row.rate_card.price_per_video_cents, { cents: "never" }) : "No card"}</span>
                </button>
              </li>
            ))}
            {directory.items.length === 0 ? <li className="px-2.5 py-6 text-center text-body-sm text-fg-muted">Nobody matches that. Try a niche instead.</li> : null}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function OffersSkeleton() {
  return (
    <SkeletonGroup label="Loading offers" className="grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
      <GlassCard padding="md" className="grid content-start gap-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-9" />
            <div className="grid flex-1 gap-2">
              <Skeleton shape="text" className="w-2/3" />
              <Skeleton shape="text" className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </GlassCard>
      <GlassCard padding="lg" className="grid gap-5">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-44 w-full" />
      </GlassCard>
    </SkeletonGroup>
  );
}

/** Direct offers: your sent offers and invites, the negotiation in each, escrow on accept, and a re-buy shortcut for winners. */
export function OffersView() {
  const ready = useStoreReady();
  const offers = useOffers();
  const rebuys = useRebuyCandidates(4);
  const directory = useCreatorDirectory();
  const { values, set } = useQueryParams(PARAMS);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [composer, setComposer] = useState<{ targets: readonly OfferTarget[]; kind: OfferKindChoice; rebuy?: { post_id: string; title: string; app_id: string } } | null>(null);

  const counts = useMemo(() => ({ needs: offers.filter((offer) => tabOf(offer) === "needs").length, waiting: offers.filter((offer) => tabOf(offer) === "waiting").length, closed: offers.filter((offer) => tabOf(offer) === "closed").length }), [offers]);
  const requested = offers.find((offer) => offer.id === values.offer);
  const tab: TabValue = (TABS.find((entry) => entry.value === values.tab)?.value ?? (requested ? tabOf(requested) : counts.needs > 0 ? "needs" : counts.waiting > 0 ? "waiting" : "needs")) as TabValue;
  const inTab = offers.filter((offer) => tabOf(offer) === tab && (!q.trim() || `${offer.title} ${offer.creator.handle} ${offer.creator.display_name} ${offer.app.name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const selected = requested ?? inTab[0];
  const detailOpen = Boolean(values.offer && requested);

  const targetFor = (offer: OfferView): OfferTarget => {
    const card = directory.items.find((row) => row.creator.id === offer.creator_id);
    return card ? offerTargetOf(card) : { id: offer.creator.id, handle: offer.creator.handle, display_name: offer.creator.display_name, avatar: offer.creator.avatar, tier: offer.creator.tier, open_to_offers: offer.creator.open_to_offers, ...(offer.rate_card ? { rate_card: offer.rate_card } : {}) };
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Market"
        title="Offers"
        description="Agree a price with a creator inside flowd. Counter up to three times, and the money is held in escrow only when you both say yes."
        actions={
          <>
            <Link href="/brand/creators" className={buttonVariants({ variant: "secondary" })}>
              Discover creators
            </Link>
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => setPicking(true)}>
              New offer
            </Button>
          </>
        }
        meta={
          counts.needs > 0 ? (
            <Badge tone="ember" size="lg" dot>
              {pluralise(counts.needs, "offer")} waiting on you
            </Badge>
          ) : undefined
        }
      />

      {!ready ? (
        <OffersSkeleton />
      ) : offers.length === 0 ? (
        <GlassCard padding="lg">
          <EmptyState
            art="inbox"
            title="No offers yet"
            description="Send a creator an offer at their rate-card price, or invite them to one of your live bounties. Everything stays in flowd."
            action={
              <Button variant="primary" leadingIcon={<Plus />} onClick={() => setPicking(true)}>
                Send your first offer
              </Button>
            }
            secondaryAction={
              <Link href="/brand/creators" className={buttonVariants({ variant: "ghost" })}>
                Find creators
                <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
          <div className={cn("grid gap-3 lg:sticky lg:top-24", detailOpen && "max-lg:hidden")}>
            <Tabs value={tab} onValueChange={(next) => set({ tab: next, offer: null })}>
              <TabsList aria-label="Offer status" className="w-full justify-between">
                {TABS.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value} count={counts[entry.value]} className="flex-1 px-2.5">
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <SearchInput aria-label="Search offers" placeholder="Search creator, app or title" value={q} onValueChange={setQ} size="sm" />
            <GlassCard padding="sm" className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
              {inTab.length === 0 ? (
                <EmptyState
                  size="sm"
                  art={q ? "search" : "inbox"}
                  title={q ? "Nothing matches" : tab === "needs" ? "Nothing needs you" : tab === "waiting" ? "No offers out" : "No closed offers"}
                  description={q ? "Clear the search to see everything in this tab." : tab === "needs" ? "When a creator counters or accepts, it lands here." : tab === "waiting" ? "Offers you send show here until they answer." : "Accepted, declined and expired offers collect here."}
                />
              ) : (
                <ul className="grid gap-1" aria-label={TABS.find((entry) => entry.value === tab)?.label}>
                  {inTab.map((offer) => (
                    <OfferRow key={offer.id} offer={offer} active={selected?.id === offer.id} onSelect={() => set({ offer: offer.id, tab })} />
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>

          <div className={cn("min-w-0", !detailOpen && "max-lg:hidden")}>
            {selected ? (
              <OfferDetail key={selected.id} offer={selected} onBack={() => set({ offer: null })} onReoffer={(offer) => setComposer({ targets: [targetFor(offer)], kind: offer.kind === "invite" ? "invite" : "direct" })} />
            ) : (
              <GlassCard padding="lg">
                <EmptyState size="sm" art="search" title="Pick an offer" description="Its price, rights and conversation open here." />
              </GlassCard>
            )}
          </div>
        </div>
      )}

      {ready && rebuys.length > 0 ? (
        <section aria-labelledby="rebuy-title" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="grid gap-1">
              <h2 id="rebuy-title" className="flex items-center gap-2 font-display text-title-md text-fg">
                <RefreshCw aria-hidden="true" className="size-5 text-fg-subtle" strokeWidth={1.75} />
                Re-buy a winner
              </h2>
              <p className="max-w-[62ch] text-body-sm text-fg-muted">Your best settled posts. Pay the same creator for new hooks on the idea that worked.</p>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rebuys.map((candidate) => {
              const card = directory.items.find((row) => row.creator.id === candidate.creator.id);
              return (
                <li key={candidate.post.id} className="grid">
                  <GlassCard padding="sm" className="grid grid-cols-[4.5rem_minmax(0,1fr)] content-start gap-3.5">
                    <Thumb art={candidate.post.thumb} aspect="9:16" label={`Winning post by @${candidate.creator.handle}`} radius="lg" />
                    <div className="grid min-w-0 content-between gap-2">
                      <div className="grid gap-0.5">
                        <p className="truncate text-body-sm font-semibold text-fg">@{candidate.creator.handle}</p>
                        <p className="line-clamp-2 text-caption text-fg-muted">{candidate.why_it_won[0] ?? `${candidate.post.funnel.trials} trials on ${candidate.bounty.title}`}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-caption text-fg-subtle tabular-nums">{candidate.ask_cents ? `Asks ${formatMoney(candidate.ask_cents, { cents: "never" })}` : "No rate card"}</span>
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={!candidate.can_offer || !card}
                          onClick={() => card && setComposer({ targets: [offerTargetOf(card)], kind: "rebuy", rebuy: { post_id: candidate.post.id, title: candidate.bounty.title, app_id: candidate.bounty.app_id } })}
                        >
                          Re-buy
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <CreatorPicker open={picking} onOpenChange={setPicking} onPick={(target) => setComposer({ targets: [target], kind: "direct" })} />
      <OfferSheet
        open={composer !== null}
        onOpenChange={(next) => {
          if (!next) setComposer(null);
        }}
        targets={composer?.targets ?? []}
        initialKind={composer?.kind ?? "direct"}
        rebuy={composer?.rebuy}
        onSent={() => set({ tab: "waiting", offer: null })}
      />
    </div>
  );
}
