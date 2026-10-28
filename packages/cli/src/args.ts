/**
 * Collects every value of a repeatable flag (`--site A --site B`, `--site=A,B`, `-s A`).
 * citty keeps only the last occurrence, so repeatable flags are read from the raw arguments.
 */
export function collectFlag(rawArgs: string[], names: string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] ?? "";
    if (arg === "--") break;
    for (const name of names) {
      const flag = name.length === 1 ? `-${name}` : `--${name}`;
      if (arg === flag) {
        const next = rawArgs[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          values.push(next);
          i++;
        }
      } else if (arg.startsWith(`${flag}=`)) {
        values.push(arg.slice(flag.length + 1));
      }
    }
  }
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Parses a positive number option, or throws a readable error. */
export function positiveNumber(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} must be a positive number (got "${value}")`);
  }
  return number;
}
