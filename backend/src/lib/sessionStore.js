import crypto from "node:crypto";
import { appendSetCookie, parseCookies, serializeCookie, sessionCookieOptions } from "./cookieSecurity.js";
import { getPrisma } from "./prisma.js";
import { decryptGithubToken, encryptGithubToken, isEncryptedGithubToken } from "./tokenCrypto.js";

export const SESSION_COOKIE = "github_star_show_session";
const sessions = new Map();
const users = new Map();
const requestSessionCache = Symbol("requestSessionCache");

export function sessionTtlMs() {
  const configured = Number(process.env.SESSION_TTL_DAYS || 7);
  if (!Number.isFinite(configured) || configured <= 0 || configured > 365) {
    throw new Error("SESSION_TTL_DAYS must be greater than 0 and at most 365.");
  }
  return Math.floor(configured * 24 * 60 * 60_000);
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createCsrfToken(rawSessionToken) {
  return crypto.createHmac("sha256", rawSessionToken).update("github-star-show:csrf:v1").digest("base64url");
}

function mapPersistedUser(user, accessToken = "") {
  const scope = user.githubAccount?.scope || "";
  const grantedScopes = scope.split(",").map(item => item.trim()).filter(Boolean);
  return {
    id: String(user.id),
    dbUserId: user.id,
    login: user.githubLogin || user.githubAccount?.login || "",
    name: user.name || user.githubAccount?.name || user.githubLogin || "",
    avatarUrl: user.avatarUrl || user.githubAccount?.avatarUrl || "",
    profileUrl: user.profileUrl || user.githubAccount?.profileUrl || "",
    accessToken,
    lastStarSyncAt: user.lastStarSyncAt || null,
    githubScope: scope,
    grantedScopes,
    canManageStars: grantedScopes.includes("public_repo") || grantedScopes.includes("repo")
  };
}

export async function createSession(user) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const token = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const prisma = getPrisma();
  if (!prisma) {
    sessions.set(token, { token, userId: user.id, expiresAt: expiresAt.getTime() });
    users.set(user.id, user);
  } else {
    await prisma.session.create({ data: { token, userId: user.dbUserId || Number(user.id), expiresAt } });
  }
  return rawToken;
}

async function loadSession(req) {
  if (req[requestSessionCache]) return req[requestSessionCache];
  const rawToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!rawToken || rawToken.length < 32 || rawToken.length > 256) {
    req[requestSessionCache] = { rawToken: "", user: null };
    return req[requestSessionCache];
  }

  const token = hashSessionToken(rawToken);
  const prisma = getPrisma();
  if (!prisma) {
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(token);
      req[requestSessionCache] = { rawToken: "", user: null };
      return req[requestSessionCache];
    }
    req[requestSessionCache] = { rawToken, user: users.get(session.userId) || null };
    return req[requestSessionCache];
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { githubAccount: true } } }
  });
  if (!session?.user || !session.expiresAt || session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { token } });
    req[requestSessionCache] = { rawToken: "", user: null };
    return req[requestSessionCache];
  }

  let accessToken = "";
  const storedToken = session.user.githubAccount?.accessToken || "";
  if (storedToken) {
    accessToken = decryptGithubToken(storedToken);
    if (!isEncryptedGithubToken(storedToken)) {
      const encrypted = encryptGithubToken(accessToken);
      await prisma.githubAccount.update({ where: { id: session.user.githubAccount.id }, data: { accessToken: encrypted } });
    }
  }
  req[requestSessionCache] = { rawToken, user: mapPersistedUser(session.user, accessToken) };
  return req[requestSessionCache];
}

export async function getSessionUser(req) {
  return (await loadSession(req)).user;
}

export async function getRequestCsrfToken(req) {
  const session = await loadSession(req);
  return session.user && session.rawToken ? createCsrfToken(session.rawToken) : null;
}

export async function clearSession(req, res) {
  const rawToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (rawToken && rawToken.length >= 32 && rawToken.length <= 256) {
    const token = hashSessionToken(rawToken);
    const prisma = getPrisma();
    if (!prisma) sessions.delete(token);
    else await prisma.session.deleteMany({ where: { token } });
  }
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0,
    httpOnly: true,
    ...sessionCookieOptions()
  }));
}

export function setSessionCookie(res, token) {
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, token, {
    maxAge: sessionTtlMs() / 1000,
    httpOnly: true,
    ...sessionCookieOptions()
  }));
}
