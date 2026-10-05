"use client";

import { useState } from "react";
import type { BrandWallet } from "@/lib/data/selectors";
import { formatMoney } from "@/lib/engine";
import { actions } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/components/ui/toast";
import { dollarsText, parseDollars } from "../dollars";
import { Panel } from "../common";

const MIN_AMOUNT = 10_000;

/**
 * Auto top-up: when the wallet falls below a threshold, add a set amount by card, so a bounty never waits on funding. The switch describes the ON
 * state ("Top up automatically"), the sentence under it says exactly what will happen, and the inputs validate with the store's own rule.
 */
export function AutoTopUpCard({ loading, wallet }: { loading: boolean; wallet: BrandWallet }) {
  const saved = wallet.auto_top_up;
  return (
    <Panel title="Auto top-up" description="Keep the wallet ready for the next bounty.">
      {loading ? (
        <div role="status" aria-label="Loading auto top-up" className="grid gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : (
        // Re-key on the saved values so the form resets when another tab or an undo changes them.
        <AutoTopUpForm key={`${saved?.enabled}-${saved?.threshold_cents}-${saved?.amount_cents}`} saved={saved} hasMethod={Boolean(wallet.payment_method)} />
      )}
    </Panel>
  );
}

function AutoTopUpForm({ saved, hasMethod }: { saved: BrandWallet["auto_top_up"]; hasMethod: boolean }) {
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [threshold, setThreshold] = useState(dollarsText(saved?.threshold_cents ?? 50_000));
  const [amount, setAmount] = useState(dollarsText(saved?.amount_cents ?? 100_000));
  const [busy, setBusy] = useState(false);

  const thresholdCents = parseDollars(threshold);
  const amountCents = parseDollars(amount);
  const thresholdError = enabled && thresholdCents === null ? "Enter an amount in dollars." : undefined;
  const amountError = enabled && (amountCents === null || amountCents < MIN_AMOUNT) ? `Auto top-up adds at least ${formatMoney(MIN_AMOUNT, { cents: "auto" })}.` : undefined;
  const dirty = enabled !== (saved?.enabled ?? false) || (enabled && (thresholdCents !== (saved?.threshold_cents ?? null) || amountCents !== (saved?.amount_cents ?? null)));
  const canSave = dirty && !thresholdError && !amountError;

  const save = async (next: { enabled: boolean; threshold_cents: number; amount_cents: number }): Promise<void> => {
    setBusy(true);
    const result = await actions.updateBrandSettings({ auto_top_up: next });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    notify.success(next.enabled ? "Auto top-up is on" : "Auto top-up is off", {
      description: next.enabled ? `Below ${formatMoney(next.threshold_cents, { cents: "auto" })}, the wallet gets ${formatMoney(next.amount_cents, { cents: "auto" })}.` : "Fund the wallet by hand when a bounty needs it.",
    });
  };

  const toggle = (on: boolean): void => {
    setEnabled(on);
    // Turning it off is one tap and saves at once; turning it on waits for the amounts to be confirmed.
    if (!on) void save({ enabled: false, threshold_cents: saved?.threshold_cents ?? thresholdCents ?? 50_000, amount_cents: saved?.amount_cents ?? amountCents ?? 100_000 });
  };

  return (
    <div className="grid gap-4">
      <Switch label="Top up automatically" description="Charged to your payment method on file." checked={enabled} onCheckedChange={toggle} side="right" disabled={busy || !hasMethod} />
      {!hasMethod ? <p className="text-caption text-fg-subtle">Add a payment method first. Auto top-up needs somewhere to charge.</p> : null}
      {enabled ? (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="When the wallet falls below" error={thresholdError}>
              <Input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" />
            </Field>
            <Field label="Add this much" error={amountError} hint="At least $100.">
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" leading="$" autoComplete="off" />
            </Field>
          </div>
          <p className="text-body-sm text-fg-muted">
            {thresholdCents !== null && amountCents !== null && !amountError
              ? `When the wallet drops below ${formatMoney(thresholdCents, { cents: "auto" })}, flowd adds ${formatMoney(amountCents, { cents: "auto" })} by card, plus processing at cost.`
              : "Set both amounts to see what will happen."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="md"
              loading={busy}
              disabled={!canSave}
              onClick={() => thresholdCents !== null && amountCents !== null && void save({ enabled: true, threshold_cents: thresholdCents, amount_cents: amountCents })}
            >
              Save auto top-up
            </Button>
            <p className="text-caption text-fg-subtle">Demo: the rule is saved and logged. No card is charged by it here.</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
