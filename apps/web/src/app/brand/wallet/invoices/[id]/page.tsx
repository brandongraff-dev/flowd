import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";
import { InvoiceView } from "@/components/features/brand/core/wallet/invoice-view";

export const metadata: Metadata = {
  title: "Invoice",
  description: "A printable invoice with the pool, fee, processing, tax and your PO and cost-centre fields.",
};

export default async function BrandInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading the invoice" kpis={false} />}>
      <InvoiceView id={decodeURIComponent(id)} />
    </Suspense>
  );
}
