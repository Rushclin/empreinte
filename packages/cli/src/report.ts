import type { SiteResult } from "@empreinte/core";

export type Report = Record<string, SiteResult[]>;

const CSV_COLUMNS = [
  "username",
  "site",
  "url",
  "status",
  "http_status",
  "response_time_ms",
  "context",
] as const;

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(report: Report): string {
  const rows = Object.values(report)
    .flat()
    .map((r) =>
      [r.username, r.site, r.url, r.status, r.httpStatus, r.responseTimeMs, r.context]
        .map(csvCell)
        .join(","),
    );
  return `${[CSV_COLUMNS.join(","), ...rows].join("\n")}\n`;
}

export function toJson(report: Report, generatedAt = new Date()): string {
  return `${JSON.stringify({ generatedAt: generatedAt.toISOString(), results: report }, null, 2)}\n`;
}

/** Sorts results by site name, for stable exports. */
export function sortResults(results: SiteResult[]): SiteResult[] {
  return [...results].sort((a, b) => a.site.localeCompare(b.site, "en", { sensitivity: "base" }));
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
