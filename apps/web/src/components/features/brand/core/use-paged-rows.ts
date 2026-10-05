"use client";

import { useMemo, useState } from "react";
import type { DataColumn, SortState, SortValue } from "@/components/shell/data-table";

function comparable(value: SortValue): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/** Ascending order of two sort values; empty values always go last, whichever way the column is sorted. */
function compare(a: SortValue, b: SortValue): number {
  const x = comparable(a);
  const y = comparable(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "en", { numeric: true });
}

export interface PagedRows<T> {
  /** The rows of the current page, already in sort order (pass `manualSort` to the table). */
  pageRows: readonly T[];
  sort: SortState | null;
  setSort: (sort: SortState | null) => void;
  /** 1-based, clamped to the page count. */
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  total: number;
}

/**
 * Sorting and paging for a long `DataTable`, done here so a sort covers every row and not just the visible page. The table gets `manualSort`,
 * `sort`, `onSortChange` and the page of rows; a change of sort or of the source rows returns to page one.
 */
export function usePagedRows<T>(rows: readonly T[], columns: readonly DataColumn<T>[], pageSize: number, initialSort: SortState | null = null): PagedRows<T> {
  const [sort, setSortState] = useState<SortState | null>(initialSort);
  const [requested, setPage] = useState(1);
  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.id === sort.id) : undefined;
    const by = column?.sortValue;
    if (!sort || !by) return rows;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = comparable(by(a));
      const y = comparable(by(b));
      // Empty values stay last in both directions.
      if (x === null || y === null) return compare(by(a), by(b));
      return direction * compare(by(a), by(b));
    });
  }, [rows, columns, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(requested, pageCount);
  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);
  return {
    pageRows,
    sort,
    setSort: (next) => {
      setSortState(next);
      setPage(1);
    },
    page,
    setPage,
    pageCount,
    total: sorted.length,
  };
}
