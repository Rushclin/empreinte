import { z } from "zod";

/** The three detection strategies inherited from Sherlock. */
export const ERROR_TYPES = ["message", "status_code", "response_url"] as const;
export const REQUEST_METHODS = ["GET", "HEAD", "POST", "PUT"] as const;

export const ErrorTypeSchema = z
  .enum(ERROR_TYPES)
  .describe(
    "How a missing account is detected: `message` (an error text is in the page), `status_code` (the HTTP status is not 2xx or is in `errorCode`) or `response_url` (the site redirects instead of answering 2xx).",
  );

const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

const urlTemplate = (what: string) =>
  z
    .url({ protocol: /^https?$/ })
    .regex(/\{\}/, `${what} must contain the "{}" placeholder for the username`);

/** Schema of one file in `sites/`. This is the single source of truth for the site format. */
export const SiteSchema = z
  .strictObject({
    $schema: z.string().optional().describe("Path to the JSON Schema, for editor autocompletion."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .describe("Display name of the site. The file name must be the slug of this name."),
    url: urlTemplate("url").describe(
      'URL of a profile page. "{}" is replaced by the username. Shown to the user.',
    ),
    urlMain: z.url({ protocol: /^https?$/ }).describe("Home page of the site."),
    urlProbe: urlTemplate("urlProbe")
      .optional()
      .describe(
        "URL actually requested, when it differs from `url` (an API endpoint for example).",
      ),
    errorType: z
      .union([ErrorTypeSchema, z.array(ErrorTypeSchema).min(1)])
      .describe("Detection strategy, or several strategies applied in order."),
    errorMsg: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
      .optional()
      .describe(
        "Text(s) present in the page when the account does NOT exist. Required by `message`.",
      ),
    errorCode: z
      .union([z.int().min(100).max(599), z.array(z.int().min(100).max(599)).min(1)])
      .optional()
      .describe("HTTP status code(s) meaning the account does NOT exist, even if 2xx."),
    regexCheck: z
      .string()
      .refine(isValidRegex, { message: "regexCheck must be a valid regular expression" })
      .optional()
      .describe(
        "Usernames that do not match this regex are not supported by the site (no request).",
      ),
    username_claimed: z
      .string()
      .min(1)
      .describe("A username known to exist on the site. Used by the automated checks."),
    tags: z
      .array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "tags must be lowercase-kebab-case"))
      .default([])
      .describe('Categories used for filtering, e.g. ["dev"], ["social"], ["music"].'),
    isNSFW: z
      .boolean()
      .default(false)
      .describe("Adult content. Excluded from searches by default."),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Extra HTTP headers sent with the request."),
    request_method: z
      .enum(REQUEST_METHODS)
      .optional()
      .describe("HTTP method. Defaults to HEAD for `status_code` only, GET otherwise."),
    request_payload: z
      .unknown()
      .optional()
      .describe('JSON body sent with the request. "{}" is replaced by the username, recursively.'),
  })
  .superRefine((site, ctx) => {
    const types = Array.isArray(site.errorType) ? site.errorType : [site.errorType];
    if (types.includes("message") && site.errorMsg === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["errorMsg"],
        message: 'errorMsg is required when errorType includes "message"',
      });
    }
    if (new Set(types).size !== types.length) {
      ctx.addIssue({ code: "custom", path: ["errorType"], message: "errorType has duplicates" });
    }
    if (site.regexCheck && isValidRegex(site.regexCheck)) {
      if (!new RegExp(site.regexCheck).test(site.username_claimed)) {
        ctx.addIssue({
          code: "custom",
          path: ["username_claimed"],
          message: "username_claimed does not match regexCheck",
        });
      }
    }
  });

/** A site definition as written in a `sites/*.json` file. */
export type SiteInput = z.input<typeof SiteSchema>;
/** A validated site definition, with defaults applied. */
export type Site = Omit<z.output<typeof SiteSchema>, "$schema">;
export type ErrorType = (typeof ERROR_TYPES)[number];
export type RequestMethod = (typeof REQUEST_METHODS)[number];

/** Validates one site definition. Throws a `ZodError` when invalid. */
export function parseSite(input: unknown): Site {
  const { $schema: _, ...site } = SiteSchema.parse(input);
  return site;
}

/** Validates a site definition without throwing. */
export function safeParseSite(input: unknown) {
  return SiteSchema.safeParse(input);
}

/**
 * File name (without extension) expected for a site in `sites/`.
 * "Hacker News" -> "hacker-news", "Chess.com" -> "chess-com".
 */
export function siteSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
