import type { Dispatcher } from "undici";
import type { RequestMethod, Site } from "./schema.js";

/**
 * - `claimed`: the account exists
 * - `available`: the account does not exist
 * - `unknown`: network error, timeout or unexpected answer
 * - `illegal`: the username is not valid on this site (`regexCheck`), no request was made
 * - `waf`: the request was blocked by an anti-bot page (Cloudflare, AWS WAF, PerimeterX)
 */
export type SiteStatus = "claimed" | "available" | "unknown" | "illegal" | "waf";

export interface SiteResult {
  /** Name of the site, e.g. "GitHub". */
  site: string;
  /** Home page of the site. */
  urlMain: string;
  /** Profile URL for this username. */
  url: string;
  username: string;
  status: SiteStatus;
  tags: string[];
  /** HTTP status of the response, when a response was received. */
  httpStatus?: number;
  /** Time spent on the request, in milliseconds. */
  responseTimeMs?: number;
  /** Human-readable explanation for `unknown`, `illegal` and `waf` results. */
  context?: string;
  /** Request details, only present when `debug` is enabled. Used by `check-site`. */
  debug?: DebugInfo;
}

export interface DebugInfo {
  method: RequestMethod;
  requestUrl: string;
  followRedirects: boolean;
  /** Final `location` header, if the server answered with a redirect. */
  location?: string;
  /** First characters of the response body. */
  bodyExcerpt: string;
}

export interface CheckOptions {
  /** Timeout of each request, in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** HTTP(S) proxy URL, e.g. "http://127.0.0.1:8080". */
  proxy?: string;
  /** Cancels the request(s). */
  signal?: AbortSignal;
  /** Attach request details to each result. */
  debug?: boolean;
  /**
   * Advanced: custom undici dispatcher (used by tests with `MockAgent`).
   * Takes precedence over `proxy`.
   */
  dispatcher?: Dispatcher;
}

export interface SearchOptions extends CheckOptions {
  /** Maximum number of simultaneous requests. Default: 20. */
  concurrency?: number;
  /** Only check these sites (names, case-insensitive). */
  sites?: string[];
  /** Only check sites having at least one of these tags. */
  tags?: string[];
  /** Include sites flagged as NSFW. Default: false. */
  includeNSFW?: boolean;
  /** Site definitions to use instead of the bundled list. */
  data?: Site[];
}
