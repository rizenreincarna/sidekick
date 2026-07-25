// Minimal in-process rate limiter for sensitive endpoints.
// Buckets keyed by (bucket, key) with a sliding window. Suitable for the
// single-instance deployment; if the app ever runs multiple processes,
// move this to a shared store (Redis/DB).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const entry = buckets.get(id);

  if (!entry || now >= entry.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordRateLimitHit(bucket: string, key: string, windowMs: number): void {
  const id = `${bucket}:${key}`;
  const entry = buckets.get(id);
  if (entry) {
    entry.count += 1;
  } else {
    buckets.set(id, { count: 1, resetAt: Date.now() + windowMs });
  }
}

export function resetRateLimit(bucket: string, key: string): void {
  buckets.delete(`${bucket}:${key}`);
}

export function clientKeyFromRequest(request: Request, accountKey?: string): string {
  // Trust the platform-provided IP only when available; Next.js behind Nginx
  // sets x-forwarded-for, but spoofed headers are possible. Use the first hop.
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "unknown";
  return accountKey ? `${accountKey}|${ip}` : ip;
}
