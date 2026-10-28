import { listTags, loadSites } from "@empreinte/core";
import { SearchApp } from "@/components/search/search-app";

export default function Home() {
  const sites = loadSites();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Empreinte</h1>
        <p className="text-sm text-muted-foreground italic">French for “footprint”</p>
        <p className="max-w-xl text-balance text-muted-foreground">
          Find where a username exists across {sites.length} websites. Nothing you search is stored
          or logged.
        </p>
      </div>
      <SearchApp tags={listTags(sites)} />
    </main>
  );
}
