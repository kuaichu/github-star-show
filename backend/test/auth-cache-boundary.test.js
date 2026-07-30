import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";

import { resetOAuthStateStoreForTests } from "../src/lib/oauthStateStore.js";
import { resetPrismaAdapterForTests, setPrismaAdapterForTests } from "../src/lib/prisma.js";

async function withServer(app, run) {
  let server;
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("OAuth login rate-limit responses are private and vary on Cookie", async () => {
  const originalEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.GITHUB_CLIENT_ID = "cache-boundary-client";
  process.env.OAUTH_LOGIN_RATE_LIMIT_MAX = "2";
  process.env.OAUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.OAUTH_STATE_MAX_ACTIVE = "10";
  setPrismaAdapterForTests(null);
  resetOAuthStateStoreForTests();

  try {
    const { default: authRouter } = await import("../src/routes/auth.js");
    const app = express();
    app.use("/auth", authRouter);

    await withServer(app, async baseUrl => {
      const options = { redirect: "manual" };
      assert.equal((await fetch(`${baseUrl}/auth/github/login`, options)).status, 302);
      assert.equal((await fetch(`${baseUrl}/auth/github/login`, options)).status, 302);

      const limited = await fetch(`${baseUrl}/auth/github/login`, options);
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).code, "OAUTH_LOGIN_RATE_LIMITED");
      assert.equal(limited.headers.get("cache-control"), "private, no-store");
      assert.match(limited.headers.get("vary") || "", /(?:^|,\s*)Cookie(?:,|$)/i);
    });
  } finally {
    resetOAuthStateStoreForTests();
    resetPrismaAdapterForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});
