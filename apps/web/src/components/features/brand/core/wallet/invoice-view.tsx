"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { INVOICE_KIND_META, INVOICE_STATUS_META } from "@/lib/contract/types";
import { useBrandWallet, useInvoice, useStoreReady } from "@/lib/data";
import { formatCpm, formatDate, formatPct } from "@/lib/format";
import { formatMoney } from "@/lib/engine";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";
import { PageHeader } from "@/components/shell/page-header";
import { csvMoney, downloadCsv, toCsv } from "../csv";
import { BrandNotFoundState } from "../page-states";
import { Panel } from "../common";

/** Print only the invoice paper, on white, whatever theme the screen is in. The theme is switched to light for the print job and put back after. */
const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  html, body { background: white !important; }
  body * { visibility: hidden !important; }
  .fd-print-root, .fd-print-root * { visibility: visible !important; }
  .fd-print-root { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; background: transparent !important; }
  .fd-print-hide { display: none !important; }
}
`;

/**
 * `/brand/wallet/invoices/[id]`: one printable invoice. The paper shows who billed whom, the line items, processing at cost, tax and the total, and
 * for a bounty funding invoice the pool, the fee at the bounty's rate, flowd's match and the all-in CPM. The PO number, cost centre and VAT id
 * are editable here (finance roles), and the CSV and print views carry them.
 */
export function InvoiceView({ id }: { id: string }) {
  const ready = useStoreReady();
  const invoice = useInvoice(id);
  const wallet = useBrandWallet();
  const [po, setPo] = useState<string | null>(null);
  const [costCenter, setCostCenter] = useState<string | null>(null);
  const [vat, setVat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Printing always happens on white: switch to the light theme for the job, then restore the person's choice.
  useEffect(() => {
    let previous: string | undefined;
    const before = (): void => {
      previous = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = "light";
    };
    const after = (): void => {
      if (previous) document.documentElement.dataset.theme = previous;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  if (!ready) {
    return (
      <SkeletonGroup label="Loading the invoice" className="grid gap-8">
        <Skeleton className="h-24 w-2/3" />
        <Skeleton className="h-[34rem] w-full rounded-[28px]" />
      </SkeletonGroup>
    );
  }
  if (!invoice) {
    return <BrandNotFoundState title="That invoice is not in this workspace" description="It may belong to another workspace, or the link is old. Your invoices are listed in the wallet." backHref="/brand/wallet?tab=invoices" backLabel="Back to invoices" />;
  }

  const poValue = po ?? invoice.po_number ?? "";
  const ccValue = costCenter ?? invoice.cost_center ?? "";
  const vatValue = vat ?? invoice.vat_id ?? "";
  const dirty = poValue !== (invoice.po_number ?? "") || ccValue !== (invoice.cost_center ?? "") || vatValue !== (invoice.vat_id ?? "");
  const missingPo = wallet.brand?.billing.po_required === true && !invoice.po_number;
  const bounty = invoice.bounty;
  const status = INVOICE_STATUS_META[invoice.status];

  const save = async (): Promise<void> => {
    setBusy(true);
    const result = await actions.updateInvoice({ invoice_id: invoice.id, po_number: poValue, cost_center: ccValue, vat_id: vatValue });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    setPo(null);
    setCostCenter(null);
    setVat(null);
    notify.success("Invoice details saved", { description: "The PO number and cost centre are on the printed invoice and the CSV." });
  };

  const exportCsv = async (): Promise<void> => {
    const rows: (string | number)[][] = [
      ["Invoice", "Line", "Description", "Quantity", "Unit price", "Amount", "PO number", "Cost centre", "VAT id", "Bounty"],
      ...invoice.line_items.map((line, index): (string | number)[] => [invoice.number, index + 1, line.description, line.quantity, csvMoney(line.unit_cents), csvMoney(line.amount_cents), poValue, ccValue, vatValue, line.bounty_id ?? bounty?.id ?? ""]),
      [invoice.number, "", "Card processing, passed through at cost", 1, csvMoney(invoice.processing_cents), csvMoney(invoice.processing_cents), poValue, ccValue, vatValue, ""],
      [invoice.number, "", "Tax", 1, csvMoney(invoice.tax_cents), csvMoney(invoice.tax_cents), poValue, ccValue, vatValue, ""],
      [invoice.number, "", "Total", "", "", csvMoney(invoice.total_cents), poValue, ccValue, vatValue, ""],
    ];
    downloadCsv(`${invoice.number}.csv`, toCsv(rows));
    await actions.recordInvoiceDownload({ invoice_id: invoice.id });
    notify.success("Invoice exported", { description: `${invoice.number} saved as CSV.` });
  };

  const print = (): void => {
    void actions.recordInvoiceDownload({ invoice_id: invoice.id });
    window.print();
  };

  return (
    <div className="grid gap-8">
      <style>{PRINT_CSS}</style>
      <div className="fd-print-hide">
        <PageHeader
          eyebrow="Invoice"
          title={invoice.number}
          description={`${INVOICE_KIND_META[invoice.kind].label}, issued ${formatDate(invoice.issued_at, "long")}. Print it, save it as a PDF or export it as CSV for your finance team.`}
          actions={
            <>
              <Link href="/brand/wallet?tab=invoices" className={buttonVariants({ variant: "ghost", size: "md" })}>
                <ArrowLeft aria-hidden="true" />
                Invoices
              </Link>
              <Button variant="secondary" leadingIcon={<Download aria-hidden="true" />} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button variant="primary" leadingIcon={<Printer aria-hidden="true" />} onClick={print}>
                Print or save as PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <article aria-label={`Invoice ${invoice.number}`} className="fd-print-root grid gap-8 rounded-[28px] bg-surface p-6 shadow-raised sm:p-9 print:rounded-none print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-6">
            <div className="grid gap-3">
              <Logo variant="lockup" height={30} decorative />
              <p className="text-caption text-fg-muted">
                flowd, Inc.
                <br />
                hello@joinflowd.io · joinflowd.io
              </p>
            </div>
            <div className="grid justify-items-end gap-1.5 text-right">
              <p className="font-display text-title-lg text-fg tabular-nums">{invoice.number}</p>
              <Badge tone={status.tone} size="md">
                {status.label}
              </Badge>
            </div>
          </header>

          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
            <div className="grid gap-0.5">
              <dt className="fd-eyebrow text-fg-subtle">Billed to</dt>
              <dd className="text-body-sm text-fg">
                <span className="font-semibold">{invoice.brand.billing.legal_name}</span>
                <br />
                <span className="text-fg-muted">{invoice.brand.billing.billing_email}</span>
                {invoice.vat_id ? (
                  <>
                    <br />
                    <span className="text-fg-muted">VAT id {invoice.vat_id}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="fd-eyebrow text-fg-subtle">Dates</dt>
              <dd className="text-body-sm text-fg-muted">
                Issued {formatDate(invoice.issued_at, "medium")}
                <br />
                Due {formatDate(invoice.due_at, "medium")}
                {invoice.paid_at ? (
                  <>
                    <br />
                    <span className="text-fg">Paid {formatDate(invoice.paid_at, "medium")}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="fd-eyebrow text-fg-subtle">For your records</dt>
              <dd className="text-body-sm text-fg-muted">
                PO {invoice.po_number ?? "none"}
                <br />
                Cost centre {invoice.cost_center ?? "none"}
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-body-sm">
              <caption className="sr-only">Line items on invoice {invoice.number}</caption>
              <thead>
                <tr className="text-caption font-semibold text-fg-subtle">
                  <th scope="col" className="border-b border-divider py-2 text-left">
                    Description
                  </th>
                  <th scope="col" className="border-b border-divider px-4 py-2 text-right">
                    Qty
                  </th>
                  <th scope="col" className="border-b border-divider px-4 py-2 text-right">
                    Unit
                  </th>
                  <th scope="col" className="border-b border-divider py-2 text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((line, index) => (
                  <tr key={`${line.description}-${index}`}>
                    <td className="border-b border-divider py-3 pr-4 text-fg">{line.description}</td>
                    <td className="border-b border-divider px-4 py-3 text-right text-fg-muted tabular-nums">{line.quantity}</td>
                    <td className="border-b border-divider px-4 py-3 text-right text-fg-muted tabular-nums">{formatMoney(line.unit_cents)}</td>
                    <td className="border-b border-divider py-3 text-right font-medium text-fg tabular-nums">{formatMoney(line.amount_cents)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="border-b border-divider py-3 pr-4 text-fg-muted">Card processing, passed through at cost (2.9% + $0.30)</td>
                  <td className="border-b border-divider px-4 py-3 text-right text-fg-muted tabular-nums">1</td>
                  <td className="border-b border-divider px-4 py-3 text-right text-fg-muted tabular-nums">{formatMoney(invoice.processing_cents)}</td>
                  <td className="border-b border-divider py-3 text-right font-medium text-fg tabular-nums">{formatMoney(invoice.processing_cents)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className="pt-4 pr-4 text-right text-body-sm font-normal text-fg-muted">
                    Subtotal
                  </th>
                  <td className="pt-4 text-right text-body-sm text-fg tabular-nums">{formatMoney(invoice.subtotal_cents)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={3} className="pt-1.5 pr-4 text-right text-body-sm font-normal text-fg-muted">
                    Processing
                  </th>
                  <td className="pt-1.5 text-right text-body-sm text-fg tabular-nums">{formatMoney(invoice.processing_cents)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={3} className="pt-1.5 pr-4 text-right text-body-sm font-normal text-fg-muted">
                    {invoice.reverse_charge ? "Tax (reverse charge)" : "Tax"}
                  </th>
                  <td className="pt-1.5 text-right text-body-sm text-fg tabular-nums">{formatMoney(invoice.tax_cents)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={3} className="pt-4 pr-4 text-right font-display text-title-sm text-fg">
                    Total
                  </th>
                  <td className="pt-4 text-right font-display text-title-md text-fg tabular-nums">
                    <Money cents={invoice.total_cents} size="inherit" decimals="always" icon={false} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {bounty ? (
            <section aria-label="Where the money went" className="grid gap-3 rounded-[20px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)] print:shadow-none">
              <h2 className="text-body-sm font-semibold text-fg">Where the money went: {bounty.title}</h2>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Line label="Creator pool" value={formatMoney(bounty.budget_cents)} />
                <Line label={bounty.is_first_bounty ? "Platform fee (waived on your first bounty)" : `Platform fee reserve (${formatPct(bounty.take_rate, 0)})`} value={formatMoney(bounty.fee_reserve_cents)} />
                {bounty.matched_cents > 0 ? <Line label="Matched by flowd" value={formatMoney(bounty.matched_cents)} /> : null}
                <Line label="Held in escrow in total" value={formatMoney(bounty.escrow_funded_cents)} />
                {invoice.all_in_cpm_cents !== null ? <Line label="All-in cost per 1,000 views" value={formatCpm(invoice.all_in_cpm_cents, "bare")} /> : null}
              </dl>
              <p className="text-caption text-fg-subtle">All-in includes the creator CPM, the platform fee and card processing. Unspent budget returns to your wallet when the bounty settles.</p>
            </section>
          ) : null}

          <footer className="grid gap-1 border-t border-divider pt-5 text-caption text-fg-subtle">
            <p>Paid by {wallet.payment_method ? `${wallet.payment_method.label} ending ${wallet.payment_method.last4}` : "card"}. Card processing is the same cost flowd pays, with no markup.</p>
            {invoice.reverse_charge ? <p>Reverse charge: the customer accounts for VAT under EU B2B rules.</p> : null}
            <p>Questions about this invoice: hello@joinflowd.io</p>
          </footer>
        </article>

        <div className="fd-print-hide grid gap-5 xl:sticky xl:top-24">
          <Panel title="For your finance team" description="Added to the printed invoice and the CSV. Saved on this invoice only.">
            {missingPo ? (
              <Callout tone="sun" title="Your workspace requires a PO number">
                Add one below so this invoice can be matched to your purchase order.
              </Callout>
            ) : null}
            <div className="grid gap-4">
              <Field label="PO number" optional>
                <Input value={poValue} onChange={(event) => setPo(event.target.value)} autoComplete="off" placeholder="PO-10492" />
              </Field>
              <Field label="Cost centre" optional>
                <Input value={ccValue} onChange={(event) => setCostCenter(event.target.value)} autoComplete="off" placeholder="Growth, UGC" />
              </Field>
              <Field label="VAT id" optional hint="Shown under Billed to. EU business customers can use reverse charge.">
                <Input value={vatValue} onChange={(event) => setVat(event.target.value)} autoComplete="off" placeholder="DE123456789" />
              </Field>
            </div>
            <Button variant="primary" loading={busy} disabled={!dirty} onClick={save} className={cn("justify-self-start")}>
              Save details
            </Button>
          </Panel>
          {invoice.bounty_id ? (
            <Link href={`/brand/bounties/${invoice.bounty_id}`} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "justify-self-start")}>
              Open the bounty
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-body-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold text-fg tabular-nums">{value}</dd>
    </div>
  );
}
