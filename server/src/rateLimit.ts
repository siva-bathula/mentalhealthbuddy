/** In-memory sliding-window rate limiter per IP (one process — not shared across replicas). */

export type RateLimitConfig = {
  windowMs: number;
  maxPerWindow: number;
  maxTrackedIps: number;
};

const defaults: RateLimitConfig = {
  windowMs: 60_000,
  maxPerWindow: 40,
  maxTrackedIps: 20_000,
};

let config: RateLimitConfig = { ...defaults };

/** Timestamp arrays per IP — call after {@link loadEnv} / server bootstrap. */
export function initRateLimit(partial: Partial<RateLimitConfig>): void {
  config = {
    ...config,
    ...partial,
    windowMs: partial.windowMs ?? config.windowMs,
    maxPerWindow: partial.maxPerWindow ?? config.maxPerWindow,
    maxTrackedIps: partial.maxTrackedIps ?? config.maxTrackedIps,
  };
}

const buckets = new Map<string, number[]>();

/** Remove timestamps outside window and drop empty IPs. */
function pruneStale(now: number): void {
  for (const [ip, times] of buckets) {
    const recent = times.filter((t) => now - t < config.windowMs);
    if (recent.length === 0) buckets.delete(ip);
    else buckets.set(ip, recent);
  }
}

/** Bound memory when many IPs appear (e.g. spoofed headers). Drops oldest keys by Map insertion order. */
function evictExcessBuckets(): void {
  while (buckets.size > config.maxTrackedIps) {
    const first = buckets.keys().next().value;
    if (first === undefined) break;
    buckets.delete(first);
  }
}

/** Allow request if under cap; updates sliding window for this IP. */
export function rateLimitAllow(ip: string): boolean {
  const now = Date.now();

  // Occasional global prune so idle IPs don't linger forever.
  if (Math.random() < 0.02) {
    pruneStale(now);
  }

  let recent = buckets.get(ip) ?? [];
  recent = recent.filter((t) => now - t < config.windowMs);

  if (recent.length >= config.maxPerWindow) {
    buckets.set(ip, recent);
    evictExcessBuckets();
    return false;
  }

  recent.push(now);
  buckets.set(ip, recent);
  evictExcessBuckets();
  return true;
}
