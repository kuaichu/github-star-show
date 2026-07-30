import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { after, beforeEach, test } from "node:test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "github-star-show-p1-oauth-"));
const databasePath = path.join(tempDirectory, "test.db").replaceAll("\\", "/");
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.NODE_ENV = "test";
process.env.OAUTH_STATE_MAX_ACTIVE = "2";
process.env.OAUTH_STATE_CLEANUP_BATCH = "1";
process.env.OAUTH_STATE_CLEANUP_INTERVAL_SECONDS = "60";

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
const { createOAuthState, resetOAuthStateStoreForTests } = await import("../src/lib/oauthStateStore.js");
const { getPrisma } = await import("../src/lib/prisma.js");
const prisma = new PrismaClient();

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

beforeEach(async () => {
  await prisma.oAuthState.deleteMany();
  resetOAuthStateStoreForTests();
});

after(async () => {
  await prisma.$disconnect();
  await getPrisma().$disconnect();
  await rm(tempDirectory, { recursive: true, force: true });
});

test("the database enforces the active OAuth-state cap and expired rows release capacity", async () => {
  await createOAuthState(responseStub());
  await createOAuthState(responseStub());
  const fullRowsBeforeRejection = await prisma.oAuthState.findMany({
    orderBy: { stateHash: "asc" },
    select: { stateHash: true, expiresAt: true }
  });
  await assert.rejects(
    createOAuthState(responseStub()),
    error => error?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"
  );
  assert.deepEqual(await prisma.oAuthState.findMany({
    orderBy: { stateHash: "asc" },
    select: { stateHash: true, expiresAt: true }
  }), fullRowsBeforeRejection);
  assert.equal(await prisma.oAuthState.count({ where: { expiresAt: { gt: new Date() } } }), 2);

  const oldest = await prisma.oAuthState.findFirst({ orderBy: { createdAt: "asc" } });
  await prisma.oAuthState.update({
    where: { stateHash: oldest.stateHash },
    data: { expiresAt: new Date(Date.now() - 1_000) }
  });
  await createOAuthState(responseStub());
  assert.equal(await prisma.oAuthState.count({ where: { expiresAt: { gt: new Date() } } }), 2);
});

test("database OAuth-state storage remains bounded across repeated TTL cycles", async () => {
  const ttlMs = 10 * 60_000;

  for (let cycle = 0; cycle < 3; cycle += 1) {
    const now = 1_000 + cycle * (ttlMs + 1);
    await createOAuthState(responseStub(), { now: () => now });
    assert.ok(await prisma.oAuthState.count() <= 2, `cycle ${cycle} exceeded total capacity`);
    await createOAuthState(responseStub(), { now: () => now });
    assert.ok(await prisma.oAuthState.count() <= 2, `cycle ${cycle} exceeded total capacity`);
    await assert.rejects(
      createOAuthState(responseStub(), { now: () => now }),
      error => error?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"
    );
    assert.equal(await prisma.oAuthState.count(), 2);
  }
});

test("concurrent database OAuth-state creation cannot exceed active or total capacity", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => createOAuthState(responseStub()))
  );
  const fulfilled = results.filter(result => result.status === "fulfilled");
  const rejected = results.filter(result => result.status === "rejected");

  assert.equal(fulfilled.length, 2);
  assert.equal(rejected.length, 8);
  assert.ok(rejected.every(result => result.reason?.code === "OAUTH_STATE_CAPACITY_EXCEEDED"));
  assert.equal(await prisma.oAuthState.count(), 2);
  assert.equal(await prisma.oAuthState.count({ where: { expiresAt: { gt: new Date() } } }), 2);
});

test("database OAuth-state cleanup is interval-gated and batch-bounded", async () => {
  const previousMaxActive = process.env.OAUTH_STATE_MAX_ACTIVE;
  process.env.OAUTH_STATE_MAX_ACTIVE = "10";
  const expiredAt = new Date(Date.now() - 60_000);
  try {
    await prisma.oAuthState.createMany({
      data: ["a", "b", "c"].map(stateHash => ({ stateHash, expiresAt: expiredAt }))
    });
    resetOAuthStateStoreForTests();

    await createOAuthState(responseStub());
    assert.equal(await prisma.oAuthState.count({ where: { expiresAt: { lte: new Date() } } }), 2);
    await createOAuthState(responseStub());
    assert.equal(await prisma.oAuthState.count({ where: { expiresAt: { lte: new Date() } } }), 2);
  } finally {
    process.env.OAUTH_STATE_MAX_ACTIVE = previousMaxActive;
  }
});
