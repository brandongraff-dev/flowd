import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";
import { BrandWalletView } from "@/components/features/brand/core/wallet/wallet-view";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Escrow, funding, the double-entry ledger, settlement runs and invoices.",
};

export default function BrandWalletPage() {
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading the wallet" kpis={false} />}>
      <BrandWalletView />
    </Suspense>
  );
}
