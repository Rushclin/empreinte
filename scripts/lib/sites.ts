import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { type Site, SiteSchema, siteSlug } from "../../packages/core/src/index.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SITES_DIR = join(ROOT, "sites");
export const SCHEMA_PATH = join(ROOT, "schema/site.schema.json");
export const BUNDLE_PATH = join(ROOT, "packages/core/data/sites.json");
/** Value of the `$schema` key expected in every site file. */
export const SCHEMA_REF = "../schema/site.schema.json";

export interface SiteFile {
  /** Path relative to the repository root, e.g. "sites/github.json". */
  file: string;
  site?: Site;
  errors: string[];
}

export function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Lists the JSON files of `sites/`, sorted. */
export async function listSiteFiles(): Promise<string[]> {
  const entries = await readdir(SITES_DIR);
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => `sites/${entry}`);
}

/** Reads and validates one site file: JSON syntax, schema, file name and `$schema`. */
export async function readSiteFile(file: string): Promise<SiteFile> {
  const absolute = resolve(ROOT, file);
  const relative = absolute.startsWith(`${ROOT}/`) ? absolute.slice(ROOT.length + 1) : file;
  const result: SiteFile = { file: relative, errors: [] };

  let json: unknown;
  try {
    json = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    result.errors.push(`Cannot read JSON: ${(error as Error).message}`);
    return result;
  }

  const parsed = SiteSchema.safeParse(json);
  if (!parsed.success) {
    result.errors.push(...formatZodError(parsed.error));
    return result;
  }

  const { $schema, ...site } = parsed.data;
  const expected = `${siteSlug(site.name)}.json`;
  if (basename(absolute) !== expected) {
    result.errors.push(`File name must be "${expected}" for a site named "${site.name}"`);
  }
  if ($schema !== SCHEMA_REF) {
    result.errors.push(`"$schema" must be "${SCHEMA_REF}"`);
  }
  result.site = site;
  return result;
}

/** Reads every site file and adds cross-file errors (duplicate names or URLs). */
export async function readAllSites(): Promise<SiteFile[]> {
  const files = await Promise.all((await listSiteFiles()).map(readSiteFile));
  const byName = new Map<string, string>();
  const byUrl = new Map<string, string>();
  for (const entry of files) {
    if (!entry.site) continue;
    const name = entry.site.name.toLowerCase();
    const url = entry.site.url.toLowerCase().replace("://www.", "://");
    const sameName = byName.get(name);
    if (sameName) entry.errors.push(`Duplicate site name, already defined in ${sameName}`);
    else byName.set(name, entry.file);
    const sameUrl = byUrl.get(url);
    if (sameUrl) entry.errors.push(`Duplicate profile URL, already defined in ${sameUrl}`);
    else byUrl.set(url, entry.file);
  }
  return files;
}

/** Resolves CLI arguments that are either file paths or site names. */
export async function resolveSiteArgs(args: string[]): Promise<string[]> {
  const files = await listSiteFiles();
  return args.map((arg) => {
    if (arg.endsWith(".json")) return arg;
    const file = `sites/${siteSlug(arg)}.json`;
    if (!files.includes(file)) throw new Error(`Unknown site "${arg}" (looked for ${file})`);
    return file;
  });
}
