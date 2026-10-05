"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Circle } from "lucide-react";
import { useBrandWallet } from "@/lib/data";
import type { AppView } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/engine";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { CoverageMeter } from "../coverage-meter";

/**
 * The last step: what is set up and what is not, the app's attribution coverage, and the funding call to action. The wallet balance is shown so the
 * person knows whether to fund first or go straight to the builder (it funds from the wallet, or tops up by card at the moment of publishing).
 */
export function StepDone({ app }: { app: AppView }) {
  const wallet = useBrandWallet();
  const available = wallet.wallet.available_cents;
  const rc = app.integrations.some((i) => i.kind === "revenuecat" && i.status === "connected");
  const checks = [
    { id: "app", label: `${app.name} is added`, done: true },
    { id: "rc", label: "RevenueCat is connected", done: rc },
    { id: "sdk", label: "SDK snippet is installed", done: app.sdk_status !== "not_installed" },
    { id: "wallet", label: available > 0 ? `Wallet has ${formatMoney(available, { cents: "auto" })} to fund a bounty` : "Wallet is empty. Fund it to go live", done: available > 0 },
  ];
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h2 className="font-display text-title-lg text-fg">{rc ? "You are set up. Fund your first bounty" : "Set up is saved. Fund your first bounty when you are ready"}</h2>
        <p className="max-w-[60ch] text-body-sm text-fg-muted">Flo drafts the brief, ten hooks and a price from your listing. You edit anything, see what it costs all in, and fund it. Nothing goes live until it is fully escrowed.</p>
      </div>

      <ul className="grid gap-2.5 rounded-[24px] bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-3 text-body-sm">
            {check.done ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-mint" strokeWidth={2} /> : <Circle aria-hidden="true" className="size-5 shrink-0 text-fg-disabled" strokeWidth={1.75} />}
            <span className={cn(check.done ? "text-fg" : "text-fg-muted")}>
              {check.label}
              <span className="sr-only">{check.done ? ", done" : ", not done"}</span>
            </span>
          </li>
        ))}
      </ul>

      <CoverageMeter share={app.coverage.share} label={app.coverage.label} />

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/brand/bounties/new?app=${app.id}`} className={buttonVariants({ variant: "primary", size: "lg" })}>
          Start your first bounty
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link href="/brand/wallet" className={buttonVariants({ variant: available > 0 ? "ghost" : "secondary", size: "lg" })}>
          {available > 0 ? "Review the wallet" : "Fund your wallet first"}
        </Link>
      </div>
      <p className="text-caption text-fg-subtle">
        {wallet.brand?.first_bounty_waiver_used === false
          ? "Your first bounty has no platform fee, and flowd matches up to $500 of the pool. "
          : `Creator pay carries a ${Math.round(wallet.plan.take_rate * 100)}% platform fee on your ${wallet.plan.label} plan, shown before you fund. `}
        <Link href="/pricing" className="font-medium text-accent hover:underline">
          How fees work
        </Link>
      </p>
    </div>
  );
}
