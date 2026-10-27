# Security Policy

## Supported versions

Only the latest published versions of `empreinte` and `@empreinte/core`, and the website built
from the `main` branch, receive security fixes.

## Reporting a vulnerability

**Please do not open a public issue.** Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/Rushclin/empreinte/security/advisories/new).

Include a description, the impact, and steps to reproduce. You should get a first answer within
a week. Once a fix is released, you will be credited in the advisory unless you prefer otherwise.

## Scope

In scope, for example:

- Bypassing the rate limiting or the concurrency limit of the web API
- Server-side request forgery through site definitions or API parameters
- Injection in the CLI exports, the website or the GitHub workflows
- Any way the website could store or leak searched usernames

Out of scope: false positives or false negatives of a site (please open a regular issue), and
the behavior of the third-party websites that Empreinte checks.
