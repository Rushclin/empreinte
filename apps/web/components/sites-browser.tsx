"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { SiteFavicon } from "@/components/search/site-favicon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTRIBUTING_URL } from "@/lib/config";

export interface SiteSummary {
  name: string;
  urlMain: string;
  tags: string[];
  isNSFW: boolean;
}

export function SitesBrowser({ sites, tags }: { sites: SiteSummary[]; tags: string[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter(
      (site) =>
        (!q || site.name.toLowerCase().includes(q) || site.urlMain.toLowerCase().includes(q)) &&
        (!tag || site.tags.includes(tag)),
    );
  }, [sites, query, tag]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Filter sites"
            placeholder="Filter sites…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild variant="outline">
          <a href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">
            <Plus /> Add a site
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[undefined, ...tags].map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            onClick={() => setTag(value)}
            aria-pressed={tag === value}
          >
            <Badge variant={tag === value ? "default" : "outline"} className="cursor-pointer">
              {value ?? "all"}
            </Badge>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {visible.length} of {sites.length} sites
      </p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((site) => (
          <li key={site.name} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <SiteFavicon urlMain={site.urlMain} />
            <a
              href={site.urlMain}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate font-medium hover:underline"
            >
              {site.name}
            </a>
            <span className="ml-auto flex gap-1">
              {site.isNSFW && <Badge variant="destructive">nsfw</Badge>}
              {site.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
