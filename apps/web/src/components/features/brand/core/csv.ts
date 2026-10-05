/**
 * CSV for the brand's exports (ledger, invoices). Pure: build the text here, hand it to `downloadCsv` in an event handler.
 * Cells that start with =, +, - or @ are prefixed with an apostrophe so a spreadsheet never runs them as a formula (CSV injection).
 */

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text with CRLF line ends (what spreadsheets expect). The first row is the header. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

/** Cents as a plain decimal for a spreadsheet: 123456 gives "1234.56" (no symbol, no thousands separator). */
export const csvMoney = (cents: number): string => (cents / 100).toFixed(2);

/** Saves text as a file in the browser. Call it from a click handler. */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
