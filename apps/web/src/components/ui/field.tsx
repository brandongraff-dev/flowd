"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldContextValue {
  /** Id for the control (the label's `htmlFor`). */
  id: string;
  /** Id of the label element, for controls that cannot be labelled with `for` (sliders). */
  labelId: string;
  /** Space-separated ids of the hint and error text, for `aria-describedby`. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding <Field>'s wiring, or null outside one. Controls call this through `useFieldControl`. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-labelledby"?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * Merge the surrounding <Field>'s id, description, invalid, required and disabled state into a control's own props.
 * Explicit props on the control win. Used by Input, Textarea, Select, Checkbox, Switch and Slider.
 */
export function useFieldControl(props: ControlProps): {
  id: string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  "aria-labelledby": string | undefined;
  required: boolean | undefined;
  disabled: boolean | undefined;
  invalid: boolean;
} {
  const field = useField();
  const own = props.invalid ?? (props["aria-invalid"] === true || props["aria-invalid"] === "true");
  const invalid = own || (field?.invalid ?? false);
  return {
    id: props.id ?? field?.id,
    "aria-describedby": [props["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": invalid ? true : undefined,
    "aria-labelledby": props["aria-labelledby"],
    required: props.required ?? (field?.required ? true : undefined),
    disabled: props.disabled ?? (field?.disabled ? true : undefined),
    invalid,
  };
}

export interface FieldProps {
  /** Visible label. Always provide one; `labelHidden` keeps it for screen readers only. */
  label?: ReactNode;
  /** Helper text under the control (stays visible when there is an error). */
  hint?: ReactNode;
  /** Error message. Sets the control `aria-invalid` and is announced through `aria-describedby`; carries an icon, never colour alone. */
  error?: ReactNode;
  /** Mark as required (asterisk, and `required` on the control). */
  required?: boolean;
  /** Show "Optional" beside the label (use this instead of asterisks when most fields are required). */
  optional?: boolean;
  disabled?: boolean;
  /** Hide the label visually (kept for assistive tech). */
  labelHidden?: boolean;
  /** Override the generated control id. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint + error, wired for accessibility. Place exactly one control inside; it picks up the id,
 * `aria-describedby`, `aria-invalid`, `required` and `disabled` automatically.
 *
 * ```tsx
 * <Field label="Pool budget" hint="Escrowed before the bounty goes live." error={errors.budget}>
 *   <Input inputMode="decimal" leading="$" />
 * </Field>
 * ```
 */
export function Field({ label, hint, error, required, optional, disabled, labelHidden, id, className, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const value: FieldContextValue = {
    id: controlId,
    labelId: `${controlId}-label`,
    describedBy,
    invalid: Boolean(error),
    required: Boolean(required),
    disabled: Boolean(disabled),
  };

  return (
    <FieldContext value={value}>
      <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2", className)}>
        {label ? (
          <label
            id={value.labelId}
            htmlFor={controlId}
            className={cn("flex items-baseline gap-1.5 text-caption font-semibold text-fg-muted", labelHidden && "sr-only")}
          >
            <span>{label}</span>
            {required ? (
              <span aria-hidden="true" className="text-rose">
                *
              </span>
            ) : null}
            {optional && !required ? <span className="font-normal text-fg-subtle">Optional</span> : null}
          </label>
        ) : null}
        {children}
        {hint ? (
          <p id={hintId} className="text-caption text-fg-subtle">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-caption font-medium text-rose">
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}
