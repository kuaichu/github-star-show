import net from "node:net";

const FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);
const OVERFLOW_KEY = "__oauth_login_overflow__";

function positiveInteger(value, fallback, name, maximum) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

function validProxyEntry(entry) {
  const slash = entry.lastIndexOf("/");
  const address = slash === -1 ? entry : entry.slice(0, slash);
  const family = net.isIP(address);
  if (!family) return false;
  if (slash === -1) return true;
  const prefix = Number(entry.slice(slash + 1));
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= (family === 4 ? 32 : 128);
}

export function parseTrustProxy(value = process.env.TRUST_PROXY) {
  const configured = String(value || "").trim().toLowerCase();
  if (FALSE_VALUES.has(configured)) return false;
  if (configured === "true" || configured === "1" || configured === "*") {
    throw new Error("TRUST_PROXY must list explicit proxy IP addresses or CIDR ranges; true is forbidden.");
  }
  const entries = configured.split(",").map(item => item.trim());
  if (!entries.length || entries.length > 16 || entries.some(entry => !validProxyEntry(entry))) {
    throw new Error("TRUST_PROXY must list at most 16 explicit proxy IP addresses or CIDR ranges.");
  }
  return entries;
}

export function createOAuthLoginRateLimiter(options = {}) {
  const limit = positiveInteger(
    options.limit ?? process.env.OAUTH_LOGIN_RATE_LIMIT_MAX,
    10,
    "OAUTH_LOGIN_RATE_LIMIT_MAX",
    1_000
  );
  const windowMs = positiveInteger(
    options.windowMs ?? (process.env.OAUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS
      ? Number(process.env.OAUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS) * 1_000
      : undefined),
    60_000,
    "OAuth login rate-limit window",
    3_600_000
  );
  const maxKeys = positiveInteger(
    options.maxKeys ?? process.env.OAUTH_LOGIN_RATE_LIMIT_MAX_CLIENTS,
    10_000,
    "OAUTH_LOGIN_RATE_LIMIT_MAX_CLIENTS",
    100_000
  );
  const cleanupBatch = Math.min(maxKeys, positiveInteger(options.cleanupBatch, 100, "rate-limit cleanup batch", 1_000));
  const now = options.now || Date.now;
  const buckets = new Map();
  let nextCleanupAt = 0;

  function cleanupExpired(currentTime) {
    if (currentTime < nextCleanupAt) return;
    nextCleanupAt = currentTime + Math.min(windowMs, 30_000);
    let inspected = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
      inspected += 1;
      if (inspected >= cleanupBatch) break;
    }
  }

  return function oauthLoginRateLimiter(req, res, next) {
    const currentTime = now();
    cleanupExpired(currentTime);
    let key = req.ip || req.socket?.remoteAddress || "unknown";
    let bucket = buckets.get(key);
    if (!bucket && buckets.size >= maxKeys) {
      key = OVERFLOW_KEY;
      bucket = buckets.get(key);
    }
    if (!bucket || bucket.resetAt <= currentTime) {
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1_000));
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1_000)));
    if (bucket.count > limit) {
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many OAuth login attempts. Try again later.",
        code: "OAUTH_LOGIN_RATE_LIMITED"
      });
      return;
    }
    next();
  };
}
