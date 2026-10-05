"use client";

import { useState } from "react";
import { Check, CreditCard, Landmark } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, Callout, ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, Switch, notify } from "@/components/ui";
import { PLAN_FEATURE_META, PLAN_META, type Plan, type PlanFeature } from "@/lib/contract/types";
import { parseMoney, planBreakEven, planFeatures, planPriceCentsMonth, planTakeRate } from "@/lib/engine";
import { useBrandWallet } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { actions } from "@/lib/store";
import { cn } from "@/lib/utils";
import { settle } from "./report";

const ORDER: readonly Plan[] = ["free", "pro", "scale"];

/** The features that differ between plans, in the order a brand cares about. */
const HEADLINE: readonly PlanFeature[] = ["creator_discovery", "attribution_kit", "market_view", "guarded_auto_approve", "slack", "api", "winner_promotion", "multi_app", "roles", "finance_pack", "agency_workspaces", "white_label_reports"];

function PlanCard({ plan, current, onChoose }: { plan: Plan; current: Plan; onChoose: (plan: Plan) => void }) {
  const included = new Set(planFeatures(plan));
  const isCurrent = plan === current;
  const upgrade = ORDER.indexOf(plan) > ORDER.indexOf(current);
  return (
    <li className="grid">
      <GlassCard padding="md" className={cn("grid content-start gap-5", isCurrent && "shadow-[0_0_0_2px_var(--fd-accent-bright)]")}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-title-md text-fg">{PLAN_META[plan].label}</h3>
          {isCurrent ? (
            <Badge size="md" tone="accent">
              Your plan
            </Badge>
          ) : null}
        </div>
        <div>
          <p className="font-display text-figure-lg text-fg tabular-nums">
            {planPriceCentsMonth(plan) === 0 ? "$0" : formatMoney(planPriceCentsMonth(plan), { cents: "never" })}
            <span className="ml-1 text-body-sm font-normal text-fg-subtle">a month</span>
          </p>
          <p className="text-body-sm text-fg-muted">{Math.round(planTakeRate(plan) * 100)}% fee on creator pay</p>
        </div>
        <ul className="grid gap-2" aria-label={`What ${PLAN_META[plan].label} includes`}>
          {HEADLINE.map((feature) => (
            <li key={feature} className={cn("flex items-start gap-2 text-caption", included.has(feature) ? "text-fg" : "text-fg-subtle")}>
              <Check aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", included.has(feature) ? "text-fg" : "opacity-0")} strokeWidth={2.25} />
              <span>
                {PLAN_FEATURE_META[feature].label}
                {included.has(feature) ? "" : <span className="sr-only"> (not included)</span>}
              </span>
            </li>
          ))}
        </ul>
        <Button variant={isCurrent ? "ghost" : upgrade ? "primary" : "secondary"} disabled={isCurrent} onClick={() => onChoose(plan)}>
          {isCurrent ? "Current plan" : upgrade ? `Upgrade to ${PLAN_META[plan].label}` : `Switch to ${PLAN_META[plan].label}`}
        </Button>
      </GlassCard>
    </li>
  );
}

/** Plan and billing: the three plans side by side, what your own spend would cost on each, and the break-even in dollars. */
export function PlanAndBilling() {
  const wallet = useBrandWallet();
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const [method, setMethod] = useState(false);
  const plan = wallet.plan.plan;
  const comparison = wallet.plan.comparison;
  const next = wallet.plan.next_break_even;
  const cheapest = comparison.plans.find((entry) => entry.plan === comparison.best);

  return (
    <div className="grid gap-6">
      <ul className="grid gap-4 lg:grid-cols-3" aria-label="Plans">
        {ORDER.map((entry) => (
          <PlanCard key={entry} plan={entry} current={plan} onChoose={setChoosing} />
        ))}
      </ul>

      <GlassCard padding="md" className="grid gap-4">
        <div className="grid gap-1">
          <h3 className="font-display text-title-sm text-fg">What your spend would cost</h3>
          <p className="text-body-sm text-fg-muted">
            You spent {formatMoney(comparison.monthly_spend_cents, { cents: "never" })} on creators in the last 30 days. Subscription plus fee on that spend:
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {comparison.plans.map((entry) => (
            <div key={entry.plan} className={cn("grid gap-0.5 rounded-xl bg-surface-field p-4", entry.plan === comparison.best && "shadow-[inset_0_0_0_1.5px_var(--fd-rim-strong)]")}>
              <dt className="flex items-center justify-between gap-2 text-caption text-fg-muted">
                {entry.label}
                {entry.plan === comparison.best ? (
                  <Badge size="sm" tone="neutral" variant="outline">
                    Lowest
                  </Badge>
                ) : null}
              </dt>
              <dd className="font-display text-figure-md font-semibold text-fg tabular-nums">{formatMoney(entry.total_cents, { cents: "never" })}</dd>
              <dd className="text-micro text-fg-subtle tabular-nums">
                {formatMoney(entry.subscription_cents, { cents: "never" })} plan + {formatMoney(entry.fee_cents, { cents: "never" })} fee
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-fg-subtle">
          {cheapest && cheapest.plan !== plan ? `${cheapest.label} would have cost less. ` : "Your plan is the lowest-cost one at this spend. "}
          {next ? next.text : plan === "scale" ? "Scale has the lowest fee." : ""} Break-even points: Free to Pro {formatMoney(planBreakEven("free", "pro") ?? 0, { cents: "never" })}, Pro to Scale {formatMoney(planBreakEven("pro", "scale") ?? 0, { cents: "never" })} a month.
        </p>
        {wallet.plan.renews_at ? <p className="text-caption text-fg-subtle">Renews {formatDate(wallet.plan.renews_at, "medium")}. Downgrades take effect at renewal; bounties already funded keep the fee they were funded at.</p> : null}
      </GlassCard>

      <GlassCard padding="md" className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex items-center gap-3.5">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-active text-fg-muted">
            {wallet.payment_method?.kind === "ach" ? <Landmark className="size-5" strokeWidth={1.75} /> : <CreditCard className="size-5" strokeWidth={1.75} />}
          </span>
          <div className="grid gap-0.5">
            <h3 className="text-body-sm font-semibold text-fg">Payment method</h3>
            <p className="text-body-sm text-fg-muted">{wallet.payment_method ? `${wallet.payment_method.label} ending ${wallet.payment_method.last4}${wallet.payment_method.exp ? `, expires ${wallet.payment_method.exp}` : ""}` : "None yet. Add one to fund your wallet by card or bank."}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setMethod(true)}>
          {wallet.payment_method ? "Change" : "Add a method"}
        </Button>
      </GlassCard>

      <AutoTopUp />

      <ConfirmDialog
        open={choosing !== null}
        onOpenChange={(open) => {
          if (!open) setChoosing(null);
        }}
        title={choosing ? `${ORDER.indexOf(choosing) > ORDER.indexOf(plan) ? "Upgrade" : "Switch"} to ${PLAN_META[choosing].label}?` : "Change plan?"}
        description={
          choosing
            ? ORDER.indexOf(choosing) > ORDER.indexOf(plan)
              ? `${formatMoney(planPriceCentsMonth(choosing), { cents: "never" })} is charged to your ${wallet.payment_method ? `${wallet.payment_method.label} ending ${wallet.payment_method.last4}` : "payment method"} now. New bounties use the ${Math.round(planTakeRate(choosing) * 100)}% fee. Bounties already funded keep theirs.`
              : `Takes effect at your next renewal. Until then you keep ${PLAN_META[plan].label}, and bounties already funded keep the fee they were funded at.`
            : undefined
        }
        confirmLabel={choosing ? (ORDER.indexOf(choosing) > ORDER.indexOf(plan) ? `Upgrade to ${PLAN_META[choosing].label}` : `Switch to ${PLAN_META[choosing].label}`) : "Confirm"}
        onConfirm={async () => {
          if (!choosing) return;
          const result = await settle(actions.changeBrandPlan({ plan: choosing }), (data) => (data.charged_cents > 0 ? { title: `You are on ${PLAN_META[data.to].label}`, description: `${formatMoney(data.charged_cents)} charged. The receipt is in Wallet.` } : { title: `Moving to ${PLAN_META[data.to].label} at renewal` }));
          if (!result.ok) throw new Error(result.error.message);
        }}
      />
      <PaymentMethodDialog open={method} onOpenChange={setMethod} />
    </div>
  );
}

function PaymentMethodDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<"card" | "ach">("card");
  const [label, setLabel] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [exp, setExp] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const result = await actions.setPaymentMethod({ kind, label, last4, ...(kind === "card" && exp ? { exp } : {}) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.hint ? `${result.error.message} ${result.error.hint}` : result.error.message);
      return;
    }
    notify.success("Payment method saved", { description: `${result.data.payment_method.label} ending ${result.data.payment_method.last4}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Payment method</DialogTitle>
            <DialogDescription>Demo only: enter just the last four digits. In production, card and bank details go straight to our payment partner in a secure form and never touch flowd.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Type">
              <Select
                value={kind}
                onValueChange={(next) => {
                  setKind(next as "card" | "ach");
                  setLabel(next === "card" ? "Visa" : "Bank transfer");
                }}
                options={[
                  { value: "card", label: "Card" },
                  { value: "ach", label: "Bank transfer" },
                ]}
              />
            </Field>
            <Field label={kind === "card" ? "Card network" : "Bank name"}>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="off" maxLength={30} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Last four digits" error={error}>
                <Input inputMode="numeric" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, ""))} autoComplete="off" placeholder="4242" />
              </Field>
              {kind === "card" ? (
                <Field label="Expires" hint="MM/YY">
                  <Input value={exp} onChange={(event) => setExp(event.target.value)} autoComplete="off" placeholder="09/28" maxLength={5} />
                </Field>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Auto top-up: when the wallet falls under a threshold, add a fixed amount. Saved explicitly, because it moves money. */
function AutoTopUp() {
  const wallet = useBrandWallet();
  const saved = wallet.auto_top_up;
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [threshold, setThreshold] = useState(saved ? String(Math.round(saved.threshold_cents / 100)) : "500");
  const [amount, setAmount] = useState(saved ? String(Math.round(saved.amount_cents / 100)) : "1000");
  const [busy, setBusy] = useState(false);
  const thresholdCents = parseMoney(threshold);
  const amountCents = parseMoney(amount);
  const invalid = enabled && (thresholdCents === null || amountCents === null || amountCents < 10_000);
  const dirty = enabled !== (saved?.enabled ?? false) || (enabled && (thresholdCents !== (saved?.threshold_cents ?? null) || amountCents !== (saved?.amount_cents ?? null)));

  const save = async (): Promise<void> => {
    if (invalid || thresholdCents === null || amountCents === null) return;
    setBusy(true);
    await settle(actions.updateBrandSettings({ auto_top_up: { enabled, threshold_cents: thresholdCents, amount_cents: amountCents } }), enabled ? `Auto top-up on: ${formatMoney(amountCents, { cents: "never" })} when under ${formatMoney(thresholdCents, { cents: "never" })}` : "Auto top-up is off");
    setBusy(false);
  };

  return (
    <GlassCard padding="md" className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-body-sm font-semibold text-fg">Auto top-up</h3>
        <p className="text-body-sm text-fg-muted">Keeps escrow topped up so a bounty never stalls on an empty wallet. It charges your payment method, and every top-up shows in your ledger.</p>
      </div>
      <Switch label="Top up automatically" description={enabled ? "Charges your payment method when the wallet falls under the threshold." : "Off. You fund the wallet yourself."} checked={enabled} onCheckedChange={setEnabled} />
      {enabled ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When the wallet falls under" error={thresholdCents === null ? "Enter a dollar amount." : undefined}>
            <Input inputMode="decimal" leading="$" value={threshold} onChange={(event) => setThreshold(event.target.value)} autoComplete="off" />
          </Field>
          <Field label="Add" hint="At least $100." error={amountCents !== null && amountCents < 10_000 ? "Auto top-up adds at least $100." : undefined}>
            <Input inputMode="decimal" leading="$" value={amount} onChange={(event) => setAmount(event.target.value)} autoComplete="off" />
          </Field>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button variant="secondary" loading={busy} disabled={!dirty || invalid} onClick={() => void save()}>
          Save auto top-up
        </Button>
      </div>
      {enabled && saved?.enabled && wallet.wallet.balance_cents < (saved.threshold_cents ?? 0) ? <Callout tone="info" title="The wallet is under your threshold">A top-up will run at the next check.</Callout> : null}
    </GlassCard>
  );
}
