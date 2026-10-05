"use client";

import { useState } from "react";
import { useBountyPreview } from "@/lib/data";
import type { BountyView } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/engine";
import { actions } from "@/lib/store";
import { inputOf } from "@/lib/store/core/bounties";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { FundingBreakdown } from "../funding-breakdown";

/**
 * Fund a published bounty from the wallet. The breakdown is the engine's funding sum (the same one the ledger writes); when the wallet is short it
 * says by how much and offers to add exactly that by card, with the card charge shown. Funding is calm: a plain confirmation, the Funded badge, no confetti.
 */
export function FundBountyDialog({ bounty, open, onOpenChange }: { bounty: BountyView; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <FundBody bounty={bounty} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function FundBody({ bounty, onClose }: { bounty: BountyView; onClose: () => void }) {
  const preview = useBountyPreview(inputOf(bounty));
  const [busy, setBusy] = useState(false);
  const short = preview?.wallet.shortfall_cents ?? 0;

  const fund = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.fundBounty({ bounty_id: bounty.id, top_up_from_card: short > 0 });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    notify.success(`${bounty.title} is funded`, {
      description: `${formatMoney(result.data.bounty.escrow_funded_cents, { cents: "auto" })} is in escrow. It is ${result.data.status === "live" ? "live now" : "scheduled to go live"}.`,
    });
    onClose();
  };

  return (
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>Fund this bounty</DialogTitle>
        <DialogDescription>It cannot go live until the whole pool and its fee are in escrow.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-4">
        {preview ? (
          <>
            <FundingBreakdown funding={preview.funding} firstBounty={preview.first_bounty} walletAvailableCents={preview.wallet.available_cents} />
            {short > 0 ? (
              <p className="text-caption text-fg-muted">
                Adding {formatMoney(short)} by card charges {formatMoney(preview.wallet.card_charge_for_shortfall_cents)} with processing at cost, then funds the bounty in one step.
              </p>
            ) : null}
          </>
        ) : (
          <Skeleton className="h-56 w-full rounded-[20px]" />
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Not now
        </Button>
        <Button variant="primary" loading={busy} disabled={!preview || !preview.lint.can_publish} onClick={fund}>
          {preview ? (short > 0 ? `Add ${formatMoney(short)} and fund` : `Fund ${formatMoney(preview.funding.brand_funded_cents)}`) : "Fund"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
