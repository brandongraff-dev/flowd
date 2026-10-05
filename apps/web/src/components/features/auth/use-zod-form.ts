"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";

type Values = Record<string, string | boolean>;
export type FieldErrors<V extends Values> = Partial<Record<keyof V & string, string>>;

export interface ZodFormOptions<V extends Values> {
  /** Prefix of the control ids (`<prefix>-<field>`), so the first invalid control can be focused. Pass the same ids to each `<Field id>`. */
  idPrefix: string;
  /** Field order on the page: the first invalid one in this order gets focus. */
  order: readonly (keyof V & string)[];
  /** The visible label of each field, for the summary ("Email, Handle"). */
  labels: Record<keyof V & string, string>;
}

export interface ZodForm<V extends Values> {
  values: V;
  /** Errors to show: a field's message appears once it was left or the form was submitted, and clears as soon as the value is valid. */
  errors: FieldErrors<V>;
  /** Plain-text summary for a live region after a failed submit ("2 fields need attention: Email, Handle"). Empty otherwise. */
  summary: string;
  set: <K extends keyof V & string>(name: K, value: V[K]) => void;
  blur: (name: keyof V & string) => void;
  fieldId: (name: keyof V & string) => string;
  /** Wrap the submit handler: validates, focuses the first invalid control, and calls `onValid` with the values when everything passes. */
  handleSubmit: (onValid: (values: V) => void | Promise<void>) => (event: FormEvent<HTMLFormElement>) => Promise<void>;
  /** Replace one field's error from outside (a refusal from the store: "That handle is taken"). */
  setError: (name: keyof V & string, message: string) => void;
  reset: () => void;
}

/**
 * Small controlled-form helper over a zod schema: validate on blur and on submit, clear a message the moment the value is fixed, focus the
 * first invalid control, and give a polite summary for assistive tech. Keeps every form in `features/auth` behaving the same way.
 */
export function useZodForm<V extends Values>(schema: z.ZodType, initial: V, { idPrefix, order, labels }: ZodFormOptions<V>): ZodForm<V> {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors<V>>({});
  const [summary, setSummary] = useState("");
  const latest = useRef<V>(initial);
  const touched = useRef<Set<string>>(new Set());
  const submitted = useRef(false);

  const check = useCallback(
    (candidate: V): FieldErrors<V> => {
      const result = schema.safeParse(candidate);
      if (result.success) return {};
      const out: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in out)) out[key] = issue.message;
      }
      return out as FieldErrors<V>;
    },
    [schema],
  );

  const fieldId = useCallback((name: keyof V & string): string => `${idPrefix}-${name}`, [idPrefix]);

  const set = useCallback(
    <K extends keyof V & string>(name: K, value: V[K]): void => {
      const next = { ...latest.current, [name]: value } as V;
      latest.current = next;
      setValues(next);
      // A visible message follows the value: it clears when the value becomes valid and is refreshed when it is still wrong.
      if (touched.current.has(name) || submitted.current) {
        const found = check(next)[name];
        setErrors((previous) => {
          if (found === previous[name]) return previous;
          const copy = { ...previous };
          if (found) copy[name] = found;
          else delete copy[name];
          return copy;
        });
      }
    },
    [check],
  );

  const blur = useCallback(
    (name: keyof V & string): void => {
      touched.current.add(name);
      const found = check(latest.current)[name];
      setErrors((previous) => {
        if (found === previous[name]) return previous;
        const copy = { ...previous };
        if (found) copy[name] = found;
        else delete copy[name];
        return copy;
      });
    },
    [check],
  );

  const handleSubmit = useCallback(
    (onValid: (values: V) => void | Promise<void>) =>
      async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        submitted.current = true;
        const found = check(latest.current);
        const invalid = order.filter((name) => found[name] !== undefined);
        setErrors(found);
        if (invalid.length > 0) {
          setSummary(`${invalid.length === 1 ? "1 field needs" : `${invalid.length} fields need`} attention: ${invalid.map((name) => labels[name]).join(", ")}.`);
          const first = invalid[0];
          if (first) window.requestAnimationFrame(() => document.getElementById(fieldId(first))?.focus());
          return;
        }
        setSummary("");
        await onValid(latest.current);
      },
    [check, fieldId, order, labels],
  );

  const setError = useCallback((name: keyof V & string, message: string): void => {
    setErrors((previous) => ({ ...previous, [name]: message }));
    window.requestAnimationFrame(() => document.getElementById(`${idPrefix}-${name}`)?.focus());
  }, [idPrefix]);

  const reset = useCallback((): void => {
    latest.current = initial;
    touched.current = new Set();
    submitted.current = false;
    setValues(initial);
    setErrors({});
    setSummary("");
  }, [initial]);

  return { values, errors, summary, set, blur, fieldId, handleSubmit, setError, reset };
}
