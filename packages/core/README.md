# @empreinte/core

Detection engine of [Empreinte](https://github.com/Rushclin/empreinte): find where a username
exists across hundreds of websites. Node.js 20+, no framework dependency.

```ts
import { search } from "@empreinte/core";

for await (const result of search("johndoe", { tags: ["dev"] })) {
  if (result.status === "claimed") console.log(result.site, result.url);
}
```

Results are yielded as soon as they arrive. Options: `timeoutMs` (15000), `concurrency` (20),
`sites`, `tags`, `includeNSFW` (false), `proxy`, `signal`, `data`. Also exported: `loadSites()`,
`filterSites()`, `checkSite()`, `expandUsername()`, `SiteSchema` (Zod) and all types.

Use it responsibly. See the [main README](https://github.com/Rushclin/empreinte#readme).
Detection logic and many site definitions are adapted from
[Sherlock](https://github.com/sherlock-project/sherlock) (MIT). License: MIT.
