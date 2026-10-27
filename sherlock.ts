#!/usr/bin/env node
/**
 * sherlock.ts — portage Node.js/TypeScript de la logique de Sherlock
 * (https://github.com/sherlock-project/sherlock)
 *
 * Prérequis : Node 18+ (fetch natif). Lancement :
 *   npx tsx sherlock.ts <username> [--timeout 60] [--site GitHub] [--nsfw] [--json out.json] [--all]
 *
 * La liste des sites est le même data.json que Sherlock (chargé depuis GitHub
 * par défaut, ou un fichier local via --data ./data.json).
 */

import { readFile, writeFile } from "node:fs/promises";

// ---------- 1. Types : le schéma de data.json ----------

type ErrorType = "message" | "status_code" | "response_url";

interface SiteInfo {
  url: string; // URL du profil, "{}" = username
  urlMain: string; // page d'accueil du site
  urlProbe?: string; // URL alternative à interroger (API, etc.)
  errorType: ErrorType | ErrorType[];
  errorMsg?: string | string[]; // texte présent si le compte N'EXISTE PAS
  errorCode?: number | number[]; // code HTTP signifiant "n'existe pas"
  regexCheck?: string; // format de username accepté par le site
  request_method?: "GET" | "HEAD" | "POST" | "PUT";
  request_payload?: unknown; // corps JSON (avec "{}" interpolé)
  headers?: Record<string, string>;
  isNSFW?: boolean;
  username_claimed: string; // username connu, utilisé pour les tests
}

type SiteData = Record<string, SiteInfo>;

enum QueryStatus {
  CLAIMED = "Claimed", // compte trouvé
  AVAILABLE = "Available", // compte absent
  UNKNOWN = "Unknown", // erreur réseau / config
  ILLEGAL = "Illegal", // username refusé par regexCheck
  WAF = "WAF", // bloqué par Cloudflare & co
}

interface QueryResult {
  site: string;
  url: string;
  status: QueryStatus;
  httpStatus?: number;
  responseTimeMs?: number;
  context?: string;
}

// ---------- 2. Constantes reprises de sherlock.py ----------

const DATA_URL =
  "https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json";

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";

// Empreintes de pages anti-bot (Cloudflare, AWS WAF, PerimeterX)
const WAF_FINGERPRINTS = [
  '<span id="challenge-error-text">',
  "AwsWafIntegration.forceRefreshToken",
  ".challenge-running{display:none}",
  '"perimeterxIdentifiers"',
];

// ---------- 3. Utilitaires ----------

/** Remplace "{}" par le username, récursivement (strings, objets, tableaux). */
function interpolate<T>(input: T, username: string): T {
  if (typeof input === "string") return input.replaceAll("{}", username) as T;
  if (Array.isArray(input)) return input.map((v) => interpolate(v, username)) as T;
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, interpolate(v, username)]),
    ) as T;
  }
  return input;
}

/** "john{?}doe" -> ["john_doe", "john-doe", "john.doe"] (option {?} de Sherlock). */
function expandUsername(username: string): string[] {
  if (!username.includes("{?}")) return [username];
  return ["_", "-", "."].map((c) => username.replaceAll("{?}", c));
}

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Pool de concurrence simple (équivalent du ThreadPool max_workers=20). */
async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------- 4. Chargement des sites ----------

async function loadSites(source = DATA_URL): Promise<SiteData> {
  const raw = source.startsWith("http")
    ? await (await fetch(source)).text()
    : await readFile(source, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;
  delete data.$schema;
  return data as SiteData;
}

// ---------- 5. Le cœur : tester un site ----------

async function checkSite(
  username: string,
  name: string,
  info: SiteInfo,
  timeoutMs: number,
): Promise<QueryResult> {
  const url = interpolate(info.url, username.replaceAll(" ", "%20"));

  // a) Username invalide pour ce site -> pas de requête
  if (info.regexCheck && !new RegExp(info.regexCheck).test(username)) {
    return { site: name, url: "", status: QueryStatus.ILLEGAL };
  }

  const errorTypes = toArray(info.errorType);
  const probeUrl = info.urlProbe ? interpolate(info.urlProbe, username) : url;
  const payload =
    info.request_payload !== undefined ? interpolate(info.request_payload, username) : undefined;

  // b) Méthode : HEAD suffit pour status_code (plus rapide), sinon GET
  const method =
    info.request_method ??
    (errorTypes.length === 1 && errorTypes[0] === "status_code" ? "HEAD" : "GET");

  // c) Pour response_url, on NE suit PAS les redirections
  const redirect: RequestRedirect = errorTypes.includes("response_url") ? "manual" : "follow";

  const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...info.headers };
  if (payload !== undefined) headers["Content-Type"] = "application/json";

  const start = Date.now();
  let res: Response;
  let body = "";
  try {
    res = await fetch(probeUrl, {
      method,
      headers,
      redirect,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (method !== "HEAD") body = await res.text();
  } catch (err) {
    const msg =
      err instanceof Error ? (err.name === "TimeoutError" ? "Timeout" : err.message) : String(err);
    return { site: name, url, status: QueryStatus.UNKNOWN, context: msg };
  }

  const base = { site: name, url, httpStatus: res.status, responseTimeMs: Date.now() - start };

  // d) Détection WAF
  if (WAF_FINGERPRINTS.some((fp) => body.includes(fp))) {
    return { ...base, status: QueryStatus.WAF };
  }

  // e) Les 3 stratégies de détection, combinables, dans le même ordre que Sherlock
  let status = QueryStatus.UNKNOWN;

  if (errorTypes.includes("message")) {
    const found = toArray(info.errorMsg).some((m) => body.includes(m));
    status = found ? QueryStatus.AVAILABLE : QueryStatus.CLAIMED;
  }

  if (errorTypes.includes("status_code") && status !== QueryStatus.AVAILABLE) {
    const codes = toArray(info.errorCode);
    status =
      codes.includes(res.status) || res.status < 200 || res.status >= 300
        ? QueryStatus.AVAILABLE
        : QueryStatus.CLAIMED;
  }

  if (errorTypes.includes("response_url") && status !== QueryStatus.AVAILABLE) {
    status = res.status >= 200 && res.status < 300 ? QueryStatus.CLAIMED : QueryStatus.AVAILABLE;
  }

  return { ...base, status };
}

// ---------- 6. Orchestration ----------

interface Options {
  timeoutMs: number;
  concurrency: number;
  sites?: string[];
  nsfw: boolean;
  dataSource?: string;
  onResult?: (r: QueryResult) => void;
}

export async function sherlock(username: string, opts: Options): Promise<QueryResult[]> {
  let data = await loadSites(opts.dataSource);

  if (!opts.nsfw) {
    data = Object.fromEntries(Object.entries(data).filter(([, s]) => !s.isNSFW));
  }
  if (opts.sites?.length) {
    const wanted = new Set(opts.sites.map((s) => s.toLowerCase()));
    data = Object.fromEntries(Object.entries(data).filter(([n]) => wanted.has(n.toLowerCase())));
  }

  return runPool(Object.entries(data), opts.concurrency, async ([name, info]) => {
    const r = await checkSite(username, name, info, opts.timeoutMs);
    opts.onResult?.(r);
    return r;
  });
}

// ---------- 7. CLI ----------

function parseArgs(argv: string[]) {
  const usernames: string[] = [];
  const sites: string[] = [];
  let timeout = 60,
    nsfw = false,
    all = false,
    json: string | undefined,
    data: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--timeout") timeout = Number(argv[++i]);
    else if (a === "--site") sites.push(argv[++i]);
    else if (a === "--nsfw") nsfw = true;
    else if (a === "--all" || a === "--print-all") all = true;
    else if (a === "--json") json = argv[++i];
    else if (a === "--data") data = argv[++i];
    else usernames.push(a);
  }
  return { usernames, sites, timeout, nsfw, all, json, data };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.usernames.length) {
    console.log(
      "Usage: sherlock.ts <username...> [--timeout s] [--site Nom] [--nsfw] [--all] [--json f] [--data f]",
    );
    process.exit(1);
  }

  const report: Record<string, QueryResult[]> = {};
  for (const u of args.usernames.flatMap(expandUsername)) {
    console.log(`\n[*] Recherche de ${u}...`);
    const results = await sherlock(u, {
      timeoutMs: args.timeout * 1000,
      concurrency: 20,
      sites: args.sites,
      nsfw: args.nsfw,
      dataSource: args.data,
      onResult: (r) => {
        if (r.status === QueryStatus.CLAIMED) console.log(`[+] ${r.site}: ${r.url}`);
        else if (args.all)
          console.log(`[-] ${r.site}: ${r.status}${r.context ? ` (${r.context})` : ""}`);
      },
    });
    const found = results.filter((r) => r.status === QueryStatus.CLAIMED).length;
    console.log(`[*] ${found} résultat(s) pour ${u}`);
    report[u] = results;
  }

  if (args.json) await writeFile(args.json, JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
