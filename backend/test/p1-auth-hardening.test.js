import assert from "node:assert/strict";
import express from "express";
import { createSession, setSessionCookie } from "../src/lib/sessionStore.js";
import { validateRuntimeConfig } from "../src/lib/runtimeConfig.js";
import { createOAuthLoginRateLimiter, parseTrustProxy } from "../src/lib/loginRateLimiter.js";
import {
  consumeOAuthState,
  createOAuthState,
  resetOAuthStateStoreForTests
} from "../src/lib/oauthStateStore.js";
import { resetPrismaAdapterForTests, setPrismaAdapterForTests } from "../src/lib/prisma.js";
import { verifyCsrf } from "../src/lib/csrfProtection.js";
import { afterEach, test } from "node:test";
import { asyncHandler } from "../src/lib/asyncHandler.js";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

function responseStub() {
  const headers = new Map();
  return {
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

async function withServer(app, run) {
  let server;
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("SameSite=None session cookies are always Secure", () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_COOKIE_SAME_SITE = "none";
  process.env.SESSION_COOKIE_SECURE = "false";
  const response = responseStub();

  setSessionCookie(response, "test-session-token");

  assert.match(response.getHeader("set-cookie"), /SameSite=None/);
  assert.match(response.getHeader("set-cookie"), /(?:^|; )Secure(?:;|$)/);
});

test("production fails closed whenever Secure cookies are explicitly disabled", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_COOKIE_SECURE = "false";

  for (const sameSite of ["lax", "none"]) {
    process.env.SESSION_COOKIE_SAME_SITE = sameSite;
    assert.throws(
      () => validateRuntimeConfig(),
      /SESSION_COOKIE_SECURE=false is forbidden in production/
    );
  }
});

test("invalid cookie security values fail configuration validation", () => {
  process.env.NODE_ENV = "production";
  process.env.SESSION_COOKIE_SAME_SITE = "lax";
  process.env.SESSION_COOKIE_SECURE = "treu";

  assert.throws(() => validateRuntimeConfig(), /SESSION_COOKIE_SECURE must be a boolean/);
});

test("CLIENT_ORIGIN is one exact origin rather than a comma-separated trust list", () => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN = "https://app.example,https://evil.example";
  process.env.APP_BASE_URL = "https://app.example";

  assert.throws(() => validateRuntimeConfig(), /CLIENT_ORIGIN must be one exact HTTP\(S\) origin/);
});

test("APP_BASE_URL stays on the configured client origin", () => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN = "https://app.example";
  process.env.APP_BASE_URL = "https://redirect.example/welcome";

  assert.throws(() => validateRuntimeConfig(), /APP_BASE_URL must use the CLIENT_ORIGIN origin/);
});

test("OAuth login allows a normal request and returns 429 for a burst", async () => {
  const app = express();
  app.get("/login", createOAuthLoginRateLimiter({ limit: 2, windowMs: 60_000 }), (_req, res) => {
    res.status(204).send();
  });

  await withServer(app, async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/login`)).status, 204);
    assert.equal((await fetch(`${baseUrl}/login`)).status, 204);
    const limited = await fetch(`${baseUrl}/login`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal((await limited.json()).code, "OAUTH_LOGIN_RATE_LIMITED");
  });
});

test("OAuth login capacity is released after the rate-limit window", async () => {
  let now = 1_000;
  const app = express();
  app.get("/login", createOAuthLoginRateLimiter({ limit: 1, windowMs: 1_000, now: () => now }), (_req, res) => {
    res.status(204).send();
  });

  await withServer(app, async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/login`)).status, 204);
    assert.equal((await fetch(`${baseUrl}/login`)).status, 429);
    now += 1_001;
    assert.equal((await fetch(`${baseUrl}/login`)).status, 204);
  });
});

test("runtime configuration never accepts trust proxy=true", () => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.APP_BASE_URL = "http://localhost:5173";
  process.env.TRUST_PROXY = "true";

  assert.throws(() => validateRuntimeConfig(), /TRUST_PROXY.*true is forbidden/);
});

test("forwarded client IPs affect OAuth limits only behind an explicitly trusted proxy", async () => {
  const untrusted = express();
  untrusted.set("trust proxy", parseTrustProxy("false"));
  untrusted.get("/login", createOAuthLoginRateLimiter({ limit: 1, windowMs: 60_000 }), (_req, res) => {
    res.status(204).send();
  });
  await withServer(untrusted, async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/login`, { headers: { "X-Forwarded-For": "198.51.100.1" } })).status, 204);
    assert.equal((await fetch(`${baseUrl}/login`, { headers: { "X-Forwarded-For": "198.51.100.2" } })).status, 429);
  });

  const trusted = express();
  trusted.set("trust proxy", parseTrustProxy("127.0.0.1/8,::1/128"));
  trusted.get("/login", createOAuthLoginRateLimiter({ limit: 1, windowMs: 60_000 }), (_req, res) => {
    res.status(204).send();
  });
  await withServer(trusted, async baseUrl => {
    assert.equal((await fetch(`${baseUrl}/login`, { headers: { "X-Forwarded-For": "198.51.100.1" } })).status, 204);
    assert.equal((await fetch(`${baseUrl}/login`, { headers: { "X-Forwarded-For": "198.51.100.2" } })).status, 204);
  });
});

test("the memory OAuth-state adapter enforces the configured active-state capacity", async () => {
  process.env.NODE_ENV = "test";
  process.env.OAUTH_STATE_MAX_ACTIVE = "2";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();
  try {
    const firstResponse = responseStub();
    const firstState = await createOAuthState(firstResponse);
    await createOAuthState(responseStub());
    await assert.rejects(
      createOAuthState(responseStub()),
      error => error?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"
    );
    assert.equal(await consumeOAuthState({
      headers: { cookie: firstResponse.getHeader("set-cookie") }
    }, firstState), true);
    await createOAuthState(responseStub());
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
  }
});

test("expired memory OAuth states release capacity", async () => {
  process.env.NODE_ENV = "test";
  process.env.OAUTH_STATE_MAX_ACTIVE = "1";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();
  try {
    await createOAuthState(responseStub(), { now: () => 1_000 });
    await assert.rejects(
      createOAuthState(responseStub(), { now: () => 2_000 }),
      error => error?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"
    );
    await createOAuthState(responseStub(), { now: () => 10 * 60_000 + 1_001 });
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
  }
});

test("memory OAuth-state capacity stays bounded across concurrency and repeated TTL cycles", async () => {
  process.env.NODE_ENV = "test";
  const previousMax = process.env.OAUTH_STATE_MAX_ACTIVE;
  const previousBatch = process.env.OAUTH_STATE_CLEANUP_BATCH;
  process.env.OAUTH_STATE_MAX_ACTIVE = "2";
  process.env.OAUTH_STATE_CLEANUP_BATCH = "1";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();
  try {
    const concurrent = await Promise.allSettled(
      Array.from({ length: 10 }, () => createOAuthState(responseStub(), { now: () => 1_000 }))
    );
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 2);
    assert.ok(concurrent
      .filter(result => result.status === "rejected")
      .every(result => result.reason?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"));

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const now = 1_000 + cycle * (10 * 60_000 + 1);
      await createOAuthState(responseStub(), { now: () => now });
      await createOAuthState(responseStub(), { now: () => now });
      await assert.rejects(
        createOAuthState(responseStub(), { now: () => now }),
        error => error?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"
      );
    }
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
    if (previousMax === undefined) delete process.env.OAUTH_STATE_MAX_ACTIVE;
    else process.env.OAUTH_STATE_MAX_ACTIVE = previousMax;
    if (previousBatch === undefined) delete process.env.OAUTH_STATE_CLEANUP_BATCH;
    else process.env.OAUTH_STATE_CLEANUP_BATCH = previousBatch;
  }
});

test("CSRF rejection exposes the stable CSRF_INVALID code", async () => {
  process.env.NODE_ENV = "test";
  setPrismaAdapterForTests(null);
  try {
    const rawSession = await createSession({ id: "csrf-code-user", login: "csrf-code-user" });
    const app = express();
    app.use(verifyCsrf);
    app.post("/write", (_req, res) => res.status(204).send());

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/write`, {
        method: "POST",
        headers: { Cookie: `github_star_show_session=${rawSession}` }
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "Invalid CSRF token.",
        code: "CSRF_INVALID"
      });
    });
  } finally {
    resetPrismaAdapterForTests();
  }
});

test("wrapped CSRF database rejection reaches Express error handling exactly once", async () => {
  process.env.NODE_ENV = "test";
  let errorCount = 0;
  let routeCount = 0;
  setPrismaAdapterForTests({
    session: {
      async findUnique() {
        throw new Error("injected CSRF session failure");
      }
    }
  });
  try {
    const app = express();
    app.use(asyncHandler(verifyCsrf));
    app.post("/write", (_req, res) => {
      routeCount += 1;
      res.status(204).send();
    });
    app.use((_error, _req, res, _next) => {
      errorCount += 1;
      res.status(503).json({ error: "handled" });
    });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/write`, {
        method: "POST",
        headers: { Cookie: `github_star_show_session=${"x".repeat(43)}` }
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "handled" });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(errorCount, 1);
      assert.equal(routeCount, 0);
    });
  } finally {
    resetPrismaAdapterForTests();
  }
});

test("the OAuth login route reports state-capacity exhaustion as 429", async () => {
  process.env.NODE_ENV = "test";
  process.env.GITHUB_CLIENT_ID = "test-client";
  process.env.OAUTH_STATE_MAX_ACTIVE = "1";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();
  try {
    const { default: authRouter } = await import("../src/routes/auth.js");
    const app = express();
    app.use("/auth", authRouter);
    await withServer(app, async baseUrl => {
      assert.equal((await fetch(`${baseUrl}/auth/github/login`, { redirect: "manual" })).status, 302);
      const limited = await fetch(`${baseUrl}/auth/github/login`, { redirect: "manual" });
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).code, "OAUTH_STATE_CAPACITY_EXCEEDED");
    });
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
  }
});

test("the OAuth login route does not trust a forged capacity error code", async () => {
  process.env.NODE_ENV = "test";
  process.env.GITHUB_CLIENT_ID = "test-client";
  process.env.OAUTH_STATE_MAX_ACTIVE = "10";
  resetOAuthStateStoreForTests();
  const secret = "SQL path=C:\\private\\oauth.db token=oauth-secret";
  const forged = Object.assign(new Error(secret), { code: "OAUTH_STATE_CAPACITY_EXCEEDED" });
  setPrismaAdapterForTests({
    oAuthState: {
      async findMany() { throw forged; }
    }
  });
  try {
    const { default: authRouter } = await import("../src/routes/auth.js");
    const app = express();
    app.use("/auth", authRouter);
    app.use((_error, _req, res, _next) => {
      res.status(500).json({ error: "Internal server error." });
    });
    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/auth/github/login`, { redirect: "manual" });
      assert.equal(response.status, 500);
      assert.equal(response.headers.get("retry-after"), null);
      const body = await response.json();
      assert.deepEqual(body, { error: "Internal server error." });
      assert.doesNotMatch(JSON.stringify(body), /private|oauth\.db|oauth-secret|SQL/i);
    });
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
  }
});

test("OAuth state cookies remain SameSite=Lax when session cookies use SameSite=None", async () => {
  process.env.NODE_ENV = "test";
  process.env.SESSION_COOKIE_SAME_SITE = "none";
  process.env.OAUTH_STATE_MAX_ACTIVE = "1";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();
  try {
    const response = responseStub();
    await createOAuthState(response);
    assert.match(response.getHeader("set-cookie"), /SameSite=Lax/);
    assert.doesNotMatch(response.getHeader("set-cookie"), /SameSite=None/);
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
  }
});
