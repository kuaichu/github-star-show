const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function cookieSecureEnabled() {
  const configured = String(process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase();
  if (TRUE_VALUES.has(configured)) return true;
  if (FALSE_VALUES.has(configured)) return false;
  if (configured) throw new Error("SESSION_COOKIE_SECURE must be a boolean value.");
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions() {
  const configured = String(process.env.SESSION_COOKIE_SAME_SITE || "lax").trim().toLowerCase();
  if (configured !== "lax" && configured !== "none") {
    throw new Error("SESSION_COOKIE_SAME_SITE must be either lax or none.");
  }
  return {
    sameSite: configured === "none" ? "None" : "Lax",
    secure: configured === "none" || cookieSecureEnabled()
  };
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure ?? cookieSecureEnabled()) parts.push("Secure");
  return parts.join("; ");
}

export function appendSetCookie(res, value) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", value);
  } else if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, value]);
  } else {
    res.setHeader("Set-Cookie", [current, value]);
  }
}

export function parseCookies(cookieHeader = "") {
  const result = {};
  if (typeof cookieHeader !== "string" || cookieHeader.length > 16_384) return result;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(rawKey)) continue;
    try {
      result[rawKey] = decodeURIComponent(rawValue.join("="));
    } catch {
      // A malformed cookie is attacker-controlled input; ignore it safely.
    }
  }
  return result;
}
