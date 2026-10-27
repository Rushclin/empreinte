import type { SiteResult } from "@empreinte/core";
import { describe, expect, it } from "vitest";
import { collectFlag, positiveNumber } from "../src/args.js";
import { formatDuration, toCsv, toJson } from "../src/report.js";

describe("collectFlag", () => {
  it("collects repeated, aliased, inline and comma-separated values", () => {
    const raw = ["john", "--site", "GitHub", "-s", "Reddit", "--site=npm,Dev.to", "--tag", "dev"];
    expect(collectFlag(raw, ["site", "s"])).toEqual(["GitHub", "Reddit", "npm", "Dev.to"]);
    expect(collectFlag(raw, ["tag", "t"])).toEqual(["dev"]);
  });

  it("ignores flags without value and arguments after --", () => {
    expect(collectFlag(["--site", "--nsfw", "--", "--site", "x"], ["site"])).toEqual([]);
  });
});

describe("positiveNumber", () => {
  it("parses and validates", () => {
    expect(positiveNumber("2.5", "timeout", 15)).toBe(2.5);
    expect(positiveNumber(undefined, "timeout", 15)).toBe(15);
    expect(() => positiveNumber("-1", "timeout", 15)).toThrow(/--timeout/);
  });
});

const result: SiteResult = {
  site: "Example",
  urlMain: "https://example.test/",
  url: "https://example.test/john",
  username: "john",
  status: "unknown",
  tags: [],
  context: 'Timed out, "really", after 15s',
};

describe("exports", () => {
  it("escapes CSV cells", () => {
    const csv = toCsv({ john: [result] });
    expect(csv.split("\n")[0]).toBe(
      "username,site,url,status,http_status,response_time_ms,context",
    );
    expect(csv).toContain('"Timed out, ""really"", after 15s"');
  });

  it("writes JSON with a timestamp", () => {
    const json = JSON.parse(toJson({ john: [result] }, new Date("2026-01-01T00:00:00Z")));
    expect(json.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(json.results.john[0].site).toBe("Example");
  });

  it("formats durations", () => {
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(3210)).toBe("3.2s");
  });
});
