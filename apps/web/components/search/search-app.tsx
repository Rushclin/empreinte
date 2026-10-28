"use client";

import type { SiteResult } from "@empreinte/core";
import { ChevronDown, Download, ExternalLink, Loader2, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { downloadFile, resultsToCsv } from "@/lib/export";
import { readServerSentEvents } from "@/lib/sse";
import { cn } from "@/lib/utils";
import { SiteFavicon } from "./site-favicon";

type Phase = "idle" | "running" | "done" | "cancelled" | "error";

interface Summary {
  found: number;
  checked: number;
  durationMs: number;
}

const USERNAME_PATTERN = "[\\p{L}\\p{N}._\\-]+";

export function SearchApp({ tags }: { tags: string[] }) {
  const [username, setUsername] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [searched, setSearched] = useState("");
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<SiteResult[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const abortRef = useRef<AbortController | null>(null);

  const groups = useMemo(() => {
    const byName = (a: SiteResult, b: SiteResult) => a.site.localeCompare(b.site);
    return {
      found: results.filter((r) => r.status === "claimed").sort(byName),
      notFound: results.filter((r) => r.status === "available").sort(byName),
      errors: results.filter((r) => r.status === "unknown" || r.status === "waf").sort(byName),
      illegal: results.filter((r) => r.status === "illegal").sort(byName),
    };
  }, [results]);

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  async function startSearch(event: React.FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || phase === "running") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");
    setError(undefined);
    setResults([]);
    setSummary(undefined);
    setTotal(0);
    setSearched(name);

    const params = new URLSearchParams({ username: name });
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    if (nsfw) params.set("nsfw", "1");

    try {
      const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Search failed (HTTP ${response.status})`);
      }
      for await (const message of readServerSentEvents(response.body)) {
        const data = JSON.parse(message.data);
        if (message.event === "start") setTotal(data.total);
        else if (message.event === "result") setResults((current) => [...current, data]);
        else if (message.event === "done") setSummary(data);
      }
      setPhase("done");
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase("cancelled");
      } else {
        setError((caught as Error).message);
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function exportAs(format: "json" | "csv") {
    const base = `empreinte-${searched}`;
    if (format === "json") {
      const content = JSON.stringify({ username: searched, results }, null, 2);
      downloadFile(`${base}.json`, content, "application/json");
    } else {
      downloadFile(`${base}.csv`, resultsToCsv(results), "text/csv");
    }
  }

  const running = phase === "running";
  const progress = total > 0 ? Math.round((results.length / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={startSearch} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Username"
              placeholder="Enter a username, e.g. torvalds"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={64}
              pattern={USERNAME_PATTERN}
              title="Letters, digits, dots, dashes and underscores"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              required
              className="h-12 pl-11 text-base md:text-base"
            />
          </div>
          {running ? (
            <Button type="button" size="lg" variant="outline" onClick={cancel}>
              <X /> Cancel
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!username.trim()}>
              Search
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Tags:</span>
          {tags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={active}
                disabled={running}
              >
                <Badge
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer select-none"
                >
                  {tag}
                </Badge>
              </button>
            );
          })}
          <Label className="ml-auto gap-2 text-muted-foreground">
            <Switch checked={nsfw} onCheckedChange={setNsfw} disabled={running} />
            Include NSFW
          </Label>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      {phase !== "idle" && phase !== "error" && (
        <section className="flex flex-col gap-4" aria-live="polite">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2">
                {running && <Loader2 className="size-4 animate-spin" />}
                {running && (
                  <>
                    Checking <b>{searched}</b>…
                  </>
                )}
                {phase === "done" && (
                  <>
                    <b>{groups.found.length}</b> account{groups.found.length === 1 ? "" : "s"} found
                    for <b>{searched}</b>
                  </>
                )}
                {phase === "cancelled" && <>Search cancelled</>}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {results.length}/{total || "…"}
                {summary && ` · ${(summary.durationMs / 1000).toFixed(1)}s`}
              </span>
            </div>
            <Progress value={phase === "done" ? 100 : progress} aria-label="Search progress" />
          </div>

          {results.length > 0 && !running && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportAs("json")}>
                <Download /> JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportAs("csv")}>
                <Download /> CSV
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Found
                <Badge variant="secondary">{groups.found.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groups.found.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {running ? "Waiting for results…" : "No account found."}
                </p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {groups.found.map((result) => (
                    <li key={result.site}>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent animate-in fade-in"
                      >
                        <SiteFavicon urlMain={result.urlMain} />
                        <span className="font-medium">{result.site}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {result.url.replace(/^https?:\/\/(www\.)?/, "")}
                        </span>
                        <ExternalLink className="ml-auto size-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <ResultGroup title="Not found" results={groups.notFound} />
          <ResultGroup title="Errors and blocked requests" results={groups.errors} showContext />
          <ResultGroup title="Username not valid on these sites" results={groups.illegal} />
        </section>
      )}
    </div>
  );
}

function ResultGroup({
  title,
  results,
  showContext = false,
}: {
  title: string;
  results: SiteResult[];
  showContext?: boolean;
}) {
  if (results.length === 0) return null;
  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-5 py-3 text-sm font-medium">
        {title}
        <Badge variant="secondary">{results.length}</Badge>
        <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-1 border-t px-3 py-3 text-sm sm:grid-cols-2">
          {results.map((result) => (
            <li key={result.site} className="flex items-center gap-3 px-2 py-1.5">
              <SiteFavicon urlMain={result.urlMain} />
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:underline"
              >
                {result.site}
              </a>
              {showContext && (
                <span
                  className={cn(
                    "truncate text-xs",
                    result.status === "waf" ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {result.status === "waf" ? "blocked by anti-bot" : result.context}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
