"use client";

import type { ComponentPropsWithRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { Select } from "@/components/ui/select";
import { pageWindow } from "./pagination-window";


export interface PaginationProps extends Omit<ComponentPropsWithRef<"nav">, "children" | "onChange"> {
  /** Current page, 1-based. */
  page: number;
  /** Number of pages. */
  pageCount: number;
  onPageChange: (page: number) => void;
  /** With `total` and `pageSize` the range reads "Showing 21 to 40 of 312". */
  total?: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Pages shown either side of the current one (default 1). */
  siblings?: number;
  /** Noun for the range text ("submissions"). */
  noun?: string;
}

/**
 * Pagination: previous and next, numbered pages with gaps, the current range, and an optional page-size select. Below 640px it
 * collapses to "Page 3 of 16" with the two arrows, which is all a thumb needs. Every control is a real button (44px on
 * touch) and the current page carries `aria-current`.
 */
export function Pagination({ page, pageCount, onPageChange, total, pageSize, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100], siblings = 1, noun = "results", className, ...props }: PaginationProps) {
  const current = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  const first = total !== undefined && pageSize ? (current - 1) * pageSize + 1 : null;
  const last = total !== undefined && pageSize ? Math.min(current * pageSize, total) : null;
  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)} {...props}>
      <p className="text-caption text-fg-subtle tabular-nums" aria-live="polite">
        {first !== null && last !== null && total !== undefined ? (
          <>
            Showing <span className="font-semibold text-fg-muted">{total === 0 ? 0 : first}</span> to <span className="font-semibold text-fg-muted">{last}</span> of{" "}
            <span className="font-semibold text-fg-muted">{total.toLocaleString("en-US")}</span> {noun}
          </>
        ) : (
          <>
            Page <span className="font-semibold text-fg-muted">{current}</span> of {Math.max(pageCount, 1)}
          </>
        )}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange && pageSize ? (
          <Select
            size="sm"
            aria-label="Rows per page"
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            options={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} per page` }))}
            menuWidth="auto"
            className="hidden w-36 sm:inline-flex"
          />
        ) : null}
        <div className="flex items-center gap-1">
          <IconButton variant="secondary" size="sm" label="Previous page" icon={<ChevronLeft />} disabled={current <= 1} onClick={() => onPageChange(current - 1)} />
          <ul className="hidden items-center gap-1 sm:flex">
            {pageWindow(current, pageCount, siblings).map((entry, index) =>
              entry === null ? (
                <li key={`gap-${index}`} aria-hidden="true" className="grid size-8 place-items-center text-caption text-fg-subtle">
                  …
                </li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    aria-label={`Page ${entry}`}
                    aria-current={entry === current ? "page" : undefined}
                    onClick={() => onPageChange(entry)}
                    className={cn(
                      "grid h-8 min-w-8 place-items-center rounded-pill px-2 text-caption font-semibold tabular-nums transition-colors duration-(--fd-dur-fast) ease-standard active:scale-[0.96] pointer-coarse:h-11 pointer-coarse:min-w-11",
                      entry === current ? "bg-surface-active text-fg shadow-[inset_0_0_0_1px_var(--fd-rim-strong)]" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {entry}
                  </button>
                </li>
              ),
            )}
          </ul>
          <IconButton variant="secondary" size="sm" label="Next page" icon={<ChevronRight />} disabled={current >= pageCount} onClick={() => onPageChange(current + 1)} />
        </div>
      </div>
    </nav>
  );
}
