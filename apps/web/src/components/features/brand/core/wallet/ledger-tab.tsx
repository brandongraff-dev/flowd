"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, ShieldCheck, TriangleAlert } from "lucide-react";
import { LEDGER_TYPE_META, LEDGER_TYPES, type LedgerType } from "@/lib/contract/types";
import { useBounties, useDemoNow, useLedger, useSlice, useStoreReady } from "@/lib/data";
import type { LedgerTxnView } from "@/lib/data/selectors";
import { formatDateTime, pluralise } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { Pagination } from "@/components/shell/pagination";
import { csvMoney, downloadCsv, toCsv } from "../csv";
import { Fact } from "../common";
import { accountLabel, type AccountNames } from "./ledger-labels";

const PAGE_SIZE = 10;
const TYPE_OPTIONS = [{ value: "all", label: "All types" }, ...LEDGER_TYPES.map((type) => ({ value: type, label: LEDGER_TYPE_META[type].label }))];

/**
 * The double-entry ledger: every transaction the workspace has, newest first, with its legs. A leg is a debit (money leaving an account) or a
 * credit (money arriving); the legs of one transaction always net to exactly zero and the page says so, per transaction and in total. Filter by
 * type or text, open a transaction to see its legs, export the lot as CSV (the export is logged in the activity log).
 */
export function LedgerTab() {
  const ready = useStoreReady();
  const now = useDemoNow();
  const [typeFilter, setTypeFilter] = useState<"all" | LedgerType>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(query.trim(), 200);
  const ledger = useLedger({ brand: "mine", ...(typeFilter !== "all" ? { type: typeFilter } : {}), ...(q ? { q } : {}) });
  const bounties = useBounties({ brand: "mine" });
  const { creators } = useSlice(["creators"]);

  const names: AccountNames = useMemo(
    () => ({
      bounties: new Map(bounties.map((b) => [b.id, b.title])),
      creators: new Map(Object.values(creators).map((c) => [c.id, c.handle])),
    }),
    [bounties, creators],
  );

  const pageCount = Math.max(1, Math.ceil(ledger.txns.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = ledger.txns.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const balanced = ledger.anomalies.length === 0;

  const exportCsv = async (): Promise<void> => {
    const header = ["Posted at (UTC)", "Transaction", "Type", "Account", "Debit", "Credit", "Status", "Memo", "Bounty", "Post"];
    const lines: (string | number)[][] = [header];
    for (const txn of ledger.txns) {
      for (const leg of txn.legs) {
        lines.push([leg.posted_at, txn.txn_id, LEDGER_TYPE_META[leg.entry_type].label, accountLabel(leg.account, names), leg.amount_cents < 0 ? csvMoney(-leg.amount_cents) : "", leg.amount_cents > 0 ? csvMoney(leg.amount_cents) : "", leg.status, leg.memo, leg.bounty_id ?? "", leg.post_id ?? ""]);
      }
    }
    downloadCsv(`flowd-ledger-${now.slice(0, 10)}.csv`, toCsv(lines));
    const logged = await actions.recordExport({ what: `the ledger as CSV (${pluralise(ledger.txns.length, "transaction")})` });
    if (logged.ok) notify.success("Ledger exported", { description: `${pluralise(ledger.txns.length, "transaction")} saved as CSV. The export is in your activity log.` });
    else notify.error(logged.error.message, { description: logged.error.hint });
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <SearchInput
            value={query}
            onValueChange={(next) => {
              setQuery(next);
              setPage(1);
            }}
            placeholder="Search memos, accounts and ids"
            aria-label="Search the ledger"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            aria-label="Filter by type"
            options={TYPE_OPTIONS}
            value={typeFilter}
            onValueChange={(next) => {
              setTypeFilter(next as "all" | LedgerType);
              setPage(1);
            }}
          />
        </div>
        <Button variant="secondary" leadingIcon={<Download aria-hidden="true" />} onClick={exportCsv} disabled={!ready || ledger.txns.length === 0}>
          Export CSV
        </Button>
      </div>

      <dl className="grid gap-4 rounded-[20px] bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)] sm:grid-cols-4">
        <Fact label="Transactions">{ledger.totals.txn_count.toLocaleString("en-US")}</Fact>
        <Fact label="Debits">
          <Money cents={ledger.totals.debit_cents} size="inherit" decimals="auto" />
        </Fact>
        <Fact label="Credits">
          <Money cents={ledger.totals.credit_cents} size="inherit" decimals="auto" />
        </Fact>
        <Fact label="Debits minus credits">
          <span className={cn("inline-flex items-center gap-1.5", balanced ? "text-fg" : "text-rose")}>
            {balanced ? <ShieldCheck aria-hidden="true" className="size-4 text-mint" strokeWidth={2} /> : <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2} />}
            <Money cents={ledger.totals.debit_cents - ledger.totals.credit_cents} size="inherit" decimals="always" state="neutral" icon={false} />
          </span>
        </Fact>
      </dl>

      {!ready ? (
        <SkeletonGroup label="Loading the ledger" className="grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-[20px]" />
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <EmptyState
          art={q || typeFilter !== "all" ? "search" : "wallet"}
          title={q || typeFilter !== "all" ? "No transactions match" : "The ledger is empty"}
          description={q || typeFilter !== "all" ? "Clear the search or pick another type to see every transaction." : "Every top-up, escrow funding and settlement is written here the moment it happens."}
          action={
            q || typeFilter !== "all" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="grid gap-2.5">
          {rows.map((txn) => (
            <TxnCard key={txn.txn_id} txn={txn} names={names} />
          ))}
        </ol>
      )}

      {ready && ledger.txns.length > PAGE_SIZE ? (
        <Pagination page={current} pageCount={pageCount} onPageChange={setPage} total={ledger.txns.length} pageSize={PAGE_SIZE} noun="transactions" />
      ) : null}
    </div>
  );
}

function TxnCard({ txn, names }: { txn: LedgerTxnView; names: AccountNames }) {
  const net = txn.legs.reduce((sum, leg) => sum + leg.amount_cents, 0);
  const walletDelta = txn.wallet_delta_cents;
  return (
    <li className="rounded-[22px] bg-surface-field shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-[22px] p-4 pointer-coarse:min-h-14 [&::-webkit-details-marker]:hidden">
          <span className="grid min-w-0 gap-1.5">
            <span className="flex flex-wrap items-center gap-1.5">
              {txn.types.map((type) => (
                <Badge key={type} tone={LEDGER_TYPE_META[type].tone} size="sm">
                  {LEDGER_TYPE_META[type].label}
                </Badge>
              ))}
              <time dateTime={txn.posted_at} className="text-caption text-fg-subtle">
                {formatDateTime(txn.posted_at)}
              </time>
            </span>
            <span className="text-body-sm font-medium text-fg">{txn.memo}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="grid justify-items-end gap-0.5">
              {walletDelta !== 0 ? (
                <>
                  <Money cents={walletDelta} size="sm" signDisplay="always" decimals="always" state={walletDelta < 0 ? "negative" : "neutral"} icon={false} />
                  <span className="text-micro text-fg-subtle">wallet</span>
                </>
              ) : (
                <>
                  <Money cents={txn.amount_cents} size="sm" decimals="always" state="neutral" icon={false} />
                  <span className="text-micro text-fg-subtle">moved</span>
                </>
              )}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-open:rotate-180" strokeWidth={1.75} />
          </span>
        </summary>
        <div className="grid gap-3 px-4 pb-4">
          <div className="overflow-x-auto rounded-xl bg-surface-raised">
            <table className="w-full min-w-[26rem] border-separate border-spacing-0 text-body-sm">
              <caption className="sr-only">Legs of transaction {txn.txn_id}</caption>
              <thead>
                <tr className="text-micro font-semibold text-fg-muted">
                  <th scope="col" className="px-3.5 py-2 text-left">
                    Account
                  </th>
                  <th scope="col" className="px-3.5 py-2 text-right">
                    Debit
                  </th>
                  <th scope="col" className="px-3.5 py-2 text-right">
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {txn.legs.map((leg, index) => (
                  <tr key={`${leg.account}-${index}`}>
                    <th scope="row" className="border-t border-divider px-3.5 py-2 text-left font-medium text-fg">
                      {accountLabel(leg.account, names)}
                      <span className="ml-2 font-mono text-micro font-normal text-fg-subtle">{leg.account}</span>
                    </th>
                    <td className="border-t border-divider px-3.5 py-2 text-right text-fg-muted tabular-nums">{leg.amount_cents < 0 ? <Money cents={-leg.amount_cents} size="inherit" decimals="always" state="neutral" icon={false} /> : ""}</td>
                    <td className="border-t border-divider px-3.5 py-2 text-right text-fg-muted tabular-nums">{leg.amount_cents > 0 ? <Money cents={leg.amount_cents} size="inherit" decimals="always" state="neutral" icon={false} /> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-caption text-fg-subtle">
            <span className={cn("inline-flex items-center gap-1.5", net === 0 ? "" : "text-rose")}>
              {net === 0 ? <ShieldCheck aria-hidden="true" className="size-3.5 text-mint" strokeWidth={2} /> : <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2} />}
              {net === 0 ? "Debits equal credits: this transaction nets to zero." : "This transaction does not net to zero."}
            </span>
            <span className="flex flex-wrap items-center gap-x-3">
              <span className="font-mono">{txn.txn_id}</span>
              {txn.bounty_id ? (
                <Link href={`/brand/bounties/${txn.bounty_id}`} className="font-medium text-accent hover:underline">
                  Open bounty
                </Link>
              ) : null}
              {txn.invoice_id ? (
                <Link href={`/brand/wallet/invoices/${txn.invoice_id}`} className="font-medium text-accent hover:underline">
                  Open invoice
                </Link>
              ) : null}
            </span>
          </div>
        </div>
      </details>
    </li>
  );
}
