/**
 * Best-effort client IP, from the headers set by the hosting platform or reverse proxy.
 * When self-hosting, make sure your proxy overwrites `x-forwarded-for`.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
