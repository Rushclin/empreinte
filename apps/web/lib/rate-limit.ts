export interface RateLimitResult {
  success: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Unix time (ms) when a new request will be allowed. */
  reset: number;
}

/** Pluggable rate limiter. Keys are client IPs; they are never logged nor stored longer than the window. */
export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

/** Sliding-window rate limiter kept in memory. Good for a single server instance. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = this.now();
    if (this.hits.size > 10_000) this.prune(now);
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    const oldest = recent[0] ?? now;
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { success: false, remaining: 0, reset: oldest + this.windowMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { success: true, remaining: this.max - recent.length, reset: oldest + this.windowMs };
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((time) => now - time >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** Upstash Redis rate limiter, shared by every instance (serverless friendly). */
export async function createUpstashRateLimiter(max: number): Promise<RateLimiter> {
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import("@upstash/ratelimit"),
    import("@upstash/redis"),
  ]);
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, "60 s"),
    prefix: "empreinte:search",
  });
  return {
    async limit(key) {
      const { success, remaining, reset } = await ratelimit.limit(key);
      return { success, remaining, reset };
    },
  };
}

let shared: Promise<RateLimiter> | undefined;

/**
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set,
 * the in-memory limiter otherwise.
 */
export function getRateLimiter(max: number): Promise<RateLimiter> {
  shared ??=
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? createUpstashRateLimiter(max)
      : Promise.resolve(new MemoryRateLimiter(max));
  return shared;
}
