"use client";

export type CsvCell = string | number | null | undefined;

/** One CSV value: quoted when it holds a comma, a quote or a line break; a formula-looking start is defused so a spreadsheet never runs it. */
function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text (header row first). Money columns are written in dollars by the caller. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

/** Saves text as a file in the browser: a Blob and a temporary link, no server involved. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Cents as a plain dollar figure for a spreadsheet: 12345 -> "123.45". */
export function dollars(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}
