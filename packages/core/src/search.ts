import pLimit from "p-limit";
import { checkSite } from "./check.js";
import { filterSites, loadSites } from "./sites.js";
import type { SearchOptions, SiteResult } from "./types.js";

export const DEFAULT_CONCURRENCY = 20;

/**
 * Checks `username` on every selected site and yields results as soon as they arrive
 * (completion order, not site order).
 *
 * Stopping the iteration early (`break`) or aborting `options.signal` cancels the pending
 * requests; the iterator then ends without error.
 */
export async function* search(
  username: string,
  options: SearchOptions = {},
): AsyncGenerator<SiteResult, void, undefined> {
  const sites = filterSites(options.data ?? loadSites(), options);
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  const limit = pLimit(Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY));
  const ready: SiteResult[] = [];
  let pending = sites.length;
  let wake: (() => void) | undefined;

  for (const site of sites) {
    limit(async () => {
      if (signal.aborted) return;
      const result = await checkSite(site, username, { ...options, signal });
      if (!signal.aborted) ready.push(result);
    })
      .catch(() => {
        // checkSite never throws; this only guards against unexpected bugs.
      })
      .finally(() => {
        pending--;
        wake?.();
      });
  }

  try {
    while (pending > 0 || ready.length > 0) {
      const next = ready.shift();
      if (next) {
        yield next;
        continue;
      }
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  } finally {
    controller.abort();
    limit.clearQueue();
  }
}
