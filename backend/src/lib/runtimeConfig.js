import { sessionCookieOptions } from "./cookieSecurity.js";
import { parseTrustProxy } from "./loginRateLimiter.js";

function singleUrl(name, fallback) {
  const configured = String(process.env[name] || fallback).trim();
  if (!configured || configured.includes(",")) {
    throw new Error(`${name} must be one exact HTTP(S) origin.`);
  }
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`${name} must be one exact HTTP(S) origin.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be one exact HTTP(S) origin.`);
  }
  return url;
}

export function validateRuntimeConfig() {
  const sessionCookie = sessionCookieOptions();
  const secureSetting = String(process.env.SESSION_COOKIE_SECURE || "").trim().toLowerCase();
  if (
    process.env.NODE_ENV === "production" &&
    ["0", "false", "no", "off"].includes(secureSetting)
  ) {
    throw new Error("SESSION_COOKIE_SECURE=false is forbidden in production.");
  }
  const clientUrl = singleUrl("CLIENT_ORIGIN", "http://localhost:5173");
  if (clientUrl.pathname !== "/") {
    throw new Error("CLIENT_ORIGIN must be one exact HTTP(S) origin.");
  }
  const appBaseUrl = singleUrl("APP_BASE_URL", clientUrl.origin);
  if (appBaseUrl.origin !== clientUrl.origin) {
    throw new Error("APP_BASE_URL must use the CLIENT_ORIGIN origin.");
  }
  return {
    sessionCookie,
    clientOrigin: clientUrl.origin,
    appBaseUrl: appBaseUrl.toString(),
    trustProxy: parseTrustProxy()
  };
}
