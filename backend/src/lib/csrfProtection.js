import crypto from "node:crypto";
import { getRequestCsrfToken, getSessionUser } from "./sessionStore.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length > 256 || right.length > 256) {
    return false;
  }
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  const length = Math.max(a.length, b.length, 1);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);
  a.copy(paddedA);
  b.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && a.length === b.length;
}

export async function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  try {
    const user = await getSessionUser(req);
    if (!user) return next();
    const expected = await getRequestCsrfToken(req);
    const supplied = req.get("X-CSRF-Token");
    if (!expected || !constantTimeEqual(expected, supplied)) {
      res.status(403).json({ error: "Invalid CSRF token.", code: "CSRF_INVALID" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
