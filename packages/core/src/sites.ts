import bundled from "../data/sites.json" with { type: "json" };
import { parseSite, type Site } from "./schema.js";
import type { SearchOptions } from "./types.js";

let cache: Site[] | undefined;

/**
 * Validates a list of site definitions. Throws an error naming the first invalid site.
 */
export function parseSites(input: unknown): Site[] {
  if (!Array.isArray(input)) throw new TypeError("Site list must be an array");
  return input.map((entry, index) => {
    try {
      return parseSite(entry);
    } catch (error) {
      const name = (entry as { name?: unknown } | null)?.name;
      const label = typeof name === "string" ? `"${name}"` : `#${index}`;
      throw new Error(`Invalid site definition ${label}: ${(error as Error).message}`);
    }
  });
}

/** Returns the bundled, validated list of supported sites, sorted by name. */
export function loadSites(): Site[] {
  cache ??= parseSites(bundled).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  return cache;
}

/** Applies the `sites`, `tags` and `includeNSFW` filters of a search. */
export function filterSites(
  sites: Site[],
  options: Pick<SearchOptions, "sites" | "tags" | "includeNSFW"> = {},
): Site[] {
  const names = options.sites?.length
    ? new Set(options.sites.map((name) => name.toLowerCase()))
    : undefined;
  const tags = options.tags?.length
    ? new Set(options.tags.map((tag) => tag.toLowerCase()))
    : undefined;

  return sites.filter((site) => {
    if (names) {
      // Asking for a site by name includes it even if it is NSFW.
      return names.has(site.name.toLowerCase());
    }
    if (site.isNSFW && !options.includeNSFW) return false;
    if (tags && !site.tags.some((tag) => tags.has(tag))) return false;
    return true;
  });
}

/** All tags used by a list of sites, sorted. */
export function listTags(sites: Site[] = loadSites()): string[] {
  return [...new Set(sites.flatMap((site) => site.tags))].sort();
}
