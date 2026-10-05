"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark } from "lucide-react";
import type { BrandWallet } from "@/lib/data/selectors";
import { cardProcessing, formatMoney } from "@/lib/engine";
import { actions } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { dollarsText, parseDollars } from "../dollars";
import { Panel } from "../common";
import { PaymentMethodDialog } from "./payment-method-dialog";

const QUICK = [50_000, 100_000, 250_000, 500_000] as const;
/** The same limits the store enforces, so the button explains instead of failing. */
const MIN_CENTS = 1000;
const MAX_CENTS = 5_000_000;

/**
 * Fund the wallet by card or bank (mock): pick or type an amount, see exactly what the card is charged (the amount plus processing passed through
 * at cost) and confirm. The button names the amount, never just "Pay". Nothing here takes a platform fee: that is taken when a bounty settles.
 */
export function FundCard({ loading, wallet }: { loading: boolean; wallet: BrandWallet }) {
  const router = useRouter();
  const [text, setText] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const method = wallet.payment_method;
  const parsed = parseDollars(text);
  const cents = parsed ?? 0;
  const processing = cardProcessing(cents);
  const error =
    text.trim() === "" ? undefined : parsed === null ? "Enter an amount in dollars, like 1,000 or 250.50." : cents < MIN_CENTS ? `The smallest top-up is ${formatMoney(MIN_CENTS)}.` : cents > MAX_CENTS ? `The largest single top-up is ${formatMoney(MAX_CENTS, { cents: "auto" })}. Contact flowd for larger funding.` : undefined;
  const valid = parsed !== null && !error && cents > 0;
  const MethodIcon = method?.kind === "ach" ? Landmark : CreditCard;
  const methodName = method ? `${method.label} ending ${method.last4}` : null;

  const submit = async (): Promise<void> => {
    if (!valid) return;
    if (!method) {
      setMethodOpen(true);
      return;
    }
    setBusy(true);
    const result = await actions.fundWallet({ amount_cents: cents });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      if (result.error.code === "no_payment_method") setMethodOpen(true);
      return;
    }
    notify.success(`Added ${formatMoney(cents, { cents: "auto" })} to your wallet`, {
      description: `Charged ${formatMoney(result.data.card_charge_cents)} to ${methodName ?? "your card"}. The receipt is in Invoices.`,
      action: { label: "View invoice", onClick: () => router.push(`/brand/wallet/invoices/${result.data.invoice.id}`) },
    });
  };

  return (
    <Panel
      title="Add funds"
      description="Top up by card or bank, then fund a bounty from the wallet."
    >
      {loading ? (
        <div role="status" aria-label="Loading the funding form" className="grid gap-4">
          <Skeleton className="h-9 w-full" shape="pill" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <ChipGroup aria-label="Quick amounts">
            {QUICK.map((amount) => (
              <Chip key={amount} selected={cents === amount} onSelectedChange={() => setText(dollarsText(amount))} size="md">
                {formatMoney(amount, { cents: "auto" })}
              </Chip>
            ))}
          </ChipGroup>
          <Field label="Amount to add" error={error}>
            <Input value={text} onChange={(event) => setText(event.target.value)} inputMode="decimal" autoComplete="off" leading="$" placeholder="1,000" />
          </Field>

          <dl className="grid gap-2 rounded-[20px] bg-surface-field p-4 text-body-sm shadow-[inset_0_0_0_1px_var(--fd-rim)]">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Added to your wallet</dt>
              <dd className="font-semibold text-fg tabular-nums">{formatMoney(valid ? cents : 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Card processing, passed through at cost</dt>
              <dd className="font-semibold text-fg tabular-nums">{formatMoney(valid ? processing : 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-divider pt-2">
              <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg">
                <MethodIcon aria-hidden="true" className="size-4 text-fg-subtle" strokeWidth={1.75} />
                {methodName ? `Charged to ${methodName}` : "No payment method yet"}
                <button type="button" onClick={() => setMethodOpen(true)} className="rounded-md text-caption font-semibold text-accent hover:underline">
                  {method ? "Change" : "Add one"}
                </button>
              </dt>
              <dd className="font-display text-title-sm text-fg tabular-nums">{formatMoney(valid ? cents + processing : 0)}</dd>
            </div>
          </dl>

          <Button variant="primary" size="lg" loading={busy} disabled={!valid} onClick={submit} className="w-full">
            {valid ? `Add ${formatMoney(cents, { cents: "auto" })}` : "Enter an amount"}
          </Button>
          <p className="text-caption text-fg-subtle">Processing is 2.9% plus $0.30, the same cost flowd pays. There is no flowd fee on a top-up. Demo: no real card is charged.</p>
        </>
      )}
      <PaymentMethodDialog open={methodOpen} onOpenChange={setMethodOpen} current={method} />
    </Panel>
  );
}
