// Minimal fixed-window rate limiter for the free (unpaid) API surface.
// Paid x402 routes are deliberately not limited: the payment itself is
// the anti-abuse mechanism, and a paying buyer must never be throttled.
//
// This runs in-memory per Worker isolate. It is not a globally consistent
// counter (isolates don't share state), so treat it as abuse damping, not
// an exact quota. That is the right trade-off here: the goal is to stop a
// single caller hammering the trial voucher and tRPC surface from one
// vantage point, which per-isolate limiting does well. No extra binding,
// no KV, no durable object, zero added latency on the hot path.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Cap the map so a spray of spoofed IPs cannot grow memory without bound.
// On overflow the oldest expired buckets are evicted first; if none are
// expired the map is simply cleared (fail open for legit traffic, still
// bounded memory).
const MAX_BUCKETS = 10_000;

export type RateRule = {
  // Requests allowed per windowMs for one key.
  limit: number;
  windowMs: number;
};

export function rateLimited(
  key: string,
  rule: RateRule,
): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    b = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > rule.limit) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  return { limited: false, retryAfterSec: 0 };
}

// Caller IP from Cloudflare's connecting-IP header, falling back to a
// shared bucket when absent (local dev / non-CF runtimes).
export function callerKey(req: Request, scope: string): string {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return `${scope}:${ip}`;
}
