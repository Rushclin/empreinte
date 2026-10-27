import { afterEach, describe, expect, it } from "vitest";
import { checkSite, detect, interpolate, requestMethodFor, USER_AGENT } from "../src/check.js";
import { makeSite, mockAgent, ORIGIN } from "./helpers.js";

let agent = mockAgent();
afterEach(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
  agent = mockAgent();
});

describe("status_code", () => {
  const site = makeSite({ errorType: "status_code" });

  it("uses HEAD and reports claimed on 2xx", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/alice", method: "HEAD" }).reply(200, "");
    const result = await checkSite(site, "alice", { dispatcher: agent });
    expect(result).toMatchObject({ status: "claimed", httpStatus: 200, site: "Example" });
    expect(result.url).toBe(`${ORIGIN}/users/alice`);
  });

  it("reports available on non-2xx", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/nobody", method: "HEAD" }).reply(404, "");
    const result = await checkSite(site, "nobody", { dispatcher: agent });
    expect(result.status).toBe("available");
  });

  it("reports available when the code is listed in errorCode, even if 2xx", async () => {
    const custom = makeSite({ errorType: "status_code", errorCode: [204, 410] });
    agent.get(ORIGIN).intercept({ path: "/users/nobody", method: "HEAD" }).reply(204, "");
    expect((await checkSite(custom, "nobody", { dispatcher: agent })).status).toBe("available");
  });

  it("sends a browser User-Agent and the site headers", async () => {
    const custom = makeSite({ headers: { "X-Test": "1" } });
    agent
      .get(ORIGIN)
      .intercept({
        path: "/users/alice",
        method: "HEAD",
        headers: { "user-agent": USER_AGENT, "x-test": "1" },
      })
      .reply(200, "");
    expect((await checkSite(custom, "alice", { dispatcher: agent })).status).toBe("claimed");
  });
});

describe("message", () => {
  const site = makeSite({ errorType: "message", errorMsg: ["Page not found", "No such user"] });

  it("uses GET and reports available when an error message is in the body", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/users/nobody", method: "GET" })
      .reply(200, "<h1>No such user</h1>");
    expect((await checkSite(site, "nobody", { dispatcher: agent })).status).toBe("available");
  });

  it("reports claimed when no error message is in the body", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/users/alice", method: "GET" })
      .reply(200, "<h1>alice</h1>");
    expect((await checkSite(site, "alice", { dispatcher: agent })).status).toBe("claimed");
  });

  it("accepts a single string errorMsg", async () => {
    const single = makeSite({ errorType: "message", errorMsg: "Gone" });
    agent.get(ORIGIN).intercept({ path: "/users/x", method: "GET" }).reply(200, "Gone");
    expect((await checkSite(single, "x", { dispatcher: agent })).status).toBe("available");
  });
});

describe("response_url", () => {
  const site = makeSite({ errorType: "response_url" });

  it("does not follow redirects: a redirect means available", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/users/nobody", method: "GET" })
      .reply(302, "", { headers: { location: `${ORIGIN}/signup` } });
    const result = await checkSite(site, "nobody", { dispatcher: agent, debug: true });
    expect(result.status).toBe("available");
    expect(result.httpStatus).toBe(302);
    expect(result.debug?.followRedirects).toBe(false);
  });

  it("reports claimed on 2xx", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/alice", method: "GET" }).reply(200, "ok");
    expect((await checkSite(site, "alice", { dispatcher: agent })).status).toBe("claimed");
  });
});

describe("combined error types", () => {
  const site = makeSite({ errorType: ["message", "status_code"], errorMsg: "not found" });

  it("message wins: available even on 200", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/a", method: "GET" }).reply(200, "user not found");
    expect((await checkSite(site, "a", { dispatcher: agent })).status).toBe("available");
  });

  it("then status_code: available on 404 without the message", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/b", method: "GET" }).reply(404, "oops");
    expect((await checkSite(site, "b", { dispatcher: agent })).status).toBe("available");
  });

  it("claimed only when every strategy says so", async () => {
    agent.get(ORIGIN).intercept({ path: "/users/c", method: "GET" }).reply(200, "profile");
    expect((await checkSite(site, "c", { dispatcher: agent })).status).toBe("claimed");
  });

  it("uses GET as soon as a strategy other than status_code is used", () => {
    expect(requestMethodFor(site)).toBe("GET");
    expect(requestMethodFor(makeSite({ errorType: ["status_code"] }))).toBe("HEAD");
    expect(requestMethodFor(makeSite({ request_method: "GET" }))).toBe("GET");
  });

  it("detect() follows Sherlock's order", () => {
    const all = makeSite({
      errorType: ["message", "status_code", "response_url"],
      errorMsg: "nope",
    });
    expect(detect(all, 200, "hello")).toBe("claimed");
    expect(detect(all, 200, "nope")).toBe("available");
    expect(detect(all, 301, "hello")).toBe("available");
  });
});

describe("regexCheck", () => {
  it("returns illegal without any request", async () => {
    const site = makeSite({ regexCheck: "^[a-z]+$" });
    const result = await checkSite(site, "Not.Valid", { dispatcher: agent });
    expect(result.status).toBe("illegal");
    expect(result.httpStatus).toBeUndefined();
  });
});

describe("WAF detection", () => {
  it.each([
    '<span id="challenge-error-text">Enable JavaScript</span>',
    "<script>AwsWafIntegration.forceRefreshToken()</script>",
    '{"perimeterxIdentifiers":{}}',
  ])("detects %s", async (body) => {
    const site = makeSite({ errorType: "message", errorMsg: "not found" });
    agent.get(ORIGIN).intercept({ path: "/users/alice", method: "GET" }).reply(403, body);
    const result = await checkSite(site, "alice", { dispatcher: agent });
    expect(result.status).toBe("waf");
  });
});

describe("errors", () => {
  it("reports unknown with context on timeout", async () => {
    const site = makeSite();
    agent.get(ORIGIN).intercept({ path: "/users/slow", method: "HEAD" }).reply(200, "").delay(500);
    const result = await checkSite(site, "slow", { dispatcher: agent, timeoutMs: 50 });
    expect(result.status).toBe("unknown");
    expect(result.context).toMatch(/Timed out/);
  });

  it("reports unknown on network error", async () => {
    const site = makeSite();
    agent
      .get(ORIGIN)
      .intercept({ path: "/users/boom", method: "HEAD" })
      .replyWithError(new Error("connection reset"));
    const result = await checkSite(site, "boom", { dispatcher: agent });
    expect(result.status).toBe("unknown");
    expect(result.context).toBeTruthy();
  });
});

describe("request_payload and urlProbe", () => {
  it("interpolates {} recursively in the payload and posts JSON to urlProbe", async () => {
    const site = makeSite({
      errorType: "message",
      errorMsg: '"exists":false',
      urlProbe: `${ORIGIN}/api/{}`,
      request_method: "POST",
      request_payload: { query: { login: "{}", tags: ["{}", 1] }, n: null },
    });
    agent
      .get(ORIGIN)
      .intercept({
        path: "/api/alice",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: { login: "alice", tags: ["alice", 1] }, n: null }),
      })
      .reply(200, '{"exists":true}');
    const result = await checkSite(site, "alice", { dispatcher: agent });
    expect(result.status).toBe("claimed");
    expect(result.url).toBe(`${ORIGIN}/users/alice`);
  });

  it("interpolate() leaves non-string values untouched", () => {
    expect(interpolate({ a: "{}-{}", b: 2, c: [true, "{}"] }, "x")).toEqual({
      a: "x-x",
      b: 2,
      c: [true, "x"],
    });
  });
});
