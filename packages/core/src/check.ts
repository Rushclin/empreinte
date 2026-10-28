import { type Dispatcher, fetch, ProxyAgent } from "undici";
import type { ErrorType, RequestMethod, Site } from "./schema.js";
import type { CheckOptions, SiteResult, SiteStatus } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 15_000;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0";

/** Fragments of anti-bot challenge pages (Cloudflare, AWS WAF, PerimeterX). */
export const WAF_FINGERPRINTS = [
  '<span id="challenge-error-text">',
  "AwsWafIntegration.forceRefreshToken",
  ".challenge-running{display:none}",
  '"perimeterxIdentifiers"',
] as const;

/** Bodies larger than this are truncated before matching, to bound memory use. */
const MAX_BODY_CHARS = 2_000_000;
const EXCERPT_CHARS = 500;

const toArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Replaces "{}" with the username, recursively in strings, arrays and objects. */
export function interpolate<T>(input: T, username: string): T {
  if (typeof input === "string") return input.replaceAll("{}", username) as T;
  if (Array.isArray(input)) return input.map((value) => interpolate(value, username)) as T;
  if (input !== null && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, interpolate(value, username)]),
    ) as T;
  }
  return input;
}

/** Method used for a site: HEAD is enough when only the status code matters. */
export function requestMethodFor(site: Site): RequestMethod {
  if (site.request_method) return site.request_method;
  const types = toArray(site.errorType);
  return types.length === 1 && types[0] === "status_code" ? "HEAD" : "GET";
}

/** Profile URL for a username (spaces encoded, as Sherlock does). */
export function profileUrl(site: Site, username: string): string {
  return interpolate(site.url, username.replaceAll(" ", "%20"));
}

const proxyAgents = new Map<string, ProxyAgent>();
function dispatcherFor(options: CheckOptions): Dispatcher | undefined {
  if (options.dispatcher) return options.dispatcher;
  if (!options.proxy) return undefined;
  let agent = proxyAgents.get(options.proxy);
  if (!agent) {
    agent = new ProxyAgent(options.proxy);
    proxyAgents.set(options.proxy, agent);
  }
  return agent;
}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return `Timed out after ${timeoutMs / 1000}s`;
    if (error.name === "AbortError") return "Aborted";
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = (cause as Error & { code?: string }).code;
      return `${error.message}: ${code ?? cause.message}`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Applies Sherlock's detection rules, in Sherlock's order.
 * Exported for unit tests and for tools that want to re-check a stored response.
 */
export function detect(site: Site, httpStatus: number, body: string): SiteStatus {
  if (WAF_FINGERPRINTS.some((fingerprint) => body.includes(fingerprint))) return "waf";

  const types: ErrorType[] = toArray(site.errorType);
  const is2xx = httpStatus >= 200 && httpStatus < 300;
  let status: SiteStatus = "unknown";

  if (types.includes("message")) {
    const found = toArray(site.errorMsg).some((message) => body.includes(message));
    status = found ? "available" : "claimed";
  }

  if (types.includes("status_code") && status !== "available") {
    const codes = toArray(site.errorCode);
    status = codes.includes(httpStatus) || !is2xx ? "available" : "claimed";
  }

  if (types.includes("response_url") && status !== "available") {
    status = is2xx ? "claimed" : "available";
  }

  return status;
}

/** Checks whether `username` exists on one site. Never throws. */
export async function checkSite(
  site: Site,
  username: string,
  options: CheckOptions = {},
): Promise<SiteResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = {
    site: site.name,
    urlMain: site.urlMain,
    url: profileUrl(site, username),
    username,
    tags: site.tags,
  };

  if (site.regexCheck && !new RegExp(site.regexCheck).test(username)) {
    return { ...base, status: "illegal", context: "Username format not supported by this site" };
  }

  const method = requestMethodFor(site);
  const requestUrl = site.urlProbe ? interpolate(site.urlProbe, username) : base.url;
  const followRedirects = !toArray(site.errorType).includes("response_url");
  const payload =
    site.request_payload !== undefined ? interpolate(site.request_payload, username) : undefined;

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    ...site.headers,
  };
  if (
    payload !== undefined &&
    !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  const start = performance.now();
  let httpStatus: number;
  let body = "";
  let location: string | undefined;
  try {
    const response = await fetch(requestUrl, {
      method,
      headers,
      redirect: followRedirects ? "follow" : "manual",
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal,
      dispatcher: dispatcherFor(options),
    });
    httpStatus = response.status;
    location = response.headers.get("location") ?? undefined;
    if (method === "HEAD") {
      await response.body?.cancel();
    } else {
      body = (await response.text()).slice(0, MAX_BODY_CHARS);
    }
  } catch (error) {
    return {
      ...base,
      status: "unknown",
      context: describeError(timeoutSignal.aborted ? timeoutSignal.reason : error, timeoutMs),
      responseTimeMs: Math.round(performance.now() - start),
    };
  }

  const status = detect(site, httpStatus, body);
  const result: SiteResult = {
    ...base,
    status,
    httpStatus,
    responseTimeMs: Math.round(performance.now() - start),
  };
  if (status === "waf") result.context = "Blocked by an anti-bot protection";
  if (options.debug) {
    result.debug = {
      method,
      requestUrl,
      followRedirects,
      location,
      bodyExcerpt: body.slice(0, EXCERPT_CHARS),
    };
  }
  return result;
}
