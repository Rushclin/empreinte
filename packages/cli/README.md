# empreinte

Find where a username exists across hundreds of websites, from your terminal.
Part of [Empreinte](https://github.com/Rushclin/empreinte) (French for "footprint").

```bash
npx empreinte johndoe
npx empreinte john{?}doe alice --tag dev --site GitHub --site npm
npx empreinte johndoe --nsfw --timeout 20 --print-all --json out.json --csv out.csv
npx empreinte --list-sites
```

Run `npx empreinte --help` for every option.

**Responsible use**: only search for usernames you own or have a legitimate reason to look up.
Respect the terms of service of each site and the privacy of others.

Inspired by [Sherlock](https://github.com/sherlock-project/sherlock). License: MIT.
