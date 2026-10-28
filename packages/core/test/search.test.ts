import { afterEach, describe, expect, it } from "vitest";
import { search } from "../src/search.js";
import type { SiteResult } from "../src/types.js";
import { makeSite, mockAgent, ORIGIN } from "./helpers.js";

let agent = mockAgent();
afterEach(async () => {
  await agent.close();
  agent = mockAgent();
});

const data = [
  makeSite({ name: "Alpha", url: `${ORIGIN}/a/{}`, tags: ["dev"] }),
  makeSite({ name: "Beta", url: `${ORIGIN}/b/{}`, tags: ["music"] }),
  makeSite({ name: "Gamma", url: `${ORIGIN}/g/{}`, tags: ["dev"], isNSFW: true }),
];

async function collect(iterable: AsyncIterable<SiteResult>): Promise<SiteResult[]> {
  const results: SiteResult[] = [];
  for await (const result of iterable) results.push(result);
  return results;
}

describe("search", () => {
  it("streams results in completion order", async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/a/bob", method: "HEAD" }).reply(200, "").delay(80);
    pool.intercept({ path: "/b/bob", method: "HEAD" }).reply(404, "");
    const results = await collect(search("bob", { data, dispatcher: agent }));
    expect(results.map((r) => [r.site, r.status])).toEqual([
      ["Beta", "available"],
      ["Alpha", "claimed"],
    ]);
  });

  it("excludes NSFW sites by default and includes them on demand", async () => {
    const pool = agent.get(ORIGIN);
    pool
      .intercept({ path: /\/[abg]\/bob/, method: "HEAD" })
      .reply(200, "")
      .times(3);
    const results = await collect(search("bob", { data, dispatcher: agent, includeNSFW: true }));
    expect(results.map((r) => r.site).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("filters by tag and by site name (case-insensitive)", async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: /.*/, method: "HEAD" }).reply(200, "").times(2);
    const byTag = await collect(search("bob", { data, dispatcher: agent, tags: ["dev"] }));
    expect(byTag.map((r) => r.site)).toEqual(["Alpha"]);
    const byName = await collect(search("bob", { data, dispatcher: agent, sites: ["beta"] }));
    expect(byName.map((r) => r.site)).toEqual(["Beta"]);
  });

  it("respects the concurrency limit", async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      makeSite({ name: `S${i}`, url: `${ORIGIN}/s${i}/{}` }),
    );
    let active = 0;
    let peak = 0;
    agent
      .get(ORIGIN)
      .intercept({ path: /\/s\d\/bob/, method: "HEAD" })
      .reply(() => {
        active++;
        peak = Math.max(peak, active);
        setTimeout(() => active--, 20);
        return { statusCode: 200, data: "" };
      })
      .delay(20)
      .times(6);
    const results = await collect(search("bob", { data: many, dispatcher: agent, concurrency: 2 }));
    expect(results).toHaveLength(6);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    agent
      .get(ORIGIN)
      .intercept({ path: /.*/, method: "HEAD" })
      .reply(200, "")
      .delay(5_000)
      .times(2);
    setTimeout(() => controller.abort(), 30);
    const start = Date.now();
    const results = await collect(
      search("bob", { data, dispatcher: agent, signal: controller.signal }),
    );
    expect(results).toEqual([]);
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it("cancels pending work when the consumer stops iterating", async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/b/bob", method: "HEAD" }).reply(404, "");
    pool.intercept({ path: "/a/bob", method: "HEAD" }).reply(200, "").delay(5_000);
    const start = Date.now();
    for await (const result of search("bob", { data, dispatcher: agent })) {
      expect(result.site).toBe("Beta");
      break;
    }
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it("yields illegal results for usernames rejected by regexCheck", async () => {
    const strict = [makeSite({ name: "Strict", regexCheck: "^[a-z]+$" })];
    const results = await collect(search("UPPER", { data: strict, dispatcher: agent }));
    expect(results[0]?.status).toBe("illegal");
  });
});
