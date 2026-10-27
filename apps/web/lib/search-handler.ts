import type { SearchOptions, SiteResult } from "@empreinte/core";
import { clientIp } from "./client-ip";
import type { ConcurrencyGate } from "./concurrency";
import type { RateLimiter } from "./rate-limit";
import { parseSearchQuery } from "./validation";

export interface SearchHandlerDeps {
  search: (username: string, options: SearchOptions) => AsyncIterable<SiteResult>;
  /** Number of sites a search will check, for the progress bar. */
  countSites: (options: SearchOptions) => number;
  getRateLimiter: () => Promise<RateLimiter>;
  gate: ConcurrencyGate;
  searchOptions?: Pick<SearchOptions, "timeoutMs" | "concurrency">;
  /** Interval of SSE keep-alive comments, in milliseconds. */
  heartbeatMs?: number;
}

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * `GET /api/search?username=...&tags=a,b&sites=GitHub&nsfw=1`
 *
 * Streams results as Server-Sent Events:
 *   event: start   data: { username, total }
 *   event: result  data: SiteResult
 *   event: done    data: { found, checked, durationMs }
 *
 * Nothing about the search is logged or stored.
 */
export function createSearchHandler(deps: SearchHandlerDeps) {
  return async function GET(request: Request): Promise<Response> {
    const parsed = parseSearchQuery(new URL(request.url).searchParams);
    if (!parsed.success) {
      return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid query" });
    }
    const query = parsed.data;

    const limiter = await deps.getRateLimiter();
    const rate = await limiter.limit(clientIp(request.headers));
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
      return json(
        429,
        { error: `Too many searches. Try again in ${retryAfter} seconds.` },
        { "Retry-After": String(retryAfter) },
      );
    }

    const release = deps.gate.tryAcquire();
    if (!release) {
      return json(
        503,
        { error: "The server is busy. Please try again in a few seconds." },
        { "Retry-After": "10" },
      );
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal.addEventListener("abort", onAbort);

    const options: SearchOptions = {
      ...deps.searchOptions,
      tags: query.tags,
      sites: query.sites,
      includeNSFW: query.nsfw,
      signal: controller.signal,
    };
    const total = deps.countSites(options);
    const iterator = deps.search(query.username, options)[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      request.signal.removeEventListener("abort", onAbort);
      controller.abort();
      release();
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(stream) {
        const send = (event: string, data: unknown) =>
          stream.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        heartbeat = setInterval(() => {
          try {
            stream.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            // Stream already closed.
          }
        }, deps.heartbeatMs ?? 15_000);

        const started = Date.now();
        let checked = 0;
        let found = 0;
        try {
          send("start", { username: query.username, total });
          while (true) {
            const next = await iterator.next();
            if (next.done) break;
            checked++;
            if (next.value.status === "claimed") found++;
            send("result", next.value);
          }
          if (!controller.signal.aborted) {
            send("done", { found, checked, durationMs: Date.now() - started });
          }
          stream.close();
        } catch {
          // The client disconnected (enqueue on a cancelled stream) or the search failed.
          try {
            stream.close();
          } catch {}
        } finally {
          cleanup();
        }
      },
      cancel() {
        // Client disconnected: the abort signal stops every pending request. `return()` is
        // not awaited because it would wait for the in-flight `next()` to settle.
        cleanup();
        iterator.return?.().catch(() => {});
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
