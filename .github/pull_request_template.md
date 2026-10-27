## What does this pull request do?

<!-- A new site, a fix for a site, a feature, a bug fix… Link the related issue if any. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass

### When adding or fixing a site

- [ ] One file per site in `sites/`, named after the slug of `name` (e.g. `hacker-news.json`)
- [ ] The file starts with `"$schema": "../schema/site.schema.json"`
- [ ] `username_claimed` is a public account that is unlikely to disappear
- [ ] `pnpm check-site sites/<file>.json` passes locally (paste the output below)
- [ ] I ran `pnpm build-sites` and committed `packages/core/data/sites.json`

<details><summary>check-site output</summary>

```
paste here
```

</details>

### When changing a published package

- [ ] I added a changeset (`pnpm changeset`)
