import { describe, expect, it } from "vitest";
import { GET } from "../app/api/sites/route";

describe("GET /api/sites", () => {
  it("lists the bundled sites with their tags", async () => {
    const body = await (await GET()).json();
    expect(body.count).toBeGreaterThanOrEqual(30);
    expect(body.sites).toHaveLength(body.count);
    expect(body.sites[0]).toEqual(
      expect.objectContaining({ name: expect.any(String), urlMain: expect.any(String) }),
    );
    expect(body.tags).toContain("dev");
  });
});
