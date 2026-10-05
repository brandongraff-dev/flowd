"use client";

import Link from "next/link";
import { WalletMinimal } from "lucide-react";
import { useBrandWallet, useStoreReady } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The brand's money in the top bar: what sits in escrow (reserved for videos plus the pool still open), and what is free in the wallet to fund
 * the next bounty. Two figures, never blended: escrow is locked until views clear, available is yours. Links to the Wallet.
 */
export function BrandWalletChip({ className }: { className?: string }) {
  const ready = useStoreReady();
  const wallet = useBrandWallet();
  const held = wallet.escrow.held_cents;
  const available = wallet.wallet.available_cents;
  const label = ready ? `Open wallet. ${formatMoney(held, { cents: "auto" })} in escrow, ${formatMoney(available, { cents: "auto" })} available.` : "Open wallet";
  return (
    <Link
      href="/brand/wallet"
      aria-label={label}
      className={cn(
        "inline-flex h-10 items-center gap-2.5 rounded-pill bg-surface-field px-3.5 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover pointer-coarse:h-11",
        className,
      )}
    >
      <WalletMinimal aria-hidden="true" className="size-[18px] shrink-0 text-fg-muted" strokeWidth={1.75} />
      {ready ? (
        <>
          <span className="inline-flex items-baseline gap-1.5">
            <Money cents={held} size="sm" state="escrow" decimals="auto" />
            <span aria-hidden="true" className="hidden text-caption text-fg-subtle @[900px]:inline">
              in escrow
            </span>
          </span>
          <span aria-hidden="true" className="hidden h-4 w-px bg-divider @[1180px]:block" />
          <span aria-hidden="true" className="hidden items-baseline gap-1.5 @[1180px]:inline-flex">
            <Money cents={available} size="sm" state="neutral" decimals="auto" icon={false} />
            <span className="text-caption text-fg-subtle">available</span>
          </span>
        </>
      ) : (
        <Skeleton shape="text" className="h-4 w-16" />
      )}
    </Link>
  );
}
