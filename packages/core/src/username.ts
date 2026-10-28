/** Separators tried for the `{?}` placeholder, as in Sherlock. */
export const USERNAME_SEPARATORS = ["_", "-", "."] as const;

/**
 * Expands the `{?}` placeholder: "john{?}doe" -> ["john_doe", "john-doe", "john.doe"].
 * A username without placeholder is returned as is.
 */
export function expandUsername(username: string): string[] {
  if (!username.includes("{?}")) return [username];
  return USERNAME_SEPARATORS.map((separator) => username.replaceAll("{?}", separator));
}
