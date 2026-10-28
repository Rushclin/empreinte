import { filterSites, loadSites, search } from "@empreinte/core";
import { ConcurrencyGate } from "@/lib/concurrency";
import { serverConfig } from "@/lib/config";
import { getRateLimiter } from "@/lib/rate-limit";
import { createSearchHandler } from "@/lib/search-handler";

// Searches stream for up to ~timeout x (sites / concurrency); give them room on Vercel.
export const maxDuration = 60;

export const GET = createSearchHandler({
  search,
  countSites: (options) => filterSites(loadSites(), options).length,
  getRateLimiter: () => getRateLimiter(serverConfig.rateLimitPerMinute),
  gate: new ConcurrencyGate(serverConfig.maxConcurrentSearches),
  searchOptions: {
    timeoutMs: serverConfig.siteTimeoutMs,
    concurrency: serverConfig.searchConcurrency,
  },
});
