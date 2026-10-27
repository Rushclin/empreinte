import { z } from "zod";

export const MAX_USERNAME_LENGTH = 64;

const list = (item: z.ZodString, max: number) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(item).max(max));

/** Query string of `GET /api/search`. */
export const SearchQuerySchema = z.object({
  username: z
    .string({ error: "username is required" })
    .trim()
    .min(1, "username is required")
    .max(MAX_USERNAME_LENGTH, `username must be at most ${MAX_USERNAME_LENGTH} characters`)
    .regex(
      /^[\p{L}\p{N}._-]+$/u,
      "username may only contain letters, digits, dots, dashes and underscores",
    ),
  tags: list(z.string().regex(/^[a-z0-9-]{1,32}$/, "invalid tag"), 20),
  sites: list(z.string().min(1).max(64), 50),
  nsfw: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export type SearchQuery = z.output<typeof SearchQuerySchema>;

export function parseSearchQuery(params: URLSearchParams) {
  return SearchQuerySchema.safeParse({
    username: params.get("username") ?? undefined,
    tags: params.get("tags") ?? undefined,
    sites: params.get("sites") ?? undefined,
    nsfw: params.get("nsfw") ?? undefined,
  });
}
