"use client";

import type { ChangeEvent, ComponentPropsWithRef, KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useControllableState } from "@/lib/hooks/use-controllable-state";
import { Input } from "./input";
import { KbdShortcut } from "./kbd";
import { Spinner } from "./spinner";

export interface SearchInputProps extends Omit<ComponentPropsWithRef<"input">, "size" | "type" | "value" | "defaultValue" | "onChange" | "prefix"> {
  value?: string;
  defaultValue?: string;
  /** Called with the new text on every change (and with "" when cleared). */
  onValueChange?: (value: string) => void;
  /** Called when the clear button or Escape clears a non-empty value. */
  onClear?: () => void;
  /** Called on Enter. */
  onSearch?: (value: string) => void;
  /** Show a spinner while results load. */
  loading?: boolean;
  /** Hint shown when empty and unfocused, e.g. `["mod", "K"]` or `["/"]`. Purely visual: wire the key with `useHotkey`. */
  shortcut?: readonly string[];
  size?: "sm" | "md" | "lg";
  containerClassName?: string;
}

/**
 * Search field: leading glyph, clear button once there is text, Escape clears, Enter searches, optional shortcut hint
 * and loading spinner. `type="search"` with the native clear hidden; label it (`aria-label` or <Field>) like any input.
 */
export function SearchInput({
  value,
  defaultValue = "",
  onValueChange,
  onClear,
  onSearch,
  loading,
  shortcut,
  size,
  containerClassName,
  className,
  placeholder = "Search",
  onKeyDown,
  ref,
  ...props
}: SearchInputProps) {
  const [text, setText] = useControllableState<string>({ value, defaultValue, onChange: onValueChange });

  const clear = (): void => {
    setText("");
    onClear?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && text) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    } else if (event.key === "Enter") {
      onSearch?.(text);
    }
  };

  return (
    <Input
      ref={ref}
      type="search"
      inputMode="search"
      enterKeyHint="search"
      autoComplete="off"
      spellCheck={false}
      size={size}
      placeholder={placeholder}
      value={text}
      onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
      onKeyDown={handleKeyDown}
      leading={<Search />}
      containerClassName={containerClassName}
      className={cn("[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden", className)}
      trailing={
        loading ? (
          <Spinner size={16} label="Searching" />
        ) : text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="grid size-7 place-items-center rounded-pill text-fg-subtle transition-colors duration-(--fd-dur-fast) hover:bg-surface-hover hover:text-fg pointer-coarse:size-9"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : shortcut ? (
          <span className="hidden sm:inline-flex group-focus-within:hidden">
            <KbdShortcut keys={shortcut} size="sm" />
          </span>
        ) : null
      }
      {...props}
    />
  );
}
