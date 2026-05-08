import crypto from "node:crypto";
import { getPrisma } from "./prisma.js";

const sessions = new Map();
const users = new Map();

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((result, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return result;
    result[rawKey] = decodeURIComponent(rawValue.join("="));
    return result;
  }, {});
}

function mapPersistedUser(user, accessToken = "") {
  const scope = user.githubAccount?.scope || "";
  const grantedScopes = scope
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  return {
    id: String(user.id),
    dbUserId: user.id,
    login: user.githubLogin || user.githubAccount?.login || "",
    name: user.name || user.githubAccount?.name || user.githubLogin || "",
    avatarUrl: user.avatarUrl || user.githubAccount?.avatarUrl || "",
    profileUrl: user.profileUrl || user.githubAccount?.profileUrl || "",
    accessToken: accessToken || user.githubAccount?.accessToken || "",
    lastStarSyncAt: user.lastStarSyncAt || null,
    githubScope: scope,
    grantedScopes,
    canManageStars: grantedScopes.includes("public_repo") || grantedScopes.includes("repo")
  };
}

export async function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const prisma = getPrisma();

  if (!prisma) {
    sessions.set(token, {
      token,
      userId: user.id,
      createdAt: Date.now()
    });
    users.set(user.id, user);
    return token;
  }

  await prisma.session.create({
    data: {
      token,
      userId: user.dbUserId || Number(user.id)
    }
  });

  return token;
}

export async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.github_star_show_session;
  if (!token) return null;

  const prisma = getPrisma();

  if (!prisma) {
    const session = sessions.get(token);
    if (!session) return null;
    return users.get(session.userId) || null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          githubAccount: true
        }
      }
    }
  });

  if (!session?.user) {
    return null;
  }

  return mapPersistedUser(session.user);
}

export async function clearSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.github_star_show_session;
  const prisma = getPrisma();

  if (token) {
    if (!prisma) {
      sessions.delete(token);
    } else {
      await prisma.session.deleteMany({
        where: { token }
      });
    }
  }

  res.setHeader("Set-Cookie", "github_star_show_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `github_star_show_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
}
