"use client";

import { useState, type ComponentPropsWithRef, type CSSProperties, type ReactNode } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { useField } from "./field";

const THUMB = 24;

export interface SliderMark {
  value: number;
  /** Optional caption under the tick (a price, a quartile). */
  label?: ReactNode;
}

export interface SliderProps extends Omit<ComponentPropsWithRef<typeof SliderPrimitive.Root>, "value" | "defaultValue" | "onValueChange" | "onValueCommit" | "children"> {
  /** Controlled value. One number = a slider, two = a range. */
  value?: readonly number[];
  defaultValue?: readonly number[];
  onValueChange?: (value: number[]) => void;
  /** Fires on release (pointer up / key up): the moment to persist or fetch. */
  onValueCommit?: (value: number[]) => void;
  /** Ticks on the track (detents), optionally captioned. Snapping is `step`; marks are visual. */
  marks?: readonly SliderMark[];
  /** Format the value shown in the bubble above the thumb while dragging or focused (default: the number). */
  format?: (value: number) => string;
  /** Accessible names for the thumbs. Defaults: "Value" for one, "Minimum" and "Maximum" for a range. */
  thumbLabels?: readonly string[];
  /** Always show the value bubble, not just while dragging. */
  alwaysShowValue?: boolean;
  /** Fill the track between the thumbs / from the start in Flow gradient (default) or a quiet neutral. */
  tone?: "flow" | "mint" | "neutral";
}

/**
 * Slider and range slider on Radix: arrow keys, Home/End, PageUp/PageDown, touch drag. 24px thumb with a 44px hit area,
 * value bubble while dragging, optional detent marks. One value = slider, two = range.
 *
 * ```tsx
 * <Slider defaultValue={[240]} min={50} max={500} step={5} format={(v) => `$${(v / 100).toFixed(2)}`} marks={[{ value: 240, label: "Suggested" }]} aria-label="CPM" />
 * ```
 */
export function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  marks,
  format,
  thumbLabels,
  alwaysShowValue = false,
  tone = "flow",
  min = 0,
  max = 100,
  step = 1,
  className,
  disabled,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SliderProps) {
  const field = useField();
  const [inner, setInner] = useState<number[]>(() => [...(defaultValue ?? [min])]);
  const current = value ? [...value] : inner;
  const [dragging, setDragging] = useState(false);
  const range = current.length > 1;
  const names = thumbLabels ?? (range ? ["Minimum", "Maximum"] : ["Value"]);
  const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : field?.labelId);
  const show = (v: number): string => (format ? format(v) : String(v));

  const position = (v: number): CSSProperties => {
    const pct = max === min ? 0 : (v - min) / (max - min);
    // Radix keeps the thumb inside the track: mirror its offset so ticks line up with the thumb centre.
    return { left: `calc(${pct * 100}% + ${(0.5 - pct) * THUMB}px)` };
  };

  return (
    <div className={cn("w-full", marks?.some((mark) => mark.label) && "pb-7", className)}>
      <SliderPrimitive.Root
        {...props}
        min={min}
        max={max}
        step={step}
        disabled={disabled ?? field?.disabled}
        value={value ? [...value] : undefined}
        defaultValue={defaultValue ? [...defaultValue] : undefined}
        onValueChange={(next) => {
          setInner(next);
          onValueChange?.(next);
        }}
        onValueCommit={(next) => {
          setDragging(false);
          onValueCommit?.(next);
        }}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          setDragging(true);
        }}
        className="group/slider relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <SliderPrimitive.Track className="fd-track relative h-1.5 grow overflow-hidden rounded-pill bg-surface-active">
          <SliderPrimitive.Range
            className={cn(
              "absolute h-full rounded-pill",
              tone === "flow" && "bg-(image:--fd-gradient-flow) light:bg-(image:--fd-gradient-flowButton)",
              tone === "mint" && "bg-[linear-gradient(90deg,var(--fd-mint-solid),var(--fd-info-solid))]",
              tone === "neutral" && "bg-fg-subtle",
            )}
          />
        </SliderPrimitive.Track>

        {marks?.map((mark) => (
          <span
            key={mark.value}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-x-1/2"
            style={position(mark.value)}
          >
            <span className="absolute top-[-7px] left-1/2 h-3.5 w-px -translate-x-1/2 bg-rim-strong" />
            {mark.label ? <span className="absolute top-3.5 left-1/2 -translate-x-1/2 text-micro whitespace-nowrap text-fg-subtle">{mark.label}</span> : null}
          </span>
        ))}

        {current.map((thumbValue, index) => (
          <SliderPrimitive.Thumb
            key={index}
            aria-label={labelledBy ? undefined : (names[index] ?? ariaLabel)}
            aria-labelledby={labelledBy}
            aria-valuetext={show(thumbValue)}
            onFocus={() => setDragging(false)}
            className={cn(
              "fd-thumb group/thumb relative block size-6 rounded-full bg-white",
              "transition-transform duration-(--fd-spring-tap-dur) ease-spring-tap active:scale-110 data-[disabled]:cursor-not-allowed",
              // 44px hit area without changing the 24px look
              "after:absolute after:-inset-2.5 after:content-['']",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "fd-bubble pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 rounded-lg bg-surface-raised px-2 py-1 text-caption font-semibold whitespace-nowrap text-fg tabular-nums",
                "origin-bottom scale-90 opacity-0 transition-[opacity,transform] duration-(--fd-dur-fast) ease-out",
                "group-focus-visible/thumb:scale-100 group-focus-visible/thumb:opacity-100",
                (dragging || alwaysShowValue) && "scale-100 opacity-100",
              )}
            >
              {show(thumbValue)}
            </span>
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}
