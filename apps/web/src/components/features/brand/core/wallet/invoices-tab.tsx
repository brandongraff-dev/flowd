"use client";

import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
import type { Invoice } from "@/lib/contract/types";
import { INVOICE_KIND_META, INVOICE_STATUS_META } from "@/lib/contract/types";
import { useDemoNow, useStoreReady } from "@/lib/data";
import { formatDate, pluralise } from "@/lib/format";
import { actions } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { notify } from "@/components/ui/toast";
import { DataTable, type DataColumn } from "@/components/shell/data-table";
import { Pagination } from "@/components/shell/pagination";
import { usePagedRows } from "../use-paged-rows";
import { csvMoney, downloadCsv, toCsv } from "../csv";

const PAGE_SIZE = 10;

const COLUMNS: DataColumn<Invoice>[] = [
  {
    id: "number",
    header: "Invoice",
    label: "Invoice",
    card: "title",
    sortValue: (i) => i.number,
    cell: (i) => (
      <span className="flex items-center gap-2.5">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
        <span className="font-semibold text-fg tabular-nums">{i.number}</span>
      </span>
    ),
  },
  { id: "kind", header: "What for", card: "subtitle", sortValue: (i) => i.kind, cell: (i) => <span className="text-fg-muted">{i.line_items[0]?.description ?? INVOICE_KIND_META[i.kind].label}</span>, minWidth: "16rem" },
  { id: "issued", header: "Issued", card: "meta", hideBelow: "md", sortValue: (i) => i.issued_at, cell: (i) => <span className="text-fg-muted">{formatDate(i.issued_at, "medium")}</span> },
  { id: "po", header: "PO", card: "meta", hideBelow: "xl", cell: (i) => <span className="text-fg-muted">{i.po_number ?? "None"}</span> },
  {
    id: "status",
    header: "Status",
    card: "meta",
    hideBelow: "sm",
    sortValue: (i) => i.status,
    cell: (i) => (
      <Badge tone={INVOICE_STATUS_META[i.status].tone} size="md">
        {INVOICE_STATUS_META[i.status].label}
      </Badge>
    ),
  },
  { id: "total", header: "Total", align: "end", card: "value", sortValue: (i) => i.total_cents, cell: (i) => <Money cents={i.total_cents} size="inherit" decimals="always" /> },
];

/** Every invoice and receipt: wallet top-ups, plan charges, ad and rights fees. Open one for the printable version with the PO and cost-centre fields. */
export function InvoicesTab({ invoices }: { invoices: readonly Invoice[] }) {
  const router = useRouter();
  const paged = usePagedRows(invoices, COLUMNS, PAGE_SIZE, { id: "issued", direction: "desc" });
  const ready = useStoreReady();
  const now = useDemoNow();

  const exportCsv = async (): Promise<void> => {
    const rows: (string | number)[][] = [["Invoice", "Kind", "Status", "Issued", "Due", "Subtotal", "Processing", "Tax", "Total", "PO number", "Cost centre", "VAT id"]];
    for (const i of invoices) rows.push([i.number, INVOICE_KIND_META[i.kind].label, INVOICE_STATUS_META[i.status].label, i.issued_at.slice(0, 10), i.due_at.slice(0, 10), csvMoney(i.subtotal_cents), csvMoney(i.processing_cents), csvMoney(i.tax_cents), csvMoney(i.total_cents), i.po_number ?? "", i.cost_center ?? "", i.vat_id ?? ""]);
    downloadCsv(`flowd-invoices-${now.slice(0, 10)}.csv`, toCsv(rows));
    const logged = await actions.recordExport({ what: `the invoice list as CSV (${pluralise(invoices.length, "invoice")})` });
    if (logged.ok) notify.success("Invoices exported", { description: `${pluralise(invoices.length, "invoice")} saved as CSV. The export is in your activity log.` });
    else notify.error(logged.error.message, { description: logged.error.hint });
  };

  return (
    <DataTable
      caption="Invoices and receipts"
      columns={COLUMNS}
      rows={paged.pageRows}
      manualSort
      sort={paged.sort}
      onSortChange={paged.setSort}
      footer={paged.total > PAGE_SIZE ? <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} total={paged.total} pageSize={PAGE_SIZE} noun="invoices" /> : undefined}
      getRowId={(i) => i.id}
      getRowLabel={(i) => `Invoice ${i.number}`}
      loading={!ready}
      onRowClick={(i) => router.push(`/brand/wallet/invoices/${i.id}`)}
      toolbar={
        <div className="flex items-center justify-between gap-3 px-1 pb-1">
          <p className="text-caption text-fg-subtle">{pluralise(invoices.length, "invoice")}. Open one to add a PO number or cost centre.</p>
          <Button variant="secondary" size="sm" leadingIcon={<Download aria-hidden="true" />} onClick={exportCsv} disabled={invoices.length === 0}>
            Export CSV
          </Button>
        </div>
      }
      empty={{ art: "wallet", title: "No invoices yet", description: "Your first top-up or plan charge creates one, with the processing cost and any tax on separate lines." }}
    />
  );
}
