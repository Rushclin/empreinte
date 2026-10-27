import { MockAgent } from "undici";
import { parseSite, type Site, type SiteInput } from "../src/schema.js";

export const ORIGIN = "https://example.test";

export function makeSite(overrides: Partial<SiteInput> = {}): Site {
  return parseSite({
    name: "Example",
    url: `${ORIGIN}/users/{}`,
    urlMain: `${ORIGIN}/`,
    errorType: "status_code",
    username_claimed: "alice",
    ...overrides,
  });
}

/** A MockAgent that refuses any real network connection. */
export function mockAgent(): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  return agent;
}
