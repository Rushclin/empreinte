/**
 * Generates schema/site.schema.json from the Zod schema of @empreinte/core.
 * Usage: pnpm gen-schema [--check]
 */
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { SiteSchema } from "../packages/core/src/index.js";
import { SCHEMA_PATH } from "./lib/sites.js";

const includesMessage = {
  anyOf: [{ const: "message" }, { type: "array", contains: { const: "message" } }],
};

const schema = {
  ...z.toJSONSchema(SiteSchema, { io: "input", target: "draft-2020-12" }),
  $id: "https://github.com/Rushclin/empreinte/blob/main/schema/site.schema.json",
  title: "Empreinte site definition",
  description:
    "One website supported by Empreinte. Generated from packages/core/src/schema.ts by `pnpm gen-schema`; do not edit by hand.",
  // Cross-field rule that Zod expresses with a refinement.
  if: { properties: { errorType: includesMessage }, required: ["errorType"] },
  then: { required: ["errorMsg"] },
};

const output = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(SCHEMA_PATH, "utf8").catch(() => "");
  if (current !== output) {
    console.error("schema/site.schema.json is outdated. Run `pnpm gen-schema`.");
    process.exit(1);
  }
  console.log("schema/site.schema.json is up to date.");
} else {
  await writeFile(SCHEMA_PATH, output);
  console.log(`Wrote ${SCHEMA_PATH}`);
}
