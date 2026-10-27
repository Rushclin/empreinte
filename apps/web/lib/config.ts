export const GITHUB_URL = "https://github.com/Rushclin/empreinte";
export const CONTRIBUTING_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;

function intFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Server-side limits. All can be overridden with environment variables. */
export const serverConfig = {
  /** Searches allowed per IP and per minute. */
  rateLimitPerMinute: intFromEnv("RATE_LIMIT_PER_MINUTE", 5),
  /** Searches running at the same time on this server instance. */
  maxConcurrentSearches: intFromEnv("MAX_CONCURRENT_SEARCHES", 10),
  /** Timeout of each request to a site, in milliseconds. */
  siteTimeoutMs: intFromEnv("SITE_TIMEOUT_MS", 12_000),
  /** Simultaneous requests within one search. */
  searchConcurrency: intFromEnv("SEARCH_CONCURRENCY", 20),
};
