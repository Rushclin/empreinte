import { writeFile } from "node:fs/promises";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  expandUsername,
  filterSites,
  loadSites,
  type SiteResult,
  search,
} from "@empreinte/core";
import { type ArgsDef, defineCommand, type ParsedArgs } from "citty";
import ora from "ora";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { collectFlag, positiveNumber } from "./args.js";
import { formatDuration, type Report, sortResults, toCsv, toJson } from "./report.js";

const RESPONSIBLE_USE =
  "Responsible use: only search for usernames you own or have a legitimate reason to look up. " +
  "Respect the terms of service of each site and the privacy of others.";

const STATUS_LABEL: Record<SiteResult["status"], (text: string) => string> = {
  claimed: pc.green,
  available: pc.dim,
  unknown: pc.yellow,
  illegal: pc.dim,
  waf: pc.magenta,
};

function formatResult(result: SiteResult): string {
  if (result.status === "claimed") {
    return `${pc.green("[+]")} ${pc.bold(result.site)}: ${result.url}`;
  }
  const label = STATUS_LABEL[result.status](result.status);
  const context = result.context ? pc.dim(` (${result.context})`) : "";
  return `${pc.dim("[-]")} ${result.site}: ${label}${context}`;
}

function listSites(): void {
  const sites = loadSites();
  const width = Math.max(...sites.map((site) => site.name.length));
  for (const site of sites) {
    const flags = [site.tags.join(", "), site.isNSFW ? pc.red("nsfw") : ""].filter(Boolean);
    console.log(`${site.name.padEnd(width)}  ${pc.dim(site.urlMain)}  ${pc.cyan(flags.join(" "))}`);
  }
  console.log(pc.dim(`\n${sites.length} sites`));
}

const argsDef = {
  usernames: {
    type: "positional",
    required: false,
    description: 'One or more usernames. "{?}" expands to "_", "-" and "." (john{?}doe).',
  },
  site: {
    type: "string",
    alias: "s",
    description: "Only check this site (repeatable or comma-separated)",
  },
  tag: {
    type: "string",
    alias: "t",
    description: "Only check sites with this tag (repeatable or comma-separated)",
  },
  nsfw: { type: "boolean", default: false, description: "Include NSFW sites" },
  timeout: {
    type: "string",
    default: String(DEFAULT_TIMEOUT_MS / 1000),
    description: "Timeout of each request, in seconds",
  },
  concurrency: {
    type: "string",
    default: String(DEFAULT_CONCURRENCY),
    description: "Maximum number of simultaneous requests",
  },
  proxy: { type: "string", description: "HTTP(S) proxy URL, e.g. http://127.0.0.1:8080" },
  "print-all": {
    type: "boolean",
    default: false,
    description: "Also print sites where the account was not found, errors and WAF blocks",
  },
  json: { type: "string", valueHint: "file", description: "Write all results to a JSON file" },
  csv: { type: "string", valueHint: "file", description: "Write all results to a CSV file" },
  "list-sites": { type: "boolean", default: false, description: "List supported sites and exit" },
} as const satisfies ArgsDef;

export const main = defineCommand({
  meta: {
    name: "empreinte",
    version: pkg.version,
    description: `Find where a username exists across hundreds of websites.\n\n${RESPONSIBLE_USE}`,
  },
  args: argsDef,
  async run(context) {
    try {
      await run(context);
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      process.exitCode = 1;
    }
  },
});

type RunContext = { args: ParsedArgs<typeof argsDef>; rawArgs: string[] };

async function run({ args, rawArgs }: RunContext): Promise<void> {
  if (args["list-sites"]) {
    listSites();
    return;
  }

  const usernames = args._.flatMap((username) => expandUsername(String(username)));
  if (usernames.length === 0) {
    throw new Error("Missing username. Run `empreinte --help` for usage.");
  }

  const sitesFilter = collectFlag(rawArgs, ["site", "s"]);
  const tags = collectFlag(rawArgs, ["tag", "t"]);
  const timeoutMs = positiveNumber(args.timeout, "timeout", DEFAULT_TIMEOUT_MS / 1000) * 1000;
  const concurrency = positiveNumber(args.concurrency, "concurrency", DEFAULT_CONCURRENCY);
  const options = {
    sites: sitesFilter,
    tags,
    includeNSFW: args.nsfw,
    timeoutMs,
    concurrency,
    proxy: args.proxy || undefined,
  };

  const total = filterSites(loadSites(), options).length;
  if (total === 0) throw new Error("No site matches the --site / --tag filters.");
  const unknownSites = sitesFilter.filter(
    (name) => !loadSites().some((site) => site.name.toLowerCase() === name.toLowerCase()),
  );
  if (unknownSites.length > 0) {
    console.warn(pc.yellow(`Unknown site(s): ${unknownSites.join(", ")}`));
  }

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());

  const report: Report = {};
  for (const username of usernames) {
    if (controller.signal.aborted) break;
    console.log(`\n${pc.cyan("[*]")} Checking ${pc.bold(username)} on ${total} sites`);
    const spinner = ora({ text: `0/${total}`, discardStdin: false }).start();
    const started = performance.now();
    const results: SiteResult[] = [];

    for await (const result of search(username, { ...options, signal: controller.signal })) {
      results.push(result);
      if (result.status === "claimed" || args["print-all"]) {
        spinner.clear();
        console.log(formatResult(result));
      }
      spinner.text = `${results.length}/${total}`;
    }
    spinner.stop();

    const found = results.filter((r) => r.status === "claimed").length;
    const summary = `${found} found / ${results.length} checked in ${formatDuration(performance.now() - started)}`;
    console.log(`${pc.cyan("[*]")} ${username}: ${found > 0 ? pc.green(summary) : summary}`);
    report[username] = sortResults(results);
  }

  if (controller.signal.aborted) console.log(pc.yellow("\nSearch cancelled."));
  if (args.json) {
    await writeFile(args.json, toJson(report));
    console.log(pc.dim(`Results written to ${args.json}`));
  }
  if (args.csv) {
    await writeFile(args.csv, toCsv(report));
    console.log(pc.dim(`Results written to ${args.csv}`));
  }
}
