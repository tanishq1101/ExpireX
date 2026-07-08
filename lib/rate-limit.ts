import "server-only";

// Best-effort in-memory sliding-window rate limiter, keyed per user per route.
// Guards AI/external-lookup endpoints from being hammered by one signed-in account.
// Caveat: state is per warm serverless instance, not shared across the fleet — it
// won't stop a determined distributed attacker, but it does stop runaway loops/bots.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    hits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}
