import { describe, expect, it } from "vitest";
import { parseSite, safeParseSite, siteSlug } from "../src/schema.js";
import { filterSites, loadSites, parseSites } from "../src/sites.js";
import { expandUsername } from "../src/username.js";

const valid = {
  $schema: "../schema/site.schema.json",
  name: "GitHub",
  url: "https://github.com/{}",
  urlMain: "https://github.com/",
  errorType: "status_code",
  regexCheck: "^[a-zA-Z0-9-]{1,39}$",
  username_claimed: "torvalds",
  tags: ["dev"],
  isNSFW: false,
};

const issues = (input: unknown) => {
  const result = safeParseSite(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("site schema", () => {
  it("accepts a valid site and strips $schema", () => {
    const site = parseSite(valid);
    expect(site).not.toHaveProperty("$schema");
    expect(site.name).toBe("GitHub");
  });

  it("applies defaults for tags and isNSFW", () => {
    const { tags: _t, isNSFW: _n, ...minimal } = valid;
    const site = parseSite(minimal);
    expect(site.tags).toEqual([]);
    expect(site.isNSFW).toBe(false);
  });

  it("accepts every optional field", () => {
    const site = parseSite({
      ...valid,
      errorType: ["message", "status_code", "response_url"],
      errorMsg: ["a", "b"],
      errorCode: [404, 410],
      urlProbe: "https://api.github.com/users/{}",
      headers: { Accept: "application/json" },
      request_method: "POST",
      request_payload: { login: "{}" },
    });
    expect(site.request_method).toBe("POST");
  });

  it.each([
    ["missing name", { ...valid, name: undefined }, "name"],
    ["url without {}", { ...valid, url: "https://github.com/" }, "url"],
    ["non-http url", { ...valid, url: "ftp://github.com/{}" }, "url"],
    ["unknown errorType", { ...valid, errorType: "html" }, "errorType"],
    ["empty errorType list", { ...valid, errorType: [] }, "errorType"],
    [
      "duplicate errorType",
      { ...valid, errorType: ["message", "message"], errorMsg: "x" },
      "errorType",
    ],
    ["message without errorMsg", { ...valid, errorType: "message" }, "errorMsg"],
    ["invalid errorCode", { ...valid, errorCode: 42 }, "errorCode"],
    ["invalid regex", { ...valid, regexCheck: "([a-z" }, "regexCheck"],
    [
      "claimed username not matching regex",
      { ...valid, username_claimed: "a_b" },
      "username_claimed",
    ],
    ["bad tag", { ...valid, tags: ["Dev Tools"] }, "tags.0"],
    ["unknown key (typo)", { ...valid, errorMessage: "x" }, ""],
    ["bad method", { ...valid, request_method: "PATCH" }, "request_method"],
  ])("rejects %s", (_label, input, path) => {
    expect(issues(input)).toContain(path);
  });

  it("parseSites names the invalid site", () => {
    expect(() => parseSites([valid, { ...valid, name: "Broken", url: "nope" }])).toThrow(
      /"Broken"/,
    );
  });

  it("the bundled site list is valid", () => {
    expect(() => loadSites()).not.toThrow();
  });
});

describe("siteSlug", () => {
  it.each([
    ["GitHub", "github"],
    ["Hacker News", "hacker-news"],
    ["Chess.com", "chess-com"],
    ["Mastodon.social", "mastodon-social"],
    ["Dev.to", "dev-to"],
  ])("%s -> %s", (name, slug) => {
    expect(siteSlug(name)).toBe(slug);
  });
});

describe("filterSites", () => {
  const sites = parseSites([
    { ...valid, name: "A", tags: ["dev"] },
    { ...valid, name: "B", tags: ["social"], isNSFW: true },
  ]);

  it("asking for a site by name includes it even if NSFW", () => {
    expect(filterSites(sites, { sites: ["b"] }).map((s) => s.name)).toEqual(["B"]);
  });

  it("filters by tag and NSFW", () => {
    expect(filterSites(sites, { tags: ["social"] })).toEqual([]);
    expect(filterSites(sites, { tags: ["social"], includeNSFW: true })).toHaveLength(1);
  });
});

describe("expandUsername", () => {
  it("expands {?} with _, - and .", () => {
    expect(expandUsername("john{?}doe")).toEqual(["john_doe", "john-doe", "john.doe"]);
  });

  it("replaces every occurrence with the same separator", () => {
    expect(expandUsername("a{?}b{?}c")).toEqual(["a_b_c", "a-b-c", "a.b.c"]);
  });

  it("returns plain usernames unchanged", () => {
    expect(expandUsername("johndoe")).toEqual(["johndoe"]);
  });
});
