# Contributing to Empreinte

Thank you for helping! The most useful contribution is **adding or fixing a site**. Each site is
one small JSON file in [`sites/`](sites/), and every pull request is checked automatically.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 22 and pnpm 10 (`corepack enable` installs pnpm).

```bash
git clone https://github.com/<you>/empreinte && cd empreinte
pnpm install
```

## Add a site, step by step

### 1. Look at how the site answers

Pick two usernames:

- one that **exists**, ideally a well-known account that will not disappear;
- one that **does not exist**, like `zq8x7v6w5u4t3s2r1qpo`.

Compare what the site returns for each. With curl:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://example.com/users/alice
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://example.com/users/zq8x7v6w5u4t3s2r1qpo
```

This tells you which detection strategy (`errorType`) to use.

### 2. Choose the detection strategy

Use the simplest strategy that works, in this order of preference.

#### `status_code`: the site answers 404 (or any non-2xx) for missing accounts

The most reliable and fastest strategy (a `HEAD` request is enough). Example, GitHub:

```
https://github.com/torvalds              -> 200   (exists)
https://github.com/zq8x7v6w5u4t3s2r1qpo  -> 404   (missing)
```

```json
{
  "$schema": "../schema/site.schema.json",
  "name": "GitHub",
  "url": "https://github.com/{}",
  "urlMain": "https://github.com/",
  "errorType": "status_code",
  "regexCheck": "^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$",
  "username_claimed": "torvalds",
  "tags": ["dev"],
  "isNSFW": false
}
```

If the site answers 2xx for missing accounts with a special code (e.g. `204`), list it in
`errorCode`. If a page behaves differently with `HEAD`, add `"request_method": "GET"`.

#### `message`: the site answers 200 for everything, but the page says the account is missing

Find a text that appears **only** on the "not found" page. Example, Telegram:

```
https://t.me/blue                    -> 200, a profile page
https://t.me/zq8x7v6w5u4t3s2r1qpo    -> 200, a generic page titled "Telegram Messenger"
```

```json
{
  "$schema": "../schema/site.schema.json",
  "name": "Telegram",
  "url": "https://t.me/{}",
  "urlMain": "https://t.me/",
  "errorType": "message",
  "errorMsg": ["<title>Telegram Messenger</title>"],
  "regexCheck": "^[a-zA-Z0-9_]{3,32}[^_]$",
  "username_claimed": "blue",
  "tags": ["messaging"],
  "isNSFW": false
}
```

`errorMsg` can be a string or a list (any match means "missing"). Choose a text that will not
appear on a real profile, and avoid texts that change with the language.

#### `response_url`: the site redirects missing accounts somewhere else

Redirects are not followed: a 2xx answer means the account exists, a redirect means it does not.
Example, WordPress:

```
https://blue.wordpress.com/                   -> 200                     (exists)
https://zq8x7v6w5u4t3s2r1qpo.wordpress.com/   -> 302 to a signup page    (missing)
```

```json
{
  "$schema": "../schema/site.schema.json",
  "name": "WordPress",
  "url": "https://{}.wordpress.com/",
  "urlMain": "https://wordpress.com",
  "errorType": "response_url",
  "regexCheck": "^[a-zA-Z][a-zA-Z0-9_-]*$",
  "username_claimed": "blue",
  "tags": ["blogging"],
  "isNSFW": false
}
```

#### Tips

- **Public APIs are often more reliable** than profile pages. Keep `url` as the page shown to users
  and put the API in `urlProbe`. Example: [`sites/bitbucket.json`](sites/bitbucket.json).
- Several strategies can be combined (`"errorType": ["message", "status_code"]`); they are applied
  in that order and the account is "missing" as soon as one says so.
- `regexCheck` avoids useless requests and false positives for usernames the site does not allow.
- Need a `POST`? Use `request_method` and `request_payload` (`{}` is replaced by the username).
- Extra `headers` can be set when a site needs them.

### 3. Create the file

Create `sites/<slug>.json`, where the slug is the lowercase name with non-alphanumeric characters
replaced by dashes: `GitHub` → `github.json`, `Hacker News` → `hacker-news.json`,
`Chess.com` → `chess-com.json`.

Keep the `"$schema"` line: VS Code and other editors then autocomplete and validate the file.

| Field              | Required       | Description                                               |
| ------------------ | -------------- | --------------------------------------------------------- |
| `name`             | yes            | Display name.                                             |
| `url`              | yes            | Profile URL with `{}` for the username.                   |
| `urlMain`          | yes            | Home page.                                                |
| `errorType`        | yes            | `status_code`, `message`, `response_url`, or a list.      |
| `username_claimed` | yes            | An existing username, used by automated checks.           |
| `errorMsg`         | with `message` | Text(s) shown when the account does not exist.            |
| `errorCode`        | no             | HTTP code(s) meaning "missing", even if 2xx.              |
| `urlProbe`         | no             | URL actually requested, if different from `url`.          |
| `regexCheck`       | no             | Usernames not matching it are skipped.                    |
| `request_method`   | no             | `GET`, `HEAD`, `POST` or `PUT`.                           |
| `request_payload`  | no             | JSON body; `{}` is replaced by the username.              |
| `headers`          | no             | Extra HTTP headers.                                       |
| `tags`             | no             | Lowercase categories: `dev`, `social`, `music`, `gaming`… |
| `isNSFW`           | no             | `true` for adult sites (excluded by default).             |

### 4. Test it locally

```bash
pnpm check-site sites/example.json
```

This checks the file against the schema, then requests the real site with `username_claimed`
(must be `claimed`) and a random 20-character username (must be `available`). It prints the HTTP
code, the method, an excerpt of the response and the verdict:

```
✓ PASS  GitHub  (sites/github.json)
  ✓ torvalds  expected claimed, got claimed
      HEAD https://github.com/torvalds -> HTTP 200 in 412 ms
  ✓ qeg7aoirahuyt7q6g4r5  expected available, got available
      HEAD https://github.com/qeg7aoirahuyt7q6g4r5 -> HTTP 404 in 380 ms
```

Then try it end to end, and regenerate the bundled list:

```bash
pnpm --filter empreinte build && node packages/cli/dist/index.js someone --site Example
pnpm build-sites
```

### 5. Open a pull request

Commit the new file **and** `packages/core/data/sites.json`. The bot comments the result of the
checks on your pull request. Some sites block requests from CI servers: if your site works
locally but fails in CI, paste your local `check-site` output in the pull request.

## Fix a site

Broken sites are listed every week in an issue labelled
[`site-health`](https://github.com/Rushclin/empreinte/issues?q=label%3Asite-health). Run
`pnpm check-site <Site name>` to see what changed, update the file, and open a pull request. If a
site cannot be checked reliably anymore (login wall, anti-bot protection), remove its file.

## Import sites from Sherlock

`pnpm import-sherlock --only "Site A,Site B"` converts entries of Sherlock's `data.json` into our
format. Always run `check-site` on imported sites: many need adjustments.

## Code contributions

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must pass. `pnpm format` fixes
  formatting.
- Unit tests never make real network requests: use undici's `MockAgent` (see
  `packages/core/test`).
- Changing the site format? Edit `packages/core/src/schema.ts`, then run `pnpm gen-schema`.
- Changing `@empreinte/core` or the `empreinte` CLI? Add a changeset with `pnpm changeset`.
- Code, comments and UI are in English.
