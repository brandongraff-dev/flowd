"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RemovableChip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface TagEditorProps {
  label: string;
  hint?: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Most tags allowed (the input disables at the limit and says why). */
  max?: number;
  /** Cleans a typed value before it is added: trim, add a leading #, lowercase. Return "" to reject it. */
  normalize?: (raw: string) => string;
  /** An error from the parent's validation. */
  error?: string;
}

/**
 * A list of short tags you can add to and remove from: features creators can demo, hashtags. Enter or the Add button adds the typed value; each
 * chip has a labelled remove button; duplicates are ignored; the limit is stated in words.
 */
export function TagEditor({ label, hint, values, onChange, placeholder, max = 8, normalize = (raw) => raw.trim(), error }: TagEditorProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const atLimit = values.length >= max;

  const add = (): void => {
    const next = normalize(draft);
    if (!next || atLimit) return;
    if (!values.some((value) => value.toLowerCase() === next.toLowerCase())) onChange([...values, next]);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };

  return (
    <Field label={label} hint={atLimit ? `That is the most you can add (${max}). Remove one to add another.` : hint} error={error}>
      <div className="grid gap-2.5">
        <div className="flex gap-2">
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} disabled={atLimit} autoComplete="off" aria-describedby={listId} containerClassName="min-w-0 flex-1" />
          <Button variant="secondary" size="md" leadingIcon={<Plus aria-hidden="true" />} onClick={add} disabled={atLimit || normalize(draft) === ""}>
            Add
          </Button>
        </div>
        {values.length > 0 ? (
          <ul id={listId} className="flex flex-wrap gap-2" aria-label={`${label}, ${values.length} added`}>
            {values.map((value) => (
              <li key={value}>
                <RemovableChip onRemove={() => onChange(values.filter((v) => v !== value))} removeLabel={`Remove ${value}`}>
                  {value}
                </RemovableChip>
              </li>
            ))}
          </ul>
        ) : (
          <p id={listId} className="text-caption text-fg-subtle">
            Nothing added yet.
          </p>
        )}
      </div>
    </Field>
  );
}
