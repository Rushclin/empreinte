import type { Metadata } from "next";
import { CONTRIBUTING_URL, GITHUB_URL } from "@/lib/config";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 leading-relaxed">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">About Empreinte</h1>
        <p>
          <b>Empreinte</b> (French for “footprint”) finds where a username exists across hundreds of
          websites. It is a TypeScript take on{" "}
          <a
            className="underline underline-offset-4"
            href="https://github.com/sherlock-project/sherlock"
          >
            Sherlock
          </a>
          , available as a website and as a command line tool:
        </p>
        <pre className="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-sm">
          npx empreinte johndoe
        </pre>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How it works</h2>
        <p>
          For each site, Empreinte requests the profile page of the username and decides whether the
          account exists from the HTTP status code, the content of the page or a redirect. Each site
          is described by a small JSON file, so anyone can add or fix one.
        </p>
        <p className="text-sm text-muted-foreground">
          Results can be wrong: sites change, rate-limit or block automated requests. Always verify
          a result by opening the profile.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Responsible use</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Search for your own usernames, or with a legitimate reason.</li>
          <li>Do not use Empreinte to stalk, harass or dox anyone.</li>
          <li>Respect the terms of service of the sites being checked.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <p>
          Searched usernames are never stored and never logged. The only data kept, for a minute, is
          a counter per IP address used for rate limiting.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Open source</h2>
        <p>
          Empreinte is MIT licensed. The code, the site list and the issue tracker are on{" "}
          <a className="underline underline-offset-4" href={GITHUB_URL}>
            GitHub
          </a>
          . Missing a site?{" "}
          <a className="underline underline-offset-4" href={CONTRIBUTING_URL}>
            Add it
          </a>{" "}
          in a few minutes.
        </p>
      </section>
    </main>
  );
}
