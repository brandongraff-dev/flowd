"use client";

import { useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, type EmptyArtName } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useControllableState } from "@/lib/hooks/use-controllable-state";

export type SortDirection = "asc" | "desc";
export interface SortState {
  id: string;
  direction: SortDirection;
}

export type SortValue = number | string | Date | boolean | null | undefined;

export interface DataColumn<T> {
  id: string;
  /** Column heading (text or a node). Screen readers read `label` when it is set. */
  header: ReactNode;
  /** Plain-text name: the aria label of the sort button and the label of the value in card mode. Defaults to `header` when it is a string. */
  label?: string;
  cell: (row: T, index: number) => ReactNode;
  /** The comparable value of a cell. A column with one is sortable (client-side) unless `sortable` is false. */
  sortValue?: (row: T) => SortValue;
  sortable?: boolean;
  /** Numbers and money are `end`. */
  align?: "start" | "center" | "end";
  /** CSS width ("28%", "9rem"). */
  width?: string;
  /** CSS minimum width ("11rem"): keeps a name column from collapsing to "@maya.mak…". */
  minWidth?: string;
  /** Pin this column to the left while the table scrolls sideways (the row's name). */
  sticky?: boolean;
  /** Hide this column in table mode below the breakpoint (it still appears in card mode). */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** Role in the phone card: `title` (top left), `subtitle` (under it), `value` (top right), `meta` (label and value pairs), `hidden`. Default: first column title, the last end-aligned column value, the rest meta. */
  card?: "title" | "subtitle" | "value" | "meta" | "hidden";
  /** Tabular figures (default true for `end`-aligned columns). */
  tabular?: boolean;
  /** Let this column wrap onto several lines. Cells stay on one line by default (dense rows; a long value truncates). */
  wrap?: boolean;
  className?: string;
}

export interface RowAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
}

export interface DataTableProps<T> {
  /** REQUIRED: names the table for assistive tech ("Submissions in review"). Not shown. */
  caption: string;
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Human name of a row for assistive tech ("Select @maya.k", "Actions for Nap Nest hook B"). Defaults to the row id. */
  getRowLabel?: (row: T) => string;
  /** Sort state. Controlled with `onSortChange`, or leave both off for built-in client-side sorting. */
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Rows come already sorted (server-side sorting): the table shows the arrows but does not reorder. */
  manualSort?: boolean;
  /** Checkbox column with a tri-state header. */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  /** Renders the bulk bar when something is selected: "3 selected" plus these actions. */
  bulkActions?: (selectedIds: readonly string[]) => ReactNode;
  /** Per-row actions in a trailing menu. */
  rowActions?: (row: T) => readonly RowAction[];
  /** Makes rows clickable (and Enter-activatable). Clicks on buttons, links and checkboxes inside a row are ignored. */
  onRowClick?: (row: T) => void;
  /** `comfortable` rows are 56px, `compact` 44px (dense review tables). */
  density?: "comfortable" | "compact";
  /** Below 768px: stacked cards (default) or a sideways-scrolling table. */
  mobile?: "cards" | "scroll";
  loading?: boolean;
  loadingRows?: number;
  /** Designed empty state: never a blank table. */
  empty?: { art?: EmptyArtName; title: string; description?: string; action?: ReactNode };
  /** Pin the header while the body scrolls. Give `maxHeight` for the scroll area. */
  stickyHeader?: boolean;
  maxHeight?: string;
  /** Above the table: filters, search, a view switch. */
  toolbar?: ReactNode;
  /** Below the table: `<Pagination/>`. */
  footer?: ReactNode;
  /** `card` (default) is L1 quiet glass; `none` when the table sits in a card you already have. */
  surface?: "card" | "none";
  className?: string;
}

const HIDE: Record<NonNullable<DataColumn<unknown>["hideBelow"]>, string> = {
  sm: "max-sm:hidden",
  md: "max-md:hidden",
  lg: "max-lg:hidden",
  xl: "max-xl:hidden",
};

function compare(a: SortValue, b: SortValue): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

function labelOf<T>(column: DataColumn<T>): string {
  return column.label ?? (typeof column.header === "string" ? column.header : column.id);
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, select, textarea, [role='checkbox'], [role='menuitem'], [data-row-ignore]") !== null;
}

function RowMenu({ actions, name }: { actions: readonly RowAction[]; name: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="plain" size="sm" label={`Actions for ${name}`} icon={<Ellipsis />} tooltip={false} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <div key={action.id}>
            {action.separated ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem icon={action.icon} destructive={action.destructive} disabled={action.disabled} onSelect={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The data table. Sortable (click, then click again to reverse, then clear; `aria-sort` is set), a header that stays put,
 * row selection with a tri-state header, a per-row action menu, comfortable and compact densities, a pinned first column,
 * secondary columns that drop out on narrow screens, and below 768px the rows become cards (the same cells, re-laid out)
 * instead of a squeezed table. Loading is skeleton rows; empty is a designed state with a next step. Numbers are tabular
 * and right-aligned.
 *
 * Built for the highest-frequency screens: no animation on rows beyond hover and a 120 ms selection wash.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  getRowLabel,
  sort: sortProp,
  defaultSort = null,
  onSortChange,
  manualSort = false,
  selectable = false,
  selected: selectedProp,
  onSelectedChange,
  bulkActions,
  rowActions,
  onRowClick,
  density = "comfortable",
  mobile = "cards",
  loading = false,
  loadingRows = 6,
  empty,
  stickyHeader = true,
  maxHeight,
  toolbar,
  footer,
  surface = "card",
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useControllableState<SortState | null>({ value: sortProp, defaultValue: defaultSort, onChange: onSortChange });
  const [selected, setSelected] = useControllableState<ReadonlySet<string>>({ value: selectedProp, defaultValue: new Set<string>(), onChange: (next) => onSelectedChange?.(new Set(next)) });

  const sorted = useMemo(() => {
    if (manualSort || !sort) return rows;
    const column = columns.find((entry) => entry.id === sort.id);
    if (!column?.sortValue) return rows;
    const read = column.sortValue;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(read(a), read(b)));
  }, [rows, columns, sort, manualSort]);

  const ids = useMemo(() => sorted.map(getRowId), [sorted, getRowId]);
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;

  const toggleAll = (): void => setSelected(allSelected ? new Set() : new Set(ids));
  const toggleRow = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const cycleSort = (column: DataColumn<T>): void => {
    if (!sort || sort.id !== column.id) setSort({ id: column.id, direction: "asc" });
    else if (sort.direction === "asc") setSort({ id: column.id, direction: "desc" });
    else setSort(null);
  };

  const rowHeight = density === "compact" ? "h-11" : "h-14";
  const cellPad = density === "compact" ? "px-3.5 py-1.5" : "px-4 py-2.5";
  const hasActions = Boolean(rowActions);
  const empty_ = !loading && sorted.length === 0;

  // card-mode column roles
  const cardColumns = useMemo(() => {
    const explicit = (role: NonNullable<DataColumn<T>["card"]>) => columns.filter((column) => column.card === role);
    const hidden = new Set(explicit("hidden").map((column) => column.id));
    const visibleColumns = columns.filter((column) => !hidden.has(column.id));
    const title = explicit("title")[0] ?? visibleColumns[0];
    const subtitle = explicit("subtitle")[0];
    const value = explicit("value")[0] ?? [...visibleColumns].reverse().find((column) => column.align === "end" && column.id !== title?.id);
    const meta = visibleColumns.filter((column) => column.id !== title?.id && column.id !== subtitle?.id && column.id !== value?.id && column.card !== "title" && column.card !== "value");
    return { title, subtitle, value, meta };
  }, [columns]);

  const bulkBar =
    selectable && selectedCount > 0 ? (
      <div role="region" aria-label="Selection" className="flex flex-wrap items-center gap-3 border-b border-divider bg-accent-soft px-4 py-2.5">
        <p className="text-body-sm font-semibold text-fg tabular-nums">{selectedCount} selected</p>
        <div className="flex flex-wrap items-center gap-2">{bulkActions?.(ids.filter((id) => selected.has(id)))}</div>
        <button type="button" onClick={() => setSelected(new Set())} className="ml-auto rounded-md px-1.5 py-1 text-caption font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
          Clear selection
        </button>
      </div>
    ) : null;

  // Table rows are the solid `surface` (BRAND.md 6.3): dense data stays legible and a pinned column matches the rows it overlaps.
  const tableView = (
    <div className={cn("overflow-auto bg-surface", mobile === "cards" ? "max-md:hidden" : "")} style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-left text-body-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className={cn("w-12 border-b border-divider bg-surface-raised pr-0 pl-4", stickyHeader && "sticky top-0 z-(--fd-z-raised)")}>
                <Checkbox
                  aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                  checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  disabled={ids.length === 0}
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const sortable = column.sortable ?? Boolean(column.sortValue);
              const active = sort?.id === column.id;
              const SortIcon = !active ? ArrowUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={active ? (sort?.direction === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}
                  style={{ width: column.width, minWidth: column.minWidth }}
                  className={cn(
                    "border-b border-divider bg-surface-raised px-4 py-2.5 text-micro font-semibold whitespace-nowrap text-fg-muted",
                    density === "compact" && "px-3.5",
                    column.align === "end" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                    stickyHeader && "sticky top-0 z-(--fd-z-raised)",
                    column.sticky && "left-0 z-(--fd-z-sticky)",
                    column.hideBelow && HIDE[column.hideBelow],
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => cycleSort(column)}
                      aria-label={`Sort by ${labelOf(column)}${active ? (sort?.direction === "asc" ? ", ascending" : ", descending") : ""}`}
                      className={cn(
                        "-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg",
                        column.align === "end" && "flex-row-reverse",
                        active && "text-fg",
                      )}
                    >
                      {column.header}
                      <SortIcon aria-hidden="true" className={cn("size-3.5", active ? "text-accent" : "text-fg-subtle")} strokeWidth={2} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {hasActions ? (
              <th scope="col" className={cn("w-14 border-b border-divider bg-surface-raised", stickyHeader && "sticky top-0 z-(--fd-z-raised)")}>
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                <tr key={rowIndex} className={rowHeight}>
                  {selectable ? <td className="pl-4"><Skeleton className="size-5 rounded-md" /></td> : null}
                  {columns.map((column, columnIndex) => (
                    <td key={column.id} className={cn(cellPad, "border-b border-divider", column.hideBelow && HIDE[column.hideBelow])}>
                      <Skeleton shape="text" className={cn("h-4", columnIndex === 0 ? "w-3/4" : "w-1/2", column.align === "end" && "ml-auto")} />
                    </td>
                  ))}
                  {hasActions ? <td /> : null}
                </tr>
              ))
            : sorted.map((row, rowIndex) => {
                const id = getRowId(row);
                const isSelected = selected.has(id);
                const actions = rowActions?.(row);
                const name = getRowLabel?.(row) ?? id;
                return (
                  <tr
                    key={id}
                    data-selected={isSelected ? "" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? (event: MouseEvent) => (isInteractive(event.target) ? undefined : onRowClick(row)) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event: KeyboardEvent) => {
                            if (event.key === "Enter" && event.target === event.currentTarget) onRowClick(row);
                          }
                        : undefined
                    }
                    className={cn(
                      rowHeight,
                      "group/row transition-colors duration-(--fd-dur-instant) ease-standard hover:bg-surface-hover",
                      isSelected && "bg-accent-soft hover:bg-accent-soft",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {selectable ? (
                      <td className="w-12 border-b border-divider pr-0 pl-4">
                        <Checkbox aria-label={`Select ${name}`} checked={isSelected} onCheckedChange={() => toggleRow(id)} />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          cellPad,
                          "border-b border-divider",
                          column.align === "end" ? "text-right" : column.align === "center" ? "text-center" : "text-left",
                          (column.tabular ?? column.align === "end") && "tabular-nums",
                          !column.wrap && "whitespace-nowrap",
                          column.sticky && "sticky left-0 z-(--fd-z-content) bg-surface group-hover/row:bg-surface-raised",
                          column.sticky && isSelected && "bg-[image:linear-gradient(var(--fd-accent-soft),var(--fd-accent-soft))]",
                          column.hideBelow && HIDE[column.hideBelow],
                          column.className,
                        )}
                      >
                        {column.cell(row, rowIndex)}
                      </td>
                    ))}
                    {hasActions ? <td className="w-14 border-b border-divider pr-2 text-right">{actions && actions.length > 0 ? <RowMenu actions={actions} name={name} /> : null}</td> : null}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );

  const cardView =
    mobile === "cards" ? (
      <ul className="grid divide-y divide-divider md:hidden" aria-label={caption} aria-busy={loading || undefined}>
        {loading
          ? Array.from({ length: Math.min(loadingRows, 4) }, (_, index) => (
              <li key={index} className="grid gap-2.5 px-4 py-4">
                <Skeleton shape="text" className="w-2/3" />
                <Skeleton shape="text" className="h-3 w-1/2" />
              </li>
            ))
          : sorted.map((row, rowIndex) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);
              const actions = rowActions?.(row);
              const { title, subtitle, value, meta } = cardColumns;
              return (
                <li
                  key={id}
                  data-selected={isSelected ? "" : undefined}
                  onClick={onRowClick ? (event) => (isInteractive(event.target) ? undefined : onRowClick(row)) : undefined}
                  className={cn("grid gap-3 px-4 py-3.5", isSelected && "bg-accent-soft", onRowClick && "cursor-pointer active:bg-surface-hover")}
                >
                  <div className="flex items-start gap-3">
                    {selectable ? <Checkbox aria-label={`Select ${getRowLabel?.(row) ?? id}`} checked={isSelected} onCheckedChange={() => toggleRow(id)} className="mt-1" /> : null}
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      {title ? <div className="min-w-0 text-body-sm font-semibold text-fg">{title.cell(row, rowIndex)}</div> : null}
                      {subtitle ? <div className="min-w-0 text-caption text-fg-subtle">{subtitle.cell(row, rowIndex)}</div> : null}
                    </div>
                    {value ? <div className="shrink-0 text-right text-body-sm font-semibold text-fg tabular-nums">{value.cell(row, rowIndex)}</div> : null}
                    {actions && actions.length > 0 ? <RowMenu actions={actions} name={getRowLabel?.(row) ?? id} /> : null}
                  </div>
                  {meta.length > 0 ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-caption">
                      {meta.map((column) => (
                        <div key={column.id} className="grid min-w-0 gap-0.5">
                          <dt className="text-fg-subtle">{labelOf(column)}</dt>
                          <dd className="min-w-0 truncate font-medium text-fg-muted">{column.cell(row, rowIndex)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
      </ul>
    ) : null;

  const body = (
    <>
      {toolbar ? <div className="flex flex-wrap items-center gap-3 border-b border-divider px-4 py-3">{toolbar}</div> : null}
      {bulkBar}
      {empty_ ? (
        <div className="px-4 py-6">
          <EmptyState art={empty?.art ?? "inbox"} title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />
        </div>
      ) : (
        <>
          {tableView}
          {cardView}
        </>
      )}
      {footer ? <div className="border-t border-divider px-4 py-3">{footer}</div> : null}
    </>
  );

  if (surface === "none") return <div className={cn("min-w-0", className)}>{body}</div>;
  return (
    <GlassCard padding="none" className={cn("min-w-0 overflow-hidden", className)}>
      {body}
    </GlassCard>
  );
}
