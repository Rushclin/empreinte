import type { SearchOptions, SiteResult } from "@empreinte/core";
import { describe, expect, it, vi } from "vitest";
import { ConcurrencyGate } from "../lib/concurrency";
import { MemoryRateLimiter } from "../lib/rate-limit";
import { createSearchHandler, type SearchHandlerDeps } from "../lib/search-handler";

const result = (site: string, status: SiteResult["status"]): SiteResult => ({
  site,
  status,
  username: "alice",
  url: `https://${site.toLowerCase()}.test/alice`,
  urlMain: `https://${site.toLowerCase()}.test/`,
  tags: [],
});

async function* fakeSearch(): AsyncGenerator<SiteResult> {
  yield result("Alpha", "claimed");
  yield result("Beta", "available");
}

function handler(overrides: Partial<SearchHandlerDeps> = {}) {
  return createSearchHandler({
    search: fakeSearch,
    countSites: () => 2,
    getRateLimiter: async () => new MemoryRateLimiter(100),
    gate: new ConcurrencyGate(5),
    ...overrides,
  });
}

const request = (query: string, init: RequestInit = {}) =>
  new Request(`http://localhost/api/search?${query}`, {
    headers: { "x-forwarded-for": "203.0.113.7" },
    ...init,
  });

function parseEvents(text: string) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("event:"))
    .map((chunk) => {
      const [eventLine, dataLine] = chunk.split("\n");
      return {
        event: eventLine?.slice("event: ".length),
        data: JSON.parse(dataLine?.slice("data: ".length) ?? "null"),
      };
    });
}

describe("GET /api/search", () => {
  it("streams start, result and done events as SSE", async () => {
    const response = await handler()(request("username=alice"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = parseEvents(await response.text());
    expect(events.map((e) => e.event)).toEqual(["start", "result", "result", "done"]);
    expect(events[0]?.data).toEqual({ username: "alice", total: 2 });
    expect(events[1]?.data.site).toBe("Alpha");
    expect(events[3]?.data).toMatchObject({ found: 1, checked: 2 });
  });

  it("passes filters to the engine", async () => {
    const search = vi.fn((_username: string, _options: SearchOptions) => fakeSearch());
    await (await handler({ search })(request("username=alice&tags=dev,music&nsfw=1"))).text();
    const options = search.mock.calls[0]?.[1] as SearchOptions;
    expect(options.tags).toEqual(["dev", "music"]);
    expect(options.includeNSFW).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["missing username", ""],
    ["empty username", "username=%20"],
    ["too long", `username=${"a".repeat(65)}`],
    ["forbidden characters", "username=a%3Cscript%3E"],
    ["slash", "username=a%2Fb"],
    ["bad nsfw value", "username=alice&nsfw=maybe"],
    ["bad tag", "username=alice&tags=Not%20A%20Tag"],
  ])("rejects %s with 400", async (_label, query) => {
    const search = vi.fn(fakeSearch);
    const response = await handler({ search })(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it("rate limits per IP with 429 and Retry-After", async () => {
    const limiter = new MemoryRateLimiter(2);
    const get = handler({ getRateLimiter: async () => limiter });
    for (let i = 0; i < 2; i++) {
      expect((await get(request("username=alice"))).status).toBe(200);
    }
    const limited = await get(request("username=alice"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another IP is not affected.
    const other = await get(
      request("username=alice", { headers: { "x-forwarded-for": "198.51.100.1" } }),
    );
    expect(other.status).toBe(200);
  });

  it("refuses with 503 when too many searches run at once, and frees the slot afterwards", async () => {
    const gate = new ConcurrencyGate(1);
    const get = handler({ gate });
    const first = await get(request("username=alice"));
    expect(gate.size).toBe(1);
    expect((await get(request("username=bob"))).status).toBe(503);
    await first.text();
    expect(gate.size).toBe(0);
  });

  it("stops the search when the client disconnects", async () => {
    let aborted = false;
    let returned = false;
    async function* slowSearch(_u: string, options: SearchOptions): AsyncGenerator<SiteResult> {
      options.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      try {
        yield result("Alpha", "claimed");
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        yield result("Beta", "available");
      } finally {
        returned = true;
      }
    }
    const gate = new ConcurrencyGate(1);
    const client = new AbortController();
    const response = await handler({ search: slowSearch, gate })(
      request("username=alice", { signal: client.signal }),
    );
    const reader = response.body?.getReader();
    await reader?.read(); // start event
    client.abort();
    await reader?.cancel();
    await vi.waitFor(() => expect(aborted).toBe(true));
    expect(gate.size).toBe(0);
    expect(returned || aborted).toBe(true);
  });
});

describe("MemoryRateLimiter", () => {
  it("uses a sliding window", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(2, 60_000, () => now);
    expect((await limiter.limit("ip")).success).toBe(true);
    now = 30_000;
    expect((await limiter.limit("ip")).success).toBe(true);
    expect((await limiter.limit("ip")).success).toBe(false);
    now = 60_001;
    expect((await limiter.limit("ip")).success).toBe(true);
  });
});
