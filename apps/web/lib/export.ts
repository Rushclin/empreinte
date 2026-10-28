import type { SiteResult } from "@empreinte/core";

const cell = (value: unknown) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function resultsToCsv(results: SiteResult[]): string {
  const header = "username,site,url,status,http_status,response_time_ms,context";
  const rows = results.map((r) =>
    [r.username, r.site, r.url, r.status, r.httpStatus, r.responseTimeMs, r.context]
      .map(cell)
      .join(","),
  );
  return `${[header, ...rows].join("\n")}\n`;
}

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
