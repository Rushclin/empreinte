# Empreinte

**Empreinte** (French for _footprint_) finds where a username exists across hundreds of websites.
Open-source, TypeScript, and community-driven: anyone can add a site.

```console
$ npx empreinte torvalds --tag dev

[*] Checking torvalds on 16 sites
[+] Codeberg: https://codeberg.org/torvalds
[+] GitHub: https://github.com/torvalds
[+] Hacker News: https://news.ycombinator.com/user?id=torvalds
…
[*] torvalds: 9 found / 16 checked in 2.1s
```

- **Website**: search from your browser, results appear in real time — see [Self-hosting](#self-hosting) to run your own
- **CLI**: `npx empreinte <username>`
- **Library**: `@empreinte/core`, the detection engine, usable from any Node.js program
- **Community-driven**: every site is a small JSON file, validated and tested automatically

> Empreinte is a TypeScript take on [Sherlock](https://github.com/sherlock-project/sherlock).
> Its detection logic and many site definitions come from Sherlock (MIT License). Thank you to
> the Sherlock contributors.

## Responsible use

Use Empreinte to check your own online footprint, or with a legitimate reason (security research,
brand protection, journalism). **Do not use it to stalk, harass or dox anyone**, and respect the
terms of service of the sites being checked. Results can be wrong: always verify a profile by
opening it.

## Command line

Requires Node.js 20 or later.

```bash
npx empreinte johndoe                         # check every site
npx empreinte john{?}doe alice                # {?} tries john_doe, john-doe and john.doe
npx empreinte johndoe --tag dev               # only sites tagged "dev"
npx empreinte johndoe --site GitHub --site npm
npx empreinte johndoe --nsfw --timeout 20 --print-all --json out.json --csv out.csv
npx empreinte johndoe --proxy http://127.0.0.1:8080
npx empreinte --list-sites
```

| Option                          | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `-s, --site <name>`             | Only check this site. Repeatable, or comma-separated.           |
| `-t, --tag <tag>`               | Only check sites with this tag. Repeatable, or comma-separated. |
| `--nsfw`                        | Include NSFW sites (excluded by default).                       |
| `--timeout <s>`                 | Timeout of each request, in seconds (default 15).               |
| `--concurrency <n>`             | Simultaneous requests (default 20).                             |
| `--proxy <url>`                 | HTTP(S) proxy.                                                  |
| `--print-all`                   | Also print missing accounts, errors and WAF blocks.             |
| `--json <file>`, `--csv <file>` | Export every result.                                            |
| `--list-sites`                  | List supported sites.                                           |

## Library

```bash
npm install @empreinte/core
```

```ts
import { search } from "@empreinte/core";

for await (const result of search("johndoe", { tags: ["dev"], timeoutMs: 10_000 })) {
  if (result.status === "claimed") console.log(result.site, result.url);
}
```

`search()` yields results as soon as they arrive. Each result has a `status`:

| Status      | Meaning                                                              |
| ----------- | -------------------------------------------------------------------- |
| `claimed`   | The account exists.                                                  |
| `available` | The account does not exist.                                          |
| `illegal`   | The username is not valid on this site; no request was made.         |
| `waf`       | Blocked by an anti-bot protection (Cloudflare, AWS WAF, PerimeterX). |
| `unknown`   | Network error or timeout (see `context`).                            |

Options: `timeoutMs`, `concurrency`, `sites`, `tags`, `includeNSFW`, `proxy`, `signal`
(an `AbortSignal`), `data` (your own site list). Other exports: `loadSites()`, `filterSites()`,
`checkSite()`, `expandUsername()`, `SiteSchema` and all types.

## Web API

The website exposes two endpoints:

- `GET /api/search?username=johndoe&tags=dev,music&nsfw=1` streams results as
  [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events):
  `start` (`{ username, total }`), then one `result` per site, then `done`
  (`{ found, checked, durationMs }`). The search stops when the client disconnects.
- `GET /api/sites` returns the supported sites and tags.

```bash
curl -N "http://localhost:3000/api/search?username=torvalds&tags=dev"
```

Searches are limited to 5 per minute per IP, and the number of simultaneous searches is capped.
Searched usernames are never stored nor logged.

## Self-hosting

**Vercel**: import the repository and set the root directory to `apps/web`. Set
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` so that the rate limit is shared between
serverless instances.

**Docker**:

```bash
docker build -t empreinte .
docker run -p 3000:3000 empreinte
```

All environment variables are optional and listed in [`.env.example`](.env.example). If you run
Empreinte behind a reverse proxy, make sure it overwrites the `X-Forwarded-For` header, which is
used to identify clients for rate limiting.

## Development

Requires Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm dev          # website on http://localhost:3000
pnpm test         # unit tests, no network access
pnpm lint         # Biome
pnpm typecheck
pnpm build
```

```
packages/core    @empreinte/core — detection engine (no Next.js dependency)
packages/cli     empreinte — the command line
apps/web         Next.js website and API
sites/           one JSON file per site — the community part
schema/          JSON Schema of a site file, generated from Zod
scripts/         build-sites, check-site, gen-schema, import-sherlock
```

## Contributing

The easiest and most useful contribution is adding or fixing a site. It takes a few minutes: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Site definitions adapted from
[Sherlock](https://github.com/sherlock-project/sherlock) are © the Sherlock Project, MIT License.
