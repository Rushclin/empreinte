/**
 * Converts Sherlock's data.json (https://github.com/sherlock-project/sherlock, MIT License)
 * into Empreinte's one-file-per-site format.
 *
 * Usage:
 *   pnpm import-sherlock                                  import every site from Sherlock's repo
 *   pnpm import-sherlock --only GitHub,Reddit             import a few sites
 *   pnpm import-sherlock --source ./data.json --overwrite use a local file, replace existing files
 *   pnpm import-sherlock --dry-run                        print what would be written
 *
 * Imported sites have no tags (Sherlock has none) unless listed in TAGS below.
 * Always run `pnpm check-site` on imported sites before opening a pull request.
 */
import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { SiteSchema, siteSlug } from "../packages/core/src/index.js";
import { formatZodError, ROOT, SCHEMA_REF, SITES_DIR } from "./lib/sites.js";

const SHERLOCK_DATA_URL =
  "https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json";

/** Sherlock name -> Empreinte name, when we prefer another spelling. */
const RENAMES: Record<string, string> = {
  BitBucket: "Bitbucket",
  Chess: "Chess.com",
  "DEV Community": "Dev.to",
  HackerNews: "Hacker News",
  "last.fm": "Last.fm",
  "mastodon.social": "Mastodon.social",
  PyPi: "PyPI",
  "Steam Community (User)": "Steam",
  threads: "Threads",
  Twitter: "X",
};

/** Tags for well-known sites (Empreinte name -> tags). */
const TAGS: Record<string, string[]> = {
  Behance: ["art", "design"],
  Bitbucket: ["dev"],
  Bluesky: ["social"],
  "Chess.com": ["gaming"],
  Codeberg: ["dev"],
  "Dev.to": ["dev", "blogging"],
  "Docker Hub": ["dev"],
  Dribbble: ["art", "design"],
  GitHub: ["dev"],
  GitLab: ["dev"],
  "Hacker News": ["dev", "news"],
  "Hugging Face": ["dev", "ai"],
  Instagram: ["social", "photo"],
  Kaggle: ["dev", "ai"],
  Keybase: ["security"],
  "Last.fm": ["music"],
  Lichess: ["gaming"],
  Linktree: ["social"],
  "Mastodon.social": ["social"],
  Medium: ["blogging"],
  npm: ["dev"],
  Patreon: ["finance", "creator"],
  Pinterest: ["social", "photo"],
  PyPI: ["dev"],
  Reddit: ["social", "forum"],
  SoundCloud: ["music"],
  Spotify: ["music"],
  Steam: ["gaming"],
  Telegram: ["messaging"],
  Threads: ["social"],
  TikTok: ["social", "video"],
  Twitch: ["gaming", "video"],
  X: ["social"],
  YouTube: ["video"],
};

/** Key order of the generated files, for readable diffs. */
const KEY_ORDER = [
  "$schema",
  "name",
  "url",
  "urlMain",
  "urlProbe",
  "errorType",
  "errorMsg",
  "errorCode",
  "regexCheck",
  "username_claimed",
  "request_method",
  "request_payload",
  "headers",
  "tags",
  "isNSFW",
] as const;

/** Sherlock keys that have no equivalent in Empreinte. */
const DROPPED_KEYS = new Set(["__comment__", "errorUrl"]);

export function convertSherlockEntry(
  sherlockName: string,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const name = RENAMES[sherlockName] ?? sherlockName;
  const source: Record<string, unknown> = {
    ...Object.fromEntries(Object.entries(entry).filter(([key]) => !DROPPED_KEYS.has(key))),
    $schema: SCHEMA_REF,
    name,
    tags: TAGS[name] ?? [],
    isNSFW: entry.isNSFW === true,
  };
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) if (source[key] !== undefined) ordered[key] = source[key];
  for (const [key, value] of Object.entries(source)) if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string", default: SHERLOCK_DATA_URL },
      only: { type: "string" },
      overwrite: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const raw = values.source.startsWith("http")
    ? await (await fetch(values.source)).text()
    : await readFile(values.source, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  const only = values.only
    ? new Set(values.only.split(",").map((name) => name.trim().toLowerCase()))
    : undefined;

  let written = 0;
  const writtenPaths: string[] = [];
  let skipped = 0;
  const rejected: string[] = [];

  for (const [sherlockName, entry] of Object.entries(data)) {
    if (sherlockName === "$schema" || entry === null || typeof entry !== "object") continue;
    const converted = convertSherlockEntry(sherlockName, entry as Record<string, unknown>);
    const name = converted.name as string;
    if (only && !only.has(sherlockName.toLowerCase()) && !only.has(name.toLowerCase())) continue;

    const parsed = SiteSchema.safeParse(converted);
    if (!parsed.success) {
      rejected.push(`${sherlockName}: ${formatZodError(parsed.error).join("; ")}`);
      continue;
    }

    const path = join(SITES_DIR, `${siteSlug(name)}.json`);
    if (!values.overwrite && (await exists(path))) {
      skipped++;
      continue;
    }
    const json = `${JSON.stringify(converted, null, 2)}\n`;
    if (values["dry-run"]) {
      console.log(`--- sites/${siteSlug(name)}.json\n${json}`);
    } else {
      await writeFile(path, json);
      writtenPaths.push(path);
    }
    written++;
  }

  console.log(
    `${values["dry-run"] ? "Would write" : "Wrote"} ${written} site(s), skipped ${skipped} existing.`,
  );
  if (rejected.length > 0) {
    console.log(`\n${rejected.length} site(s) rejected by the schema:`);
    for (const line of rejected) console.log(`  - ${line}`);
  }
  if (writtenPaths.length > 0) {
    // JSON.stringify puts each array item on its own line; apply the repository's Biome style.
    execFileSync("pnpm", ["exec", "biome", "format", "--write", ...writtenPaths], {
      cwd: ROOT,
      stdio: "ignore",
    });
  }
  if (!values["dry-run"] && written > 0) {
    console.log("\nNext: run `pnpm check-site <files>` on the new sites, then `pnpm build-sites`.");
  }
}

await main();
