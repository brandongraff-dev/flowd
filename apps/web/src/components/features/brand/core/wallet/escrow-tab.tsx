"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Target } from "lucide-react";
import type { BountyView, BrandWallet, LedgerTxnView } from "@/lib/data/selectors";
import { formatDate } from "@/lib/format";
import { AppIcon } from "@/components/brand/app-icon";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Panel } from "../common";
import { FillMeter } from "../fill-meter";

const COLUMNS: DataColumn<BountyView>[] = [
  {
    id: "bounty",
    header: "Bounty",
    label: "Bounty",
    card: "title",
    minWidth: "14rem",
    sortValue: (b) => b.title,
    cell: (b) => (
      <span className="flex min-w-0 items-center gap-3">
        <AppIcon art={b.app.icon} name={b.app.name} size={32} decorative />
        <span className="grid min-w-0">
          <span className="truncate font-semibold text-fg">{b.title}</span>
          <span className="text-caption text-fg-subtle">{b.type_label}</span>
        </span>
      </span>
    ),
  },
  { id: "status", header: "Status", card: "subtitle", hideBelow: "lg", cell: (b) => <StatusPill status={b.funded ? "funded" : "unfunded"} size="md" /> },
  { id: "pool", header: "Pool", align: "end", card: "meta", sortValue: (b) => b.budget_cents, cell: (b) => <Money cents={b.budget_cents} size="inherit" decimals="auto" /> },
  { id: "reserved", header: "Reserved", align: "end", card: "meta", hideBelow: "md", sortValue: (b) => b.reserved_cents, cell: (b) => <Money cents={b.reserved_cents} size="inherit" decimals="auto" /> },
  { id: "open", header: "Open", align: "end", card: "meta", sortValue: (b) => b.remaining_cents, cell: (b) => <Money cents={b.remaining_cents} size="inherit" decimals="auto" /> },
  { id: "settled", header: "Settled", align: "end", card: "meta", hideBelow: "md", sortValue: (b) => b.spent_cents, cell: (b) => <Money cents={b.spent_cents} size="inherit" decimals="auto" /> },
  {
    id: "fill",
    header: "Committed",
    card: "value",
    minWidth: "9rem",
    hideBelow: "xl",
    sortValue: (b) => b.fill_ratio,
    cell: (b) => (
      <span className="grid gap-1.5">
        <span className="text-caption font-semibold text-fg tabular-nums">{Math.round(b.fill_ratio * 100)}%</span>
        <FillMeter settled={b.spent_cents} reserved={b.reserved_cents} total={b.escrow_funded_cents} label={`${b.title} committed`} size="sm" />
      </span>
    ),
  },
];

/**
 * Escrow by bounty: for every open bounty, the pool, what is reserved for videos in review, what is still open and what has settled. Each row
 * is a link to the bounty. Below it, what came back to the wallet unspent. The identity (funded equals reserved plus settled plus open plus
 * returned) holds on every row, and the columns are the terms of it.
 */
export function EscrowTab({ wallet }: { wallet: BrandWallet }) {
  const router = useRouter();
  const bounties = wallet.escrow.bounties;
  return (
    <div className="grid gap-5">
      <DataTable
        caption="Escrow by bounty"
        columns={COLUMNS}
        rows={bounties}
        getRowId={(b) => b.id}
        getRowLabel={(b) => b.title}
        density="comfortable"
        onRowClick={(b) => router.push(`/brand/bounties/${b.id}`)}
        defaultSort={{ id: "open", direction: "desc" }}
        empty={{
          art: "wallet",
          title: "Nothing is in escrow",
          description: "When you fund a bounty its pool and fee reserve move here, and come back unspent when it settles.",
          action: (
            <Link href="/brand/bounties/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <Target aria-hidden="true" />
              Start a bounty
            </Link>
          ),
        }}
      />
      <Panel
        title="Returned unspent"
        description="Pool and fee reserve that came back to the wallet when a bounty settled or was cancelled"
      >
        {wallet.returned.length === 0 ? (
          <p className="rounded-[20px] bg-surface-field p-4 text-body-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            Nothing has come back yet. When a bounty settles with budget left, the unspent amount returns to the wallet in one ledger entry and appears here.
          </p>
        ) : (
          <ul className="grid gap-1">
            {wallet.returned.slice(0, 8).map((txn) => (
              <ReturnedRow key={txn.txn_id} txn={txn} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReturnedRow({ txn }: { txn: LedgerTxnView }) {
  const returned = txn.legs.filter((leg) => leg.entry_type === "escrow_refund" && leg.account.startsWith("wallet:")).reduce((sum, leg) => sum + leg.amount_cents, 0);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] px-2.5 py-2.5 hover:bg-surface-hover">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-surface-active text-fg-muted">
        {returned > 0 ? <RotateCcw className="size-4" strokeWidth={1.9} /> : <Check className="size-4" strokeWidth={2} />}
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-body-sm font-medium text-fg">{txn.memo}</span>
        <time dateTime={txn.posted_at} className="text-caption text-fg-subtle">
          {formatDate(txn.posted_at, "medium")}
        </time>
      </span>
      <Money cents={returned || txn.amount_cents} size="sm" signDisplay="always" decimals="auto" state="neutral" />
    </li>
  );
}
