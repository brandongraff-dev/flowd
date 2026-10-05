/** Small formatters shared by the Market, setup and developer pages. Pure and server-safe. */

/** 0.5 to "under an hour", 7 to "about 7 hours", 30 to "about 30 hours", 80 to "about 3 days". Fill times and expiries read in the unit people think in. */
export function hoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "unknown";
  if (hours < 1) return "under an hour";
  if (hours < 48) return `about ${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `about ${days} days`;
}

/** The same, but for a deadline: "3 days left", "7 hours left", "closing within the hour". */
export function timeLeftLabel(hours: number | null): string {
  if (hours === null) return "";
  if (hours < 1) return "closing within the hour";
  if (hours < 48) return `${Math.round(hours)} ${Math.round(hours) === 1 ? "hour" : "hours"} left`;
  return `${Math.round(hours / 24)} days left`;
}

/** An ISO timestamp as the hours between two instants (positive when `to` is later). Mirrors the engine's helper without importing it into client bundles twice. */
export function hoursUntil(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

/** "ezra.explains" style slug for file names. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Quotes a CSV cell. */
export function csvCell(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Starts a text download in the browser. Client-only; a no-op during render. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
