import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "github-star-show-auth-"));
const databasePath = path.join(tempDirectory, "test.db").replaceAll("\\", "/");
const encryptionKey = Buffer.alloc(32, 19).toString("base64");

process.env.DATABASE_URL = `file:${databasePath}`;
process.env.NODE_ENV = "test";
process.env.CLIENT_ORIGIN = "http://localhost:5173";
process.env.APP_BASE_URL = "http://localhost:5173";
process.env.BACKEND_BASE_URL = "http://localhost:3000";
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = encryptionKey;
process.env.SESSION_TTL_DAYS = "2";
process.env.SESSION_COOKIE_SECURE = "false";

new DatabaseSync(databasePath).close();

const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
const migration = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: backendRoot,
  env: process.env,
  encoding: "utf8",
  timeout: 60_000
});
assert.equal(migration.status, 0, [migration.stdout, migration.stderr].filter(Boolean).join("\n"));

const { PrismaClient } = await import("@prisma/client");
const { default: app } = await import("../src/app.js");
const { getPrisma } = await import("../src/lib/prisma.js");
const {
  createCsrfToken,
  createSession,
  hashSessionToken
} = await import("../src/lib/sessionStore.js");
const {
  assertTokenEncryptionConfigured,
  decodeTokenEncryptionKey,
  decryptGithubToken,
  encryptGithubToken
} = await import("../src/lib/tokenCrypto.js");
const { persistGithubUser } = await import("../src/services/authService.js");
const { validateRuntimeConfig } = await import("../src/lib/runtimeConfig.js");

const prisma = new PrismaClient();
const nativeFetch = globalThis.fetch.bind(globalThis);
let server;
let baseUrl;

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookiePair(response, name) {
  for (const value of setCookies(response)) {
    const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
    if (match) return `${name}=${match[1]}`;
  }
  return "";
}

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  return nativeFetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options, headers });
}

async function beginLogin() {
  const response = await request("/auth/github/login");
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  return {
    response,
    state: location.searchParams.get("state"),
    cookie: cookiePair(response, "github_star_show_oauth_state"),
    location
  };
}

async function withGithubMock(run) {
  const originalFetch = globalThis.fetch;
  let exchangeCount = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes("/login/oauth/access_token")) {
      exchangeCount += 1;
      return Response.json({ access_token: "github-secret-token", scope: "read:user,public_repo" });
    }
    if (url === "https://api.github.com/user") {
      return Response.json({
        id: 4242,
        login: "security-user",
        name: "Security User",
        avatar_url: "https://avatars.example.test/u/4242",
        html_url: "https://github.com/security-user"
      });
    }
    throw new Error(`Unexpected mocked request: ${url}`);
  };
  try {
    return await run(() => exchangeCount);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function resetDatabase() {
  await prisma.oAuthState.deleteMany();
  await prisma.session.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.userProject.deleteMany();
  await prisma.managedCategory.deleteMany();
  await prisma.autoSyncConfig.deleteMany();
  await prisma.githubAccount.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  process.env.SESSION_COOKIE_SECURE = "false";
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = encryptionKey;
  process.env.NODE_ENV = "test";
}

before(async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(resetDatabase);

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
  await getPrisma()?.$disconnect();
  await rm(tempDirectory, { recursive: true, force: true });
});

test("OAuth state is random, host-only, single-use, and required by the callback", async () => {
  const first = await beginLogin();
  const second = await beginLogin();
  assert.match(first.state, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.state, second.state);
  const storedStates = await prisma.oAuthState.findMany();
  assert.equal(storedStates.some(item => item.stateHash === first.state), false);
  assert.ok(storedStates.every(item => /^[a-f0-9]{64}$/.test(item.stateHash)));
  assert.equal(first.location.searchParams.has("access_token"), false);
  const loginCookie = setCookies(first.response).join("\n");
  assert.match(loginCookie, /HttpOnly/i);
  assert.match(loginCookie, /SameSite=Lax/i);
  assert.match(loginCookie, /Max-Age=600/i);
  assert.doesNotMatch(loginCookie, /Domain=/i);

  const missing = await request("/auth/github/callback?code=ok", { cookie: first.cookie });
  assert.equal(missing.status, 400);
  assert.match(setCookies(missing).join("\n"), /Max-Age=0/i);

  const mismatch = await request("/auth/github/callback?code=ok&state=wrong", { cookie: second.cookie });
  assert.equal(mismatch.status, 400);
  assert.match(setCookies(mismatch).join("\n"), /Max-Age=0/i);
  await withGithubMock(async exchangeCount => {
    const retry = await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(second.state)}`, {
      cookie: second.cookie
    });
    assert.equal(retry.status, 302);
    assert.equal(exchangeCount(), 1);
  });

  const expired = await beginLogin();
  await prisma.oAuthState.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });
  assert.equal((await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(expired.state)}`, {
    cookie: expired.cookie
  })).status, 400);

  const valid = await beginLogin();
  await withGithubMock(async exchangeCount => {
    const callback = await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(valid.state)}`, {
      cookie: valid.cookie
    });
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get("location")).searchParams.has("token"), false);
    assert.equal(exchangeCount(), 1);
    const replay = await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(valid.state)}`, {
      cookie: valid.cookie
    });
    assert.equal(replay.status, 400);
    assert.equal(exchangeCount(), 1);
  });
});

test("session cookies and rows share TTL while the database stores only the token hash", async () => {
  const login = await beginLogin();
  await withGithubMock(async () => {
    const callback = await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(login.state)}`, {
      cookie: login.cookie
    });
    assert.equal(callback.status, 302);
    const sessionCookie = cookiePair(callback, "github_star_show_session");
    const rawToken = decodeURIComponent(sessionCookie.split("=")[1]);
    const stored = await prisma.session.findFirst();
    assert.equal(stored.token, hashSessionToken(rawToken));
    assert.equal(stored.token.includes(rawToken), false);
    assert.ok(Math.abs(stored.expiresAt.getTime() - (Date.now() + 2 * 86_400_000)) < 5_000);
    const header = setCookies(callback).join("\n");
    assert.match(header, /github_star_show_session=.*HttpOnly/i);
    assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Max-Age=172800/i);
    assert.doesNotMatch(header, /Domain=/i);
    assert.doesNotMatch(header, /github_star_show_session=.*Secure/i);
  });

  process.env.SESSION_COOKIE_SECURE = "true";
  const secureLogin = await beginLogin();
  assert.match(setCookies(secureLogin.response).join("\n"), /Secure/i);
  await withGithubMock(async () => {
    const callback = await request(`/auth/github/callback?code=ok&state=${encodeURIComponent(secureLogin.state)}`, {
      cookie: secureLogin.cookie
    });
    const sessionHeader = setCookies(callback).find(value => value.startsWith("github_star_show_session="));
    assert.match(sessionHeader, /Secure/i);
  });

  delete process.env.SESSION_COOKIE_SECURE;
  process.env.NODE_ENV = "production";
  assert.match(setCookies((await beginLogin()).response).join("\n"), /Secure/i);
  process.env.SESSION_COOKIE_SECURE = "false";
  assert.throws(
    () => validateRuntimeConfig(),
    /SESSION_COOKIE_SECURE=false is forbidden in production/
  );
});

test("expired and malformed sessions are handled safely and logout remains idempotent", async () => {
  const user = await prisma.user.create({ data: { githubLogin: "expiry-user" } });
  const rawToken = await createSession({ id: String(user.id), dbUserId: user.id });
  const tokenHash = hashSessionToken(rawToken);
  await prisma.session.update({ where: { token: tokenHash }, data: { expiresAt: new Date(Date.now() - 1_000) } });

  const expired = await request("/auth/me", { cookie: `github_star_show_session=${rawToken}` });
  assert.equal(expired.status, 200);
  assert.deepEqual(await expired.json(), { user: null, csrfToken: null });
  assert.equal(await prisma.session.count({ where: { token: tokenHash } }), 0);

  const malformed = await request("/auth/me", { cookie: "github_star_show_session=%E0%A4%A" });
  assert.equal(malformed.status, 200);
  assert.deepEqual(await malformed.json(), { user: null, csrfToken: null });
  assert.equal((await request("/auth/logout", { method: "POST" })).status, 204);
  assert.equal((await request("/auth/logout", { method: "POST", cookie: "github_star_show_session=invalid" })).status, 204);
});

test("CSRF tokens are required, constant-time checked, and bound to one session", async () => {
  const userA = await prisma.user.create({ data: { githubLogin: "csrf-a" } });
  const userB = await prisma.user.create({ data: { githubLogin: "csrf-b" } });
  const rawA = await createSession({ id: String(userA.id), dbUserId: userA.id });
  const rawB = await createSession({ id: String(userB.id), dbUserId: userB.id });
  const cookieA = `github_star_show_session=${rawA}`;
  const cookieB = `github_star_show_session=${rawB}`;
  const csrfA = (await (await request("/auth/me", { cookie: cookieA })).json()).csrfToken;
  const csrfB = (await (await request("/auth/me", { cookie: cookieB })).json()).csrfToken;
  assert.equal(csrfA, createCsrfToken(rawA));
  assert.notEqual(csrfA, csrfB);

  assert.equal((await request("/auth/logout", { method: "POST", cookie: cookieA })).status, 403);
  assert.equal((await request("/auth/logout", {
    method: "POST", cookie: cookieA, headers: { "X-CSRF-Token": "wrong" }
  })).status, 403);
  assert.equal((await request("/auth/logout", {
    method: "POST", cookie: cookieB, headers: { "X-CSRF-Token": csrfA }
  })).status, 403);
  assert.equal(await prisma.session.count(), 2);
  assert.equal((await request("/auth/logout", {
    method: "POST", cookie: cookieB, headers: { "X-CSRF-Token": csrfB }
  })).status, 204);
  assert.equal(await prisma.session.count({ where: { token: hashSessionToken(rawB) } }), 0);
});

test("credentialed CORS allows only exact configured origins and the CSRF header", async () => {
  const allowed = await request("/auth/logout", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "X-CSRF-Token, Content-Type"
    }
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.match(allowed.headers.get("access-control-allow-headers"), /X-CSRF-Token/i);
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

  const rejected = await request("/auth/logout", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173.evil.test",
      "Access-Control-Request-Method": "POST"
    }
  });
  assert.equal(rejected.headers.has("access-control-allow-origin"), false);
});

test("GitHub tokens use randomized AES-256-GCM envelopes and reject the wrong key", async () => {
  const key = decodeTokenEncryptionKey(encryptionKey);
  const plaintext = "gho_plaintext_must_not_appear";
  const first = encryptGithubToken(plaintext, key);
  const second = encryptGithubToken(plaintext, key);
  assert.match(first, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(first.includes(plaintext), false);
  assert.notEqual(first, second);
  assert.equal(decryptGithubToken(first, key), plaintext);
  assert.throws(() => decryptGithubToken(first, crypto.randomBytes(32)), /Unable to decrypt/);

  const profile = {
    githubUserId: "encrypted-user-id",
    login: "encrypted-user",
    name: "Encrypted User",
    avatarUrl: "",
    profileUrl: "https://github.com/encrypted-user",
    accessToken: plaintext
  };
  await persistGithubUser(profile, "read:user");
  const storedFirst = (await prisma.githubAccount.findUnique({ where: { githubUserId: profile.githubUserId } })).accessToken;
  await persistGithubUser(profile, "read:user");
  const storedSecond = (await prisma.githubAccount.findUnique({ where: { githubUserId: profile.githubUserId } })).accessToken;
  assert.equal(storedFirst.includes(plaintext), false);
  assert.notEqual(storedFirst, storedSecond);
  assert.equal(decryptGithubToken(storedSecond), plaintext);

  const account = await prisma.githubAccount.findUnique({
    where: { githubUserId: profile.githubUserId }, include: { user: true }
  });
  const rawSession = await createSession({ id: String(account.user.id), dbUserId: account.user.id });
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  const wrongKeyResponse = await request("/auth/me", {
    cookie: `github_star_show_session=${rawSession}`
  });
  assert.equal(wrongKeyResponse.status, 500);
  assert.deepEqual(await wrongKeyResponse.json(), { error: "Internal server error." });
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = encryptionKey;
});

test("configured legacy plaintext is rewritten once and production cannot start without a key", async () => {
  const user = await prisma.user.create({ data: { githubLogin: "legacy-user" } });
  await prisma.githubAccount.create({
    data: {
      githubUserId: "legacy-id",
      login: "legacy-user",
      accessToken: "legacy-plaintext",
      userId: user.id
    }
  });
  const rawToken = await createSession({ id: String(user.id), dbUserId: user.id });
  const response = await request("/auth/me", { cookie: `github_star_show_session=${rawToken}` });
  assert.equal(response.status, 200);
  const rewritten = (await prisma.githubAccount.findUnique({ where: { userId: user.id } })).accessToken;
  assert.match(rewritten, /^v1\./);
  assert.equal(rewritten.includes("legacy-plaintext"), false);

  process.env.NODE_ENV = "production";
  delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  assert.throws(() => assertTokenEncryptionConfigured(), /required in production/);
});
