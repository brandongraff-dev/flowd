"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { BrandWallet } from "@/lib/data/selectors";
import { GlassCard } from "@/components/glass/glass";
import { Money } from "@/components/ui/money";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { Fact } from "../common";
import { HoldingsBar } from "../holdings-bar";

/**
 * The wallet at a glance: the one big number (what is free to fund the next bounty), where all the money is, and the lifetime facts under it. The
 * wallet balance and escrow are different pockets and are never added into one blended total: wallet money is yours to spend, escrow is
 * released only for verified views and returned if it is not used.
 */
export function WalletHero({ loading, wallet }: { loading: boolean; wallet: BrandWallet }) {
  const { escrow } = wallet;
  const heldForBids = wallet.wallet.held_for_bids_cents;
  // DOMAIN L-03: for every bounty, funded = reserved + settled + open + returned. A false here would be a bug, so the page says so rather than claiming balance.
  const balanced = escrow.bounties.every((b) => b.escrow_funded_cents === b.reserved_cents + b.spent_cents + b.remaining_cents + b.refunded_cents);
  return (
    <GlassCard as="section" aria-labelledby="wallet-hero-title" padding="lg" tint="flow" className="grid gap-7">
      {loading ? (
        <SkeletonGroup label="Loading the wallet" className="grid gap-6">
          <Skeleton shape="text" className="h-3 w-40" />
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-3 w-full" shape="pill" />
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} shape="text" />
            ))}
          </div>
        </SkeletonGroup>
      ) : (
        <>
          <div className="grid gap-2">
            <h2 id="wallet-hero-title" className="fd-eyebrow text-fg-subtle">
              Available to fund bounties
            </h2>
            <Money cents={wallet.wallet.available_cents} size="hero" state="neutral" decimals="always" animate />
            <p className="max-w-[60ch] text-body-sm text-fg-muted">
              This is yours to spend. Money you put into a bounty moves to escrow and is released only for verified views; whatever is not used comes back here.
            </p>
          </div>

          <HoldingsBar
            label="Where your money is"
            segments={[
              { id: "wallet", label: "In the wallet", cents: wallet.wallet.available_cents, hint: "Free to fund a bounty" },
              ...(heldForBids > 0 ? [{ id: "bids", label: "Held for sealed bids", cents: heldForBids, hint: "Returned if the bid loses" }] : []),
              { id: "open", label: "Escrow, open to new videos", cents: escrow.available_cents, hint: "Pool still free in live bounties" },
              { id: "reserved", label: "Escrow, reserved for videos", cents: escrow.reserved_cents, hatched: true, hint: "Held while a video is in review" },
            ]}
          />

          <dl className="grid gap-x-6 gap-y-4 border-t border-divider pt-5 sm:grid-cols-3">
            <Fact label="Held in escrow now">
              <Money cents={escrow.held_cents} size="inherit" state="escrow" decimals="auto" />
            </Fact>
            <Fact label="Settled to creators and fees, all time">
              <Money cents={escrow.settled_cents} size="inherit" decimals="auto" />
            </Fact>
            <Fact label="Returned unspent, all time">
              <Money cents={escrow.returned_cents} size="inherit" decimals="auto" />
            </Fact>
          </dl>
          <Tooltip content="Each bounty's escrow is checked: funded equals reserved plus settled plus open plus returned.">
            <p tabIndex={0} className="inline-flex w-fit items-center gap-1.5 rounded-pill text-caption text-fg-subtle outline-offset-2">
              {balanced ? <ShieldCheck aria-hidden="true" className="size-3.5 text-mint" strokeWidth={2} /> : <TriangleAlert aria-hidden="true" className="size-3.5 text-rose" strokeWidth={2} />}
              {balanced ? "Every bounty's escrow balances to the cent" : "A bounty's escrow does not add up. Check the Escrow tab; no money has moved."}
            </p>
          </Tooltip>
        </>
      )}
    </GlassCard>
  );
}
