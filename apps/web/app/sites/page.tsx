import { listTags, loadSites } from "@empreinte/core";
import type { Metadata } from "next";
import { SitesBrowser } from "@/components/sites-browser";

export const metadata: Metadata = { title: "Supported sites" };

export default function SitesPage() {
  const sites = loadSites();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Supported sites</h1>
        <p className="text-muted-foreground">
          Every site is a small JSON file contributed by the community and checked automatically.
        </p>
      </div>
      <SitesBrowser
        sites={sites.map(({ name, urlMain, tags, isNSFW }) => ({ name, urlMain, tags, isNSFW }))}
        tags={listTags(sites)}
      />
    </main>
  );
}
