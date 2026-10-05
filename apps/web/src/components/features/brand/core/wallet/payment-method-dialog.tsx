"use client";

import { useState } from "react";
import type { PaymentMethod } from "@/lib/contract/types";
import { actions } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { notify } from "@/components/ui/toast";

export interface PaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: PaymentMethod;
  /** Called after the method is saved (the fund card continues with the top-up). */
  onSaved?: () => void;
}

/**
 * Add or change the card or bank account the wallet is funded from. Only the last four digits are ever typed, sent or stored: the demo never asks
 * for a full card or account number, and the dialog says so.
 */
export function PaymentMethodDialog({ open, onOpenChange, current, onSaved }: PaymentMethodDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PaymentMethodForm current={current} onClose={() => onOpenChange(false)} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

function PaymentMethodForm({ current, onClose, onSaved }: { current?: PaymentMethod; onClose: () => void; onSaved?: () => void }) {
  const [kind, setKind] = useState<PaymentMethod["kind"]>(current?.kind ?? "card");
  const [label, setLabel] = useState(current?.label ?? "");
  const [last4, setLast4] = useState("");
  const [exp, setExp] = useState("");
  const [errors, setErrors] = useState<{ last4?: string; exp?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const next: { last4?: string; exp?: string } = {};
    if (!/^\d{4}$/.test(last4)) next.last4 = kind === "card" ? "Enter the last four digits of the card." : "Enter the last four digits of the account.";
    if (kind === "card" && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) next.exp = "Enter the expiry as MM/YY, for example 08/29.";
    setErrors(next);
    if (next.last4 || next.exp) return;
    setBusy(true);
    const result = await actions.setPaymentMethod({ kind, ...(label.trim() ? { label: label.trim() } : {}), last4, ...(kind === "card" ? { exp } : {}) });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error.message, { description: result.error.hint });
      return;
    }
    notify.success(kind === "card" ? "Card saved" : "Bank account saved", { description: `Ending in ${last4}.` });
    onClose();
    onSaved?.();
  };

  return (
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>{current ? "Change payment method" : "Add a payment method"}</DialogTitle>
        <DialogDescription>The wallet is funded from this. We only ask for the last four digits, never the full number.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        <SegmentedControl<PaymentMethod["kind"]>
          aria-label="Payment type"
          value={kind}
          onValueChange={setKind}
          fullWidth
          options={[
            { value: "card", label: "Card" },
            { value: "ach", label: "Bank account (ACH)" },
          ]}
        />
        <Field label={kind === "card" ? "Card network" : "Bank name"} optional>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={kind === "card" ? "Visa" : "Northwind Bank"} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "card" ? "Last four digits" : "Last four of the account"} required error={errors.last4}>
            <Input value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" placeholder="4242" maxLength={4} />
          </Field>
          {kind === "card" ? (
            <Field label="Expiry" required error={errors.exp}>
              <Input value={exp} onChange={(event) => setExp(event.target.value.replace(/[^\d/]/g, "").slice(0, 5))} inputMode="numeric" autoComplete="off" placeholder="MM/YY" maxLength={5} />
            </Field>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" loading={busy} onClick={submit}>
          {current ? "Save payment method" : "Add payment method"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
