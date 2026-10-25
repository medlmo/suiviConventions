// Per-instance limits: no account-wide lock that another address can trigger.
const PAIR_LIMIT = { windowMs: 30 * 60 * 1000, maxAttempts: 12 };
const IP_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 120 };
const MAX_TRACKED_KEYS = 20_000;
const MAX_CONCURRENT_VERIFICATIONS = 4;
const CLEANUP_INTERVAL_MS = 60_000;

type AttemptWindow = { count: number; expiresAt: number };
const attemptsByPair = new Map<string, AttemptWindow>();
const attemptsByIp = new Map<string, AttemptWindow>();
let activeVerifications = 0;

function keys(username: string, ip: string) {
  const address = ip.trim().toLowerCase() || "unknown";
  // JSON encoding prevents collisions between user-controlled key components.
  return { address, pair: JSON.stringify([address, username.trim().toLocaleLowerCase("fr-FR")]) };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const windows of [attemptsByPair, attemptsByIp]) {
    for (const [key, window] of windows) {
      if (window.expiresAt <= now) windows.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanup.unref();

function retryAfter(
  windows: Map<string, AttemptWindow>, key: string, maximum: number, now: number,
): number {
  const window = windows.get(key);
  if (!window) return 0;
  if (window.expiresAt <= now) {
    windows.delete(key);
    return 0;
  }
  return window.count >= maximum ? Math.ceil((window.expiresAt - now) / 1000) : 0;
}

function increment(windows: Map<string, AttemptWindow>, key: string, windowMs: number, now: number) {
  const window = windows.get(key);
  if (window) window.count += 1;
  else windows.set(key, { count: 1, expiresAt: now + windowMs });
}

/** Reserve synchronously, before any DB/password await. Return retry delay, or zero. */
export function reserveLoginAttempt(username: string, ip: string): number {
  const now = Date.now();
  const { address, pair } = keys(username, ip);
  const delay = Math.max(
    retryAfter(attemptsByPair, pair, PAIR_LIMIT.maxAttempts, now),
    retryAfter(attemptsByIp, address, IP_LIMIT.maxAttempts, now),
  );
  if (delay > 0) return delay;
  // Never evict an active restriction to admit an attacker-controlled new key.
  if (
    (!attemptsByPair.has(pair) && attemptsByPair.size >= MAX_TRACKED_KEYS) ||
    (!attemptsByIp.has(address) && attemptsByIp.size >= MAX_TRACKED_KEYS)
  ) return CLEANUP_INTERVAL_MS / 1000;
  increment(attemptsByPair, pair, PAIR_LIMIT.windowMs, now);
  increment(attemptsByIp, address, IP_LIMIT.windowMs, now);
  return 0;
}

export function resetLoginAttempts(username: string, ip: string): void {
  // A successful login clears only this pair, never the shared IP budget.
  attemptsByPair.delete(keys(username, ip).pair);
}

/** No queue: bound scrypt/DB work even when unknown accounts also run scrypt. */
export function reserveLoginVerification(): (() => void) | undefined {
  if (activeVerifications >= MAX_CONCURRENT_VERIFICATIONS) return undefined;
  activeVerifications += 1;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      activeVerifications -= 1;
    }
  };
}
