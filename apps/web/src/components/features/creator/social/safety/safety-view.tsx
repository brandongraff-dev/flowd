"use client";

import { ShieldCheck } from "lucide-react";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { PageHeader } from "@/components/shell";
import { useSafety, useStoreReady } from "@/lib/data";
import { SocialSkeleton } from "../shared/skeletons";
import { useUrlParam } from "../shared/use-url-param";
import { AccountHealthTab } from "./account-health-tab";
import { ScamShieldTab } from "./scam-shield-tab";

const TABS = ["scams", "account-health"] as const;
type Tab = (typeof TABS)[number];

export function SafetyView() {
  const ready = useStoreReady();
  const safety = useSafety();
  const [tab, setTab] = useUrlParam<Tab>("tab", TABS, "scams");
  if (!ready) return <SocialSkeleton label="Loading safety" layout="hero" />;

  const open = safety.reports.filter((report) => report.status === "new" || report.status === "triaged").length;
  const attention = safety.accounts.filter((row) => row.health.status !== "good").length;

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)} variant="underline" className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow="Trust"
        title="Scam Shield and Account Health"
        description="How flowd keeps you safe, and how to tell when something is off: no payments to join, escrow on every bounty, in-app chat, and checks that keep your accounts in good standing."
        meta={
          <Badge tone="mint" size="lg" icon={<ShieldCheck />}>
            In-app chat only. No pay-to-join.
          </Badge>
        }
        tabs={
          <TabsList aria-label="Safety">
            <TabsTrigger value="scams" count={open > 0 ? open : undefined}>
              Scam Shield
            </TabsTrigger>
            <TabsTrigger value="account-health" count={attention > 0 ? attention : undefined}>
              Account health
            </TabsTrigger>
          </TabsList>
        }
      />
      <TabsContent value="scams" className="outline-none">
        {tab === "scams" ? <ScamShieldTab safety={safety} /> : null}
      </TabsContent>
      <TabsContent value="account-health" className="outline-none">
        {tab === "account-health" ? <AccountHealthTab safety={safety} /> : null}
      </TabsContent>
    </Tabs>
  );
}
