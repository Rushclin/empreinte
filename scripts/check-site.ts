/**
 * Tests site definitions against the real website.
 *
 * For each site, two requests are made:
 *   - with `username_claimed`, which must be reported as "claimed"
 *   - with a random 20-character username, which must be reported as "available"
 *
 * Usage:
 *   pnpm check-site sites/github.json sites/gitlab.json
 *   pnpm check-site GitHub "Hacker News"
 *   pnpm check-site --all [--markdown] [--timeout 20] [--proxy http://...]
 *
 * Exits with code 1 if any site fails.
 */
import { randomInt } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";
import pLimit from "p-limit";
import {
  checkSite,
  type Site,
  type SiteResult,
  type SiteStatus,
} from "../packages/core/src/index.js";
import { listSiteFiles, readSiteFile, resolveSiteArgs } from "./lib/sites.js";

const RANDOM_LENGTH = 20;
const RETRIES = 2;
const RETRY_DELAY_MS = 2_000;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Tried in this order: some sites require a separator (e.g. ResearchGate: `\w+_\w+`). */
const SEPARATORS = ["", "_", "-", "."];

/**
 * A random username that the site accepts (`regexCheck`). Starts at 20 characters and
 * gets shorter if the site does not allow such long usernames.
 */
export function randomUsername(site: Pick<Site, "regexCheck">): string {
  const regex = site.regexCheck ? new RegExp(site.regexCheck) : undefined;
  for (const separator of SEPARATORS) {
    for (let length = RANDOM_LENGTH; length >= 3; length--) {
      for (let attempt = 0; attempt < 20; attempt++) {
        // A letter first: many sites require usernames to start with one.
        let candidate = ALPHABET[randomInt(26)] ?? "a";
        while (candidate.length < length) candidate += ALPHABET[randomInt(ALPHABET.length)];
        if (separator) {
          const middle = Math.floor(length / 2);
          candidate = `${candidate.slice(0, middle)}${separator}${candidate.slice(middle + 1)}`;
        }
        if (!regex || regex.test(candidate)) return candidate;
      }
    }
  }
  throw new Error(`Cannot generate a random username matching ${site.regexCheck}`);
}

interface Probe {
  username: string;
  expected: SiteStatus;
  result: SiteResult;
  ok: boolean;
}

interface Report {
  file: string;
  name: string;
  errors: string[];
  probes: Probe[];
  ok: boolean;
}

const clean = (text: string, max: number) =>
  text.replace(/\s+/g, " ").trim().slice(0, max) || "(empty)";

async function checkFile(
  file: string,
  options: { timeoutMs: number; proxy?: string },
): Promise<Report> {
  const entry = await readSiteFile(file);
  if (!entry.site) {
    return { file: entry.file, name: file, errors: entry.errors, probes: [], ok: false };
  }
  const site = entry.site;
  let random: string;
  try {
    random = randomUsername(site);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { file: entry.file, name: site.name, errors: [message], probes: [], ok: false };
  }
  const cases: Array<[string, SiteStatus]> = [
    [site.username_claimed, "claimed"],
    [random, "available"],
  ];
  const probes: Probe[] = [];
  for (const [username, expected] of cases) {
    let result = await checkSite(site, username, { ...options, debug: true });
    // Network errors and timeouts are often transient: retry them before reporting a failure.
    for (let retry = 0; retry < RETRIES && result.status === "unknown"; retry++) {
      await setTimeout(RETRY_DELAY_MS);
      result = await checkSite(site, username, { ...options, debug: true });
    }
    probes.push({ username, expected, result, ok: result.status === expected });
  }
  return {
    file: entry.file,
    name: site.name,
    errors: entry.errors,
    probes,
    ok: entry.errors.length === 0 && probes.every((probe) => probe.ok),
  };
}

function printText(report: Report): void {
  const mark = report.ok ? "\u001b[32m✓ PASS\u001b[0m" : "\u001b[31m✗ FAIL\u001b[0m";
  console.log(`\n${mark}  ${report.name}  (${report.file})`);
  for (const error of report.errors) console.log(`    schema: ${error}`);
  for (const { username, expected, result, ok } of report.probes) {
    const debug = result.debug;
    console.log(`  ${ok ? "✓" : "✗"} ${username}  expected ${expected}, got ${result.status}`);
    console.log(
      `      ${debug?.method ?? "-"} ${debug?.requestUrl ?? result.url} -> HTTP ${result.httpStatus ?? "-"}` +
        (result.responseTimeMs !== undefined ? ` in ${result.responseTimeMs} ms` : ""),
    );
    if (debug?.location) console.log(`      redirect: ${debug.location}`);
    if (result.context) console.log(`      context: ${result.context}`);
    if (debug) console.log(`      body: ${clean(debug.bodyExcerpt, 200)}`);
  }
}

function toMarkdown(reports: Report[]): string {
  const failed = reports.filter((report) => !report.ok);
  const lines = [
    `### Site check: ${reports.length - failed.length}/${reports.length} passed`,
    "",
    "| Site | Verdict | Claimed username | Random username |",
    "| --- | --- | --- | --- |",
  ];
  const cell = (probe?: Probe) =>
    probe
      ? `${probe.ok ? "✅" : "❌"} \`${probe.result.status}\` (HTTP ${probe.result.httpStatus ?? "-"})`
      : "-";
  for (const report of reports) {
    lines.push(
      `| ${report.name} | ${report.ok ? "✅ pass" : "❌ fail"} | ${cell(report.probes[0])} | ${cell(report.probes[1])} |`,
    );
  }
  for (const report of failed) {
    lines.push("", `<details><summary><b>${report.name}</b> — details</summary>`, "");
    for (const error of report.errors) lines.push(`- schema: ${error}`);
    for (const { username, expected, result } of report.probes) {
      lines.push(
        `- \`${username}\`: expected \`${expected}\`, got \`${result.status}\`` +
          ` — ${result.debug?.method ?? ""} ${result.debug?.requestUrl ?? result.url}` +
          ` → HTTP ${result.httpStatus ?? "-"}${result.context ? ` (${result.context})` : ""}`,
      );
      if (result.debug) {
        lines.push(
          "",
          "  ```",
          `  ${clean(result.debug.bodyExcerpt, 300).replaceAll("`", "'")}`,
          "  ```",
        );
      }
    }
    lines.push("", "</details>");
  }
  lines.push(
    "",
    "_Some sites block requests coming from CI servers (WAF, rate limiting). If a site works locally with `pnpm check-site`, mention it in the pull request._",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: "boolean", default: false },
      markdown: { type: "boolean", default: false },
      timeout: { type: "string", default: "20" },
      proxy: { type: "string" },
      concurrency: { type: "string", default: "8" },
    },
  });

  const files = values.all ? await listSiteFiles() : await resolveSiteArgs(positionals);
  if (files.length === 0) {
    console.error("Usage: pnpm check-site <sites/name.json | Site name>... | --all");
    process.exit(2);
  }

  const options = { timeoutMs: Number(values.timeout) * 1000, proxy: values.proxy };
  const limit = pLimit(Number(values.concurrency));
  const reports = await Promise.all(
    files.map((file) =>
      limit(async () => {
        const report = await checkFile(file, options);
        if (!values.markdown) printText(report);
        return report;
      }),
    ),
  );

  const failed = reports.filter((report) => !report.ok);
  if (values.markdown) {
    process.stdout.write(toMarkdown(reports));
  } else {
    console.log(`\n${reports.length - failed.length}/${reports.length} site(s) passed.`);
    if (failed.length > 0) console.log(`Failed: ${failed.map((r) => r.name).join(", ")}`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
