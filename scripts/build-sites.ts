/**
 * Validates every file in sites/ and merges them into packages/core/data/sites.json.
 *
 * Usage:
 *   pnpm build-sites            validate and write the bundle
 *   pnpm validate-sites         validate only, and fail if the bundle is outdated (CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import { BUNDLE_PATH, readAllSites } from "./lib/sites.js";

const checkOnly = process.argv.includes("--check");
const files = await readAllSites();
const invalid = files.filter((entry) => entry.errors.length > 0);

for (const entry of invalid) {
  console.error(`✗ ${entry.file}`);
  for (const error of entry.errors) console.error(`    ${error}`);
}
if (invalid.length > 0) {
  console.error(`\n${invalid.length} invalid site file(s) out of ${files.length}.`);
  process.exit(1);
}

const sites = files
  .flatMap((entry) => (entry.site ? [entry.site] : []))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
const output = `${JSON.stringify(sites, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(BUNDLE_PATH, "utf8").catch(() => "");
  if (current !== output) {
    console.error(
      `All ${sites.length} site files are valid, but packages/core/data/sites.json is outdated. Run \`pnpm build-sites\`.`,
    );
    process.exit(1);
  }
  console.log(`✓ ${sites.length} site files are valid and the bundle is up to date.`);
} else {
  await writeFile(BUNDLE_PATH, output);
  console.log(`✓ ${sites.length} sites written to packages/core/data/sites.json`);
}
