"use client";

import { Suspense } from "react";
import Link from "next/link";
import { CirclePlus } from "lucide-react";
import { useBrandWallet, useStoreReady } from "@/lib/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button-variants";
import { DemoTag } from "@/components/shell/demo-banner";
import { PageHeader } from "@/components/shell/page-header";
import { useUrlParam } from "../common";
import { AutoTopUpCard } from "./auto-top-up-card";
import { EscrowTab } from "./escrow-tab";
import { FundCard } from "./fund-card";
import { InvoicesTab } from "./invoices-tab";
import { LedgerTab } from "./ledger-tab";
import { PlanCard } from "./plan-card";
import { SettlementTab } from "./settlement-tab";
import { WalletHero } from "./wallet-hero";

const TABS = ["escrow", "ledger", "settlement", "invoices"] as const;
type WalletTab = (typeof TABS)[number];

/**
 * `/brand/wallet`: the brand's money in one place. The wallet balance and escrow are different pockets, shown side by side and never blended;
 * funding shows the exact card charge before the button; and every cent is a ledger entry you can open, filter and export.
 */
export function BrandWalletView() {
  const ready = useStoreReady();
  const wallet = useBrandWallet();
  const [tab, setTab] = useUrlParam<WalletTab>("tab", TABS, "escrow");

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Money"
        title="Wallet"
        description="Fund the wallet, put money into a bounty, and watch it settle. Escrow is released only for verified views, and whatever is not used comes back."
        actions={
          <Link href="/brand/bounties/new" className={buttonVariants({ variant: "secondary", size: "md" })}>
            <CirclePlus aria-hidden="true" />
            Start a bounty
          </Link>
        }
        meta={<DemoTag />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start">
        <WalletHero loading={!ready} wallet={wallet} />
        <FundCard loading={!ready} wallet={wallet} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <AutoTopUpCard loading={!ready} wallet={wallet} />
        <PlanCard loading={!ready} wallet={wallet} />
      </div>

      <Tabs value={tab} onValueChange={(next) => setTab(next as WalletTab)} variant="underline">
        <TabsList aria-label="Wallet sections">
          <TabsTrigger value="escrow" count={ready ? wallet.escrow.bounties.length : undefined}>
            Escrow
          </TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="invoices" count={ready ? wallet.invoices.length : undefined}>
            Invoices
          </TabsTrigger>
        </TabsList>
        <TabsContent value="escrow" className="mt-6">
          <EscrowTab wallet={wallet} />
        </TabsContent>
        <TabsContent value="ledger" className="mt-6">
          <Suspense fallback={null}>
            <LedgerTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="settlement" className="mt-6">
          <SettlementTab />
        </TabsContent>
        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab invoices={wallet.invoices} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
