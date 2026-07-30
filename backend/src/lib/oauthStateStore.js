import crypto from "node:crypto";
import { appendSetCookie, parseCookies, serializeCookie } from "./cookieSecurity.js";
import { getPrisma } from "./prisma.js";

export const OAUTH_STATE_COOKIE = "github_star_show_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const memoryStates = new Map();
let nextDatabaseCleanupAt = 0;
let nextMemoryCleanupAt = 0;

export function resetOAuthStateStoreForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("OAuth state store reset is available only in tests.");
  }
  memoryStates.clear();
  nextDatabaseCleanupAt = 0;
  nextMemoryCleanupAt = 0;
}

export class OAuthStateCapacityError extends Error {
  constructor() {
    super("OAuth state capacity is temporarily exhausted.");
    this.name = "OAuthStateCapacityError";
    this.code = "OAUTH_STATE_CAPACITY_EXCEEDED";
  }
}

function positiveInteger(name, fallback, maximum) {
  const value = process.env[name];
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

function stateStoreConfig() {
  return {
    maxActive: positiveInteger("OAUTH_STATE_MAX_ACTIVE", 10_000, 100_000),
    cleanupBatch: positiveInteger("OAUTH_STATE_CLEANUP_BATCH", 100, 1_000),
    cleanupIntervalMs: positiveInteger("OAUTH_STATE_CLEANUP_INTERVAL_SECONDS", 30, 3_600) * 1_000
  };
}

function hashState(state) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

function timingSafeEqual(left, right) {
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

async function insertDatabaseStateWithinCapacity(prisma, stateHash, expiresAt, now, maxStored) {
  if (typeof prisma.$executeRaw !== "function") {
    throw new Error("Database OAuth state storage requires atomic raw SQL support.");
  }

  return prisma.$executeRaw`
    INSERT INTO "OAuthState" ("stateHash", "expiresAt", "createdAt")
    SELECT ${stateHash}, ${expiresAt}, ${now}
    WHERE (
      SELECT COUNT(*) FROM "OAuthState" WHERE "expiresAt" > ${now}
    ) < ${maxStored}
    AND (
      SELECT COUNT(*) FROM "OAuthState"
    ) < ${maxStored}
  `;
}

export async function createOAuthState(res, options = {}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const stateHash = hashState(state);
  const currentTime = options.now ? options.now() : Date.now();
  if (!Number.isFinite(currentTime)) throw new Error("OAuth state clock returned an invalid time.");
  const now = new Date(currentTime);
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS);
  const config = stateStoreConfig();
  const prisma = getPrisma();
  if (prisma) {
    if (now.getTime() >= nextDatabaseCleanupAt) {
      nextDatabaseCleanupAt = now.getTime() + config.cleanupIntervalMs;
      const expired = await prisma.oAuthState.findMany({
        where: { expiresAt: { lte: now } },
        orderBy: { expiresAt: "asc" },
        take: config.cleanupBatch,
        select: { stateHash: true }
      });
      if (expired.length) {
        await prisma.oAuthState.deleteMany({
          where: {
            stateHash: { in: expired.map(item => item.stateHash) },
            expiresAt: { lte: now }
          }
        });
      }
    }

    let inserted = await insertDatabaseStateWithinCapacity(
      prisma, stateHash, expiresAt, now, config.maxActive
    );
    if (inserted !== 1) {
      await prisma.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } });
      inserted = await insertDatabaseStateWithinCapacity(
        prisma, stateHash, expiresAt, now, config.maxActive
      );
    }
    if (inserted !== 1) throw new OAuthStateCapacityError();
  } else {
    if (now.getTime() >= nextMemoryCleanupAt) {
      nextMemoryCleanupAt = now.getTime() + config.cleanupIntervalMs;
      let inspected = 0;
      for (const [key, expiry] of memoryStates) {
        if (expiry <= now.getTime()) memoryStates.delete(key);
        inspected += 1;
        if (inspected >= config.cleanupBatch) break;
      }
    }
    if (memoryStates.size >= config.maxActive) {
      for (const [key, expiry] of memoryStates) {
        if (expiry <= now.getTime()) memoryStates.delete(key);
        if (memoryStates.size < config.maxActive) break;
      }
    }
    if (memoryStates.size >= config.maxActive) throw new OAuthStateCapacityError();
    memoryStates.set(stateHash, expiresAt.getTime());
  }
  appendSetCookie(res, serializeCookie(OAUTH_STATE_COOKIE, state, {
    path: "/auth/github",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: OAUTH_STATE_TTL_MS / 1000
  }));
  return state;
}

export function clearOAuthStateCookie(res) {
  appendSetCookie(res, serializeCookie(OAUTH_STATE_COOKIE, "", {
    path: "/auth/github",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 0
  }));
}

export async function consumeOAuthState(req, suppliedState) {
  const cookieState = parseCookies(req.headers.cookie || "")[OAUTH_STATE_COOKIE];
  if (!cookieState || typeof suppliedState !== "string") return false;
  if (!timingSafeEqual(cookieState, suppliedState)) return false;

  const stateHash = hashState(cookieState);
  const prisma = getPrisma();
  let consumed = false;
  if (prisma) {
    const result = await prisma.oAuthState.deleteMany({
      where: { stateHash, expiresAt: { gt: new Date() } }
    });
    consumed = result.count === 1;
  } else {
    const expiresAt = memoryStates.get(stateHash);
    memoryStates.delete(stateHash);
    consumed = Boolean(expiresAt && expiresAt > Date.now());
  }
  return consumed;
}
