"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { parseMoney } from "@/lib/engine";
import { formatMoney } from "@/lib/format";

export interface MoneyInputProps {
  label: string;
  /** Integer cents. */
  value: number;
  onChange: (cents: number) => void;
  /** Inclusive bounds in cents; outside them the field says so and `onChange` still fires so the form can show one error state. */
  min?: number;
  max?: number;
  hint?: string;
  /** Extra error from the form (a refusal from the store). */
  error?: string;
}

/**
 * A dollars field that keeps integer cents. You type "$140" or "140.5"; the field holds your text while you type, parses on every
 * keystroke and reformats on blur. Out-of-range values keep their text and show a plain sentence, so nothing is silently clamped.
 */
export function MoneyInput({ label, value, onChange, min, max, hint, error }: MoneyInputProps) {
  const [draft, setDraft] = useState<string>(() => (value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2)));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  // A value changed from outside (the slider, a reset): show it, unless the person is typing.
  if (lastValue !== value) {
    setLastValue(value);
    if (!focused) setDraft(value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2));
  }

  const parsed = parseMoney(draft);
  let problem: string | undefined = error;
  if (!problem) {
    if (parsed === null) problem = "Enter an amount in dollars, like 140 or 140.50.";
    else if (min !== undefined && parsed < min) problem = `The smallest is ${formatMoney(min)}.`;
    else if (max !== undefined && parsed > max) problem = `The largest is ${formatMoney(max)}.`;
  }

  return (
    <Field label={label} hint={hint} error={problem}>
      <Input
        inputMode="decimal"
        leading="$"
        value={draft}
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = parseMoney(event.target.value);
          if (next !== null) {
            setLastValue(next);
            onChange(next);
          }
        }}
        onBlur={() => {
          setFocused(false);
          if (parsed !== null) setDraft(parsed % 100 === 0 ? String(parsed / 100) : (parsed / 100).toFixed(2));
          else setDraft(value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2));
        }}
      />
    </Field>
  );
}
