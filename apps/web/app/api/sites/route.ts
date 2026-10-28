import { listTags, loadSites } from "@empreinte/core";

/** `GET /api/sites`: every supported site. Static, prerendered at build time. */
export async function GET() {
  const sites = loadSites();
  return Response.json({
    count: sites.length,
    tags: listTags(sites),
    sites: sites.map(({ name, url, urlMain, tags, isNSFW }) => ({
      name,
      url,
      urlMain,
      tags,
      isNSFW,
    })),
  });
}
