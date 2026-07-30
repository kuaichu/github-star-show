import assert from "node:assert/strict";
import fs, { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rulesDirectory = path.join(backendRoot, "data", "rules");
const rulesDirectoryExisted = existsSync(rulesDirectory);
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "github-star-show-p0-"));
const databasePath = path.join(tempDirectory, "test.db").replaceAll("\\", "/");

process.env.DATABASE_URL = `file:${databasePath}`;
process.env.NODE_ENV = "test";
process.env.AI_CLASSIFICATION_ENABLED = "true";
process.env.AI_CLASSIFICATION_INCLUDE_README = "false";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.GITHUB_API_BASE_URL = "http://127.0.0.1:1";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_TTL_DAYS = "7";

const setupDatabase = new DatabaseSync(databasePath);
setupDatabase.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categorySource" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "features" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "github" TEXT NOT NULL,
    "demo" TEXT NOT NULL,
    "docs" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "aiCategory" TEXT,
    "aiConfidence" REAL,
    "aiReason" TEXT,
    "aiModel" TEXT,
    "aiClassifiedAt" DATETIME,
    "latestReleaseAt" DATETIME,
    "latestCommitAt" DATETIME,
    "activityCheckedAt" DATETIME,
    "publicVisible" BOOLEAN NOT NULL DEFAULT false,
    "visibilityVerifiedAt" DATETIME
  );
  CREATE UNIQUE INDEX "Project_github_key" ON "Project"("github");

  CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "githubLogin" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "lastStarSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  );

  CREATE TABLE "GithubAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "GithubAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "GithubAccount_githubUserId_key" ON "GithubAccount"("githubUserId");
  CREATE UNIQUE INDEX "GithubAccount_userId_key" ON "GithubAccount"("userId");

  CREATE TABLE "Session" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE "UserProject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "categorySource" TEXT NOT NULL DEFAULT 'manual',
    "categoryReason" TEXT NOT NULL DEFAULT 'manual:legacy-data',
    "status" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL,
    "demo" TEXT NOT NULL,
    "docs" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "features" TEXT NOT NULL,
    "aiCategory" TEXT,
    "aiConfidence" REAL,
    "aiReason" TEXT,
    "aiModel" TEXT,
    "aiClassifiedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'github_star',
    "remoteStatus" TEXT NOT NULL DEFAULT 'active',
    "remoteStatusNote" TEXT NOT NULL DEFAULT '',
    "remoteCheckedAt" DATETIME,
    "starredAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "UserProject_userId_projectId_key" ON "UserProject"("userId", "projectId");

  CREATE TABLE "SyncRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL DEFAULT 0,
    "skippedPrivate" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE "OperationLease" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "cooldownUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
  );
  CREATE INDEX "OperationLease_userId_kind_idx" ON "OperationLease"("userId", "kind");

  CREATE TABLE "ManagedCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagedCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "ManagedCategory_userId_name_key" ON "ManagedCategory"("userId", "name");

  CREATE TABLE "AutoSyncConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'incremental',
    "intervalHours" INTEGER NOT NULL DEFAULT 24,
    "nextScheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutoSyncConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "AutoSyncConfig_userId_key" ON "AutoSyncConfig"("userId");
`);
setupDatabase.close();

const { PrismaClient } = await import("@prisma/client");
const { default: app } = await import("../src/app.js");
const {
  getPrisma,
  resetPrismaAdapterForTests,
  setPrismaAdapterForTests
} = await import("../src/lib/prisma.js");
const { createCsrfToken, hashSessionToken } = await import("../src/lib/sessionStore.js");
const { encryptGithubToken } = await import("../src/lib/tokenCrypto.js");
const {
  createManagedCategory,
  deleteManagedCategory,
  renameManagedCategory
} = await import("../src/services/categoryService.js");
const {
  getUserProjectByProjectId,
  saveUserProject
} = await import("../src/services/userProjectService.js");
const { upsertProjectForUser } = await import("../src/services/projectWriteService.js");
const {
  recheckRemoteStatusForUser,
  rerunRuleClassificationForUser,
  syncUserStars
} = await import("../src/services/syncService.js");
const {
  classifyProjectsWithAi
} = await import("../src/services/aiClassificationService.js");
const {
  finalizeScheduledRun,
  startScheduler,
  stopScheduler,
  updateAutoSyncConfig
} = await import("../src/services/schedulerService.js");
const {
  claimOperationLease,
  releaseOperationLease,
  withOperationLease,
  withOperationLeaseTransaction
} = await import("../src/services/operationLeaseService.js");
const {
  requestJson
} = await import("../src/lib/httpClient.js");
const {
  hasCompleteSharedRepositoryData,
  inspectRepositoryState,
  normalizeGithubStarItem,
  normalizePublicGithubRepository,
  parseGithubRepositoryUrl
} = await import("../src/services/githubService.js");

const prisma = new PrismaClient();
const nativeFetch = globalThis.fetch.bind(globalThis);
let server;
let baseUrl;
let fixture;

function privateUserProjectData(userId, projectId, label) {
  return {
    userId,
    projectId,
    category: `${label} category`,
    categorySource: "manual",
    categoryReason: `manual:${label}`,
    status: `${label} status`,
    recommended: label === "A",
    note: `${label} note`,
    demo: `${label} demo`,
    docs: `${label} docs`,
    tags: JSON.stringify([`${label} tag`]),
    features: JSON.stringify([`${label} feature`]),
    aiCategory: null,
    aiConfidence: null,
    aiReason: "",
    aiModel: "",
    aiClassifiedAt: null,
    remoteStatus: "active",
    remoteStatusNote: "",
    lastSyncedAt: new Date()
  };
}

async function resetDatabase() {
  await prisma.operationLease.deleteMany();
  await prisma.session.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.userProject.deleteMany();
  await prisma.managedCategory.deleteMany();
  await prisma.autoSyncConfig.deleteMany();
  await prisma.githubAccount.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const userA = await prisma.user.create({ data: { githubLogin: "user-a", name: "User A" } });
  const userB = await prisma.user.create({ data: { githubLogin: "user-b", name: "User B" } });
  const project = await prisma.project.create({
    data: {
      id: 1,
      name: "shared-repo",
      author: "shared-owner",
      category: "legacy private category",
      categorySource: "manual",
      status: "legacy private status",
      language: "Vue",
      stars: 10,
      updatedAt: "2026-01-01",
      recommended: true,
      description: "shared description",
      features: JSON.stringify(["legacy private feature"]),
      tags: JSON.stringify(["legacy private tag"]),
      github: "https://github.com/shared-owner/shared-repo",
      demo: "legacy private demo",
      docs: "legacy private docs",
      note: "legacy private note",
      aiCategory: "legacy-ai",
      aiConfidence: 0.7,
      aiReason: "legacy private AI reason",
      aiModel: "legacy-model",
      aiClassifiedAt: new Date("2025-01-01T00:00:00Z"),
      publicVisible: true,
      visibilityVerifiedAt: new Date("2026-07-26T00:00:00Z")
    }
  });

  await prisma.userProject.create({ data: privateUserProjectData(userA.id, project.id, "A") });
  await prisma.userProject.create({ data: privateUserProjectData(userB.id, project.id, "B") });
  const rawTokenA = "a".repeat(43);
  const rawTokenB = "b".repeat(43);
  await prisma.session.createMany({
    data: [
      { token: hashSessionToken(rawTokenA), userId: userA.id, expiresAt: new Date(Date.now() + 86_400_000) },
      { token: hashSessionToken(rawTokenB), userId: userB.id, expiresAt: new Date(Date.now() + 86_400_000) }
    ]
  });

  fixture = {
    project,
    userA,
    userB,
    sessionA: `github_star_show_session=${rawTokenA}`,
    sessionB: `github_star_show_session=${rawTokenB}`,
    csrfA: createCsrfToken(rawTokenA),
    csrfB: createCsrfToken(rawTokenB)
  };
}

async function api(pathname, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.cookie) {
    headers.Cookie = options.cookie;
    if (!headers["X-CSRF-Token"] && !["GET", "HEAD", "OPTIONS"].includes(options.method || "GET")) {
      headers["X-CSRF-Token"] = options.cookie === fixture.sessionA ? fixture.csrfA : fixture.csrfB;
    }
  }
  return nativeFetch(`${baseUrl}${pathname}`, { ...options, headers });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function publicGithubRepository(overrides = {}) {
  return {
    name: "shared-repo",
    full_name: "shared-owner/shared-repo",
    owner: { login: "shared-owner" },
    description: "refreshed GitHub description",
    language: "TypeScript",
    stargazers_count: 987,
    pushed_at: "2026-07-27T00:00:00Z",
    html_url: "https://github.com/shared-owner/shared-repo",
    topics: ["github-topic"],
    homepage: "https://github-homepage.example/",
    archived: false,
    private: false,
    visibility: "public",
    ...overrides
  };
}

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(resetDatabase);

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  await prisma.$disconnect();
  await getPrisma()?.$disconnect();
  await rm(tempDirectory, { recursive: true, force: true });
  if (!rulesDirectoryExisted) {
    await rm(rulesDirectory, { recursive: true, force: true });
  }
});

test("anonymous project mutations return 401 without database side effects", async () => {
  const beforeProject = await prisma.project.findUnique({ where: { id: 1 } });
  const beforeRelations = await prisma.userProject.findMany({ orderBy: { userId: "asc" } });

  const post = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "anonymous",
      author: "attacker",
      language: "JavaScript",
      stars: 1,
      updatedAt: "2026-07-26",
      description: "must not be created",
      github: "https://github.com/attacker/anonymous"
    })
  });
  const patch = await api("/api/projects/1", {
    method: "PATCH",
    body: JSON.stringify({ note: "anonymous overwrite", stars: 999 })
  });
  const remove = await api("/api/projects/1", {
    method: "DELETE",
    body: JSON.stringify({})
  });
  const importRepo = await api("/api/github/import-repo", {
    method: "POST",
    body: JSON.stringify({ repo: "attacker/anonymous" })
  });

  assert.equal(post.status, 401);
  assert.equal(patch.status, 401);
  assert.equal(remove.status, 401);
  assert.equal(importRepo.status, 401);
  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), beforeProject);
  assert.deepEqual(await prisma.userProject.findMany({ orderBy: { userId: "asc" } }), beforeRelations);
  assert.equal(await prisma.project.count(), 1);
});

test("rules expose only trusted validation errors and keep internal persistence failures private", async () => {
  const nullBody = await api("/api/rules", {
    method: "POST",
    cookie: fixture.sessionA,
    body: "null"
  });
  assert.equal(nullBody.status, 400);
  assert.deepEqual(await nullBody.json(), { message: "Rule body must be an object." });

  const invalid = await api("/api/rules", {
    method: "POST",
    cookie: fixture.sessionA,
    body: JSON.stringify({ matchType: "forged", matchValue: "x", targetCategory: "Tools" })
  });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).message, /matchType/);

  const originalWriteFileSync = fs.writeFileSync;
  let internal;
  fs.writeFileSync = () => {
    throw new Error("EIO C:\\private\\rules.json token=rules-secret");
  };
  try {
    internal = await api("/api/rules", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ matchType: "topic", matchValue: "security", targetCategory: "Tools" })
    });
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  assert.equal(internal.status, 500);
  const body = await internal.json();
  assert.deepEqual(body, { error: "Internal server error." });
  assert.doesNotMatch(JSON.stringify(body), /private|rules\.json|rules-secret|EIO/i);
  assert.equal((await api("/api/health")).status, 200);
});

test("user PATCH changes only that user's private overlay", async () => {
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });
  const userBBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  });

  const response = await api("/api/projects/1", {
    method: "PATCH",
    cookie: fixture.sessionA,
    body: JSON.stringify({
      category: "A renamed category",
      status: "A updated status",
      note: "",
      recommended: false,
      name: "malicious shared rename",
      stars: 9999,
      description: "malicious shared description"
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.category, "A renamed category");
  assert.equal(body.note, "");
  const userAAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(userAAfter.category, "A renamed category");
  assert.equal(userAAfter.categorySource, "manual");
  assert.equal(userAAfter.note, "");
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  }), userBBefore);
  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), projectBefore);
});

test("concurrent sparse PATCH requests preserve changes to different private fields", async () => {
  const [noteResponse, statusResponse] = await Promise.all([
    api("/api/projects/1", {
      method: "PATCH",
      cookie: fixture.sessionA,
      body: JSON.stringify({ note: "concurrent note" })
    }),
    api("/api/projects/1", {
      method: "PATCH",
      cookie: fixture.sessionA,
      body: JSON.stringify({ status: "正在使用" })
    })
  ]);

  assert.equal(noteResponse.status, 200);
  assert.equal(statusResponse.status, 200);
  const stored = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(stored.note, "concurrent note");
  assert.equal(stored.status, "正在使用");
});

test("trusted sparse updates preserve omitted fields and persist explicit empty values", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const project = await getUserProjectByProjectId(user, 1);
  const statusBefore = project.status;

  await saveUserProject(user, project, {
    recommended: false,
    note: "",
    tags: [],
    aiCategory: null,
    aiConfidence: 0,
    remoteCheckedAt: null
  });

  const stored = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(stored.status, statusBefore);
  assert.equal(stored.recommended, false);
  assert.equal(stored.note, "");
  assert.equal(stored.tags, "[]");
  assert.equal(stored.aiCategory, null);
  assert.equal(stored.aiConfidence, 0);
  assert.equal(stored.remoteCheckedAt, null);
});

test("project writes ignore system-owned private fields", async () => {
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const response = await api("/api/projects/1", {
    method: "PATCH",
    cookie: fixture.sessionA,
    body: JSON.stringify({
      note: "allowed note",
      categorySource: "ai",
      categoryReason: "attacker-controlled",
      aiCategory: "attacker-ai",
      aiConfidence: 1,
      remoteStatus: "missing",
      remoteStatusNote: "attacker-controlled",
      lastSyncedAt: "2099-01-01T00:00:00.000Z"
    })
  });

  assert.equal(response.status, 200);
  const stored = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(stored.note, "allowed note");
  for (const field of [
    "categorySource", "categoryReason", "aiCategory", "aiConfidence",
    "remoteStatus", "remoteStatusNote", "lastSyncedAt"
  ]) {
    assert.deepEqual(stored[field], before[field], `${field} was overwritten by HTTP input`);
  }
});

test("manual project creation verifies GitHub and derives shared facts from the upstream repository", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    const target = String(url);
    requested.push(target);
    if (target.endsWith("/repos/verified-owner/verified-repo")) {
      return Response.json({
        name: "verified-repo",
        full_name: "verified-owner/verified-repo",
        owner: { login: "verified-owner" },
        description: "verified upstream description",
        language: "TypeScript",
        stargazers_count: 77,
        pushed_at: "2026-07-25T00:00:00Z",
        html_url: "https://github.com/verified-owner/verified-repo",
        topics: ["verified"],
        homepage: "https://verified.example.test",
        private: false,
        visibility: "public"
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    const response = await api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({
        name: "attacker supplied name",
        author: "attacker",
        language: "Rust",
        stars: 99999,
        updatedAt: "2099-01-01",
        description: "attacker supplied description",
        github: "https://github.com/verified-owner/verified-repo",
        note: "private note is trusted"
      })
    });

    assert.equal(response.status, 201);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const stored = await prisma.project.findUnique({
    where: { github: "https://github.com/verified-owner/verified-repo" }
  });
  assert.equal(stored.name, "verified-repo");
  assert.equal(stored.author, "verified-owner");
  assert.equal(stored.language, "TypeScript");
  assert.equal(stored.stars, 77);
  assert.equal(stored.description, "verified upstream description");
  assert.equal((await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: stored.id } }
  })).note, "private note is trusted");
  assert.deepEqual(requested.map(url => new URL(url).pathname), [
    "/repos/verified-owner/verified-repo",
    "/repos/verified-owner/verified-repo/readme"
  ]);
});

test("manual project creation fails closed for non-GitHub, private, missing, and unreachable repositories", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/private-owner/private-repo")) {
      return Response.json({
        name: "private-repo",
        owner: { login: "private-owner" },
        html_url: "https://github.com/private-owner/private-repo",
        private: true,
        visibility: "private"
      });
    }
    if (target.endsWith("/repos/missing-owner/missing-repo")) {
      return Response.json({ message: "Not Found" }, { status: 404 });
    }
    if (target.endsWith("/repos/offline-owner/offline-repo")) {
      throw new Error("simulated network failure with secret details");
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    for (const github of [
      "https://example.com/not-github/repo",
      "https://github.com/private-owner/private-repo",
      "https://github.com/missing-owner/missing-repo",
      "https://github.com/offline-owner/offline-repo"
    ]) {
      const response = await api("/api/projects", {
        method: "POST",
        cookie: fixture.sessionA,
        body: JSON.stringify({ github, note: "must not persist" })
      });
      assert.ok(response.status >= 400 && response.status < 500, `${github} returned ${response.status}`);
      assert.equal(JSON.stringify(await response.json()).includes("secret details"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count(), 1);
  assert.equal(await prisma.userProject.count(), 2);
});

test("project creation and GitHub import return sanitized rate-limit metadata without retrying GitHub", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ message: "secret upstream detail" }, {
      status: 403,
      headers: { "Retry-After": "19" }
    });
  };

  try {
    for (const [pathname, body] of [
      ["/api/projects", { github: "https://github.com/limited-owner/limited-repo" }],
      ["/api/github/import-repo", { repo: "limited-owner/limited-repo" }]
    ]) {
      const response = await api(pathname, {
        method: "POST",
        cookie: fixture.sessionA,
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 429, pathname);
      assert.equal(response.headers.get("retry-after"), "19", pathname);
      assert.deepEqual(await response.json(), { message: "GitHub rate limit reached." }, pathname);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 2);
});

test("canonical GitHub collisions never expose internal project ids through create/import HTTP responses", async () => {
  const collision = await prisma.project.create({
    data: {
      name: "collision", author: "shared-owner", category: "legacy", categorySource: "rule",
      status: "legacy", language: "JavaScript", stars: 1, updatedAt: "2026-01-01",
      description: "collision fixture", features: "[]", tags: "[]",
      github: "HTTPS://GITHUB.COM/shared-owner/shared-repo.git", demo: "", docs: "", note: "",
      publicVisible: true, visibilityVerifiedAt: new Date()
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo", full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" }, description: "public", language: "JavaScript",
        stargazers_count: 2, pushed_at: "2026-07-26T00:00:00Z",
        html_url: "https://github.com/shared-owner/shared-repo", topics: [],
        private: false, visibility: "public", archived: false
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    for (const [pathname, body] of [
      ["/api/projects", { github: "shared-owner/shared-repo" }],
      ["/api/github/import-repo", { repo: "shared-owner/shared-repo" }]
    ]) {
      const response = await api(pathname, {
        method: "POST", cookie: fixture.sessionA, body: JSON.stringify(body)
      });
      const responseBody = await response.json();
      assert.equal(response.status, 500, pathname);
      assert.deepEqual(responseBody, { error: "Internal server error." }, pathname);
      const serialized = JSON.stringify(responseBody);
      assert.equal(serialized.includes(String(fixture.project.id)), false);
      assert.equal(serialized.includes(String(collision.id)), false);
      assert.equal(serialized.includes("Canonical GitHub URL collision"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await api("/api/health")).status, 200);
});

test("trusted GitHub verification refreshes a hidden legacy Project before republishing it", async () => {
  await prisma.project.update({
    where: { id: 1 },
    data: {
      name: "attacker legacy name",
      author: "attacker legacy author",
      language: "Malware",
      stars: 999999,
      updatedAt: "2099-12-31",
      description: "attacker legacy description",
      latestReleaseAt: new Date("2099-01-01T00:00:00Z"),
      latestCommitAt: new Date("2099-02-02T00:00:00Z"),
      activityCheckedAt: new Date("2099-03-03T00:00:00Z"),
      github: "https://GITHUB.com/SHARED-OWNER/SHARED-REPO.git",
      publicVisible: false,
      visibilityVerifiedAt: null
    }
  });
  const overlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        description: "verified upstream description",
        language: "TypeScript",
        stargazers_count: 321,
        pushed_at: "2026-07-25T00:00:00Z",
        html_url: "https://github.com/shared-owner/shared-repo",
        topics: [],
        private: false,
        visibility: "public"
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  let response;
  try {
    response = await api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({
        github: "https://github.com/shared-owner/shared-repo",
        name: "client forged name",
        author: "client forged author",
        description: "client forged description",
        stars: 123456
      })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  assert.equal(await prisma.project.count(), 1);
  const projectAfter = await prisma.project.findUnique({ where: { id: 1 } });
  assert.deepEqual({
    id: projectAfter.id,
    name: projectAfter.name,
    author: projectAfter.author,
    language: projectAfter.language,
    stars: projectAfter.stars,
    updatedAt: projectAfter.updatedAt,
    description: projectAfter.description,
    github: projectAfter.github,
    publicVisible: projectAfter.publicVisible
  }, {
    id: 1,
    name: "shared-repo",
    author: "shared-owner",
    language: "TypeScript",
    stars: 321,
    updatedAt: "2026-07-25",
    description: "verified upstream description",
    github: "https://github.com/shared-owner/shared-repo",
    publicVisible: true
  });
  assert.equal(projectAfter.latestReleaseAt, null);
  assert.equal(projectAfter.latestCommitAt, null);
  assert.equal(projectAfter.activityCheckedAt, null);
  assert.ok(projectAfter.visibilityVerifiedAt instanceof Date);
  const overlayAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  for (const field of [
    "id", "userId", "projectId", "category", "categorySource", "categoryReason",
    "status", "recommended", "note", "demo", "docs", "tags", "features",
    "aiCategory", "aiConfidence", "aiReason", "aiModel", "aiClassifiedAt"
  ]) {
    assert.deepEqual(overlayAfter[field], overlayBefore[field], `${field} overlay value changed`);
  }
  const [anonymousDetail, anonymousList] = await Promise.all([
    api("/api/projects/1"),
    api("/api/projects")
  ]);
  assert.equal(anonymousDetail.status, 200);
  const anonymousProject = await anonymousDetail.json();
  const anonymousListProject = (await anonymousList.json()).items.find(item => item.id === 1);
  assert.equal(anonymousProject.description, "verified upstream description");
  for (const field of ["latestReleaseAt", "latestCommitAt", "activityCheckedAt"]) {
    assert.equal(anonymousProject[field], null, `detail exposed stale ${field}`);
    assert.equal(anonymousListProject[field], null, `list exposed stale ${field}`);
  }
});

test("project create and GitHub import route unknown transaction errors through one sanitized 500 boundary", async () => {
  const hiddenBefore = await prisma.project.update({
    where: { id: 1 },
    data: {
      name: "hidden rollback name",
      author: "hidden rollback author",
      language: "Unknown",
      stars: 2,
      updatedAt: "2020-02-02",
      description: "hidden rollback description",
      latestReleaseAt: new Date("2020-01-01T00:00:00Z"),
      latestCommitAt: new Date("2020-01-02T00:00:00Z"),
      activityCheckedAt: new Date("2020-01-03T00:00:00Z"),
      publicVisible: false,
      visibilityVerifiedAt: null
    }
  });
  const overlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_hidden_republish_overlay_update"
    BEFORE UPDATE ON "UserProject"
    BEGIN
      SELECT RAISE(ABORT, 'injected hidden republish overlay failure');
    END
  `);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        description: "must roll back",
        language: "Go",
        stargazers_count: 88,
        pushed_at: "2026-07-26T00:00:00Z",
        html_url: "https://github.com/shared-owner/shared-repo",
        topics: [],
        private: false,
        visibility: "public"
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  const unhandled = [];
  const onUnhandledRejection = reason => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    for (const [pathname, body] of [
      ["/api/projects", { github: "https://github.com/shared-owner/shared-repo", note: "force an overlay update" }],
      ["/api/github/import-repo", { repo: "shared-owner/shared-repo", note: "force an overlay update" }]
    ]) {
      const response = await api(pathname, {
        method: "POST",
        cookie: fixture.sessionA,
        body: JSON.stringify(body)
      });
      const responseBody = await response.json();
      assert.equal(response.status, 500, pathname);
      assert.deepEqual(responseBody, { error: "Internal server error." }, pathname);
      const serialized = JSON.stringify(responseBody);
      for (const secret of [
        "fail_hidden_republish_overlay_update",
        "injected hidden republish overlay failure",
        "UserProject",
        "SQLITE"
      ]) {
        assert.equal(serialized.includes(secret), false, `${pathname} leaked ${secret}`);
      }
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.equal((await api("/api/health")).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    process.off("unhandledRejection", onUnhandledRejection);
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_hidden_republish_overlay_update"');
  }

  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), hiddenBefore);
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  }), overlayBefore);
});

test("GitHub reimport with only repo refreshes shared facts without changing either private overlay", async () => {
  const overlayBefore = await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } },
    data: {
      category: "Manual category must stay",
      categorySource: "manual",
      categoryReason: "manual:user-curated",
      status: "Manual status must stay",
      recommended: true,
      note: "Manual note must stay",
      demo: "https://manual.example/demo",
      docs: "https://manual.example/docs",
      tags: JSON.stringify(["manual-tag"]),
      features: JSON.stringify(["manual-feature"])
    }
  });
  const otherOverlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: fixture.project.id } }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json(publicGithubRepository());
    }
    if (target.endsWith("/repos/shared-owner/shared-repo/readme")) {
      return new Response("", { status: 404 });
    }
    throw new Error(`Unexpected private-overlay reimport request: ${url}`);
  };

  let response;
  try {
    response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ repo: "shared-owner/shared-repo" })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  const sharedAfter = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(sharedAfter.description, "refreshed GitHub description");
  assert.equal(sharedAfter.stars, 987);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: overlayBefore.id } }), overlayBefore);
  assert.deepEqual(
    await prisma.userProject.findUnique({ where: { id: otherOverlayBefore.id } }),
    otherOverlayBefore
  );
});

test("GitHub reimport applies only explicitly supported private fields and preserves omitted values", async () => {
  const overlayBefore = await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } },
    data: {
      category: "Old manual category",
      categorySource: "manual",
      categoryReason: "manual:old",
      status: "Old status",
      recommended: true,
      note: "Old note",
      demo: "https://manual.example/demo",
      docs: "https://manual.example/docs",
      tags: JSON.stringify(["manual-tag"]),
      features: JSON.stringify(["manual-feature"])
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json(publicGithubRepository());
    }
    if (target.endsWith("/repos/shared-owner/shared-repo/readme")) {
      return new Response("", { status: 404 });
    }
    throw new Error(`Unexpected sparse reimport request: ${url}`);
  };

  let response;
  try {
    response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({
        repo: "shared-owner/shared-repo",
        category: "New manual category",
        status: "New status",
        note: "",
        features: [],
        docs: null
      })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  const overlayAfter = await prisma.userProject.findUnique({ where: { id: overlayBefore.id } });
  assert.equal(overlayAfter.category, "New manual category");
  assert.equal(overlayAfter.categorySource, "manual");
  assert.equal(overlayAfter.categoryReason, "manual:user-selected");
  assert.equal(overlayAfter.status, "New status");
  assert.equal(overlayAfter.note, "");
  assert.equal(overlayAfter.features, "[]");
  assert.equal(overlayAfter.docs, "");
  for (const field of ["recommended", "demo", "tags"]) {
    assert.deepEqual(overlayAfter[field], overlayBefore[field], `${field} should remain omitted`);
  }
});

test("a first GitHub import creates a complete private overlay from create-only defaults", async () => {
  const newUser = await prisma.user.create({ data: { githubLogin: "first-import-user" } });
  const rawToken = "c".repeat(43);
  const cookie = `github_star_show_session=${rawToken}`;
  await prisma.session.create({
    data: {
      token: hashSessionToken(rawToken),
      userId: newUser.id,
      expiresAt: new Date(Date.now() + 86_400_000)
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json(publicGithubRepository());
    }
    if (target.endsWith("/repos/shared-owner/shared-repo/readme")) {
      return new Response("", { status: 404 });
    }
    throw new Error(`Unexpected first import request: ${url}`);
  };

  let response;
  try {
    response = await api("/api/github/import-repo", {
      method: "POST",
      cookie,
      headers: { "X-CSRF-Token": createCsrfToken(rawToken) },
      body: JSON.stringify({ repo: "shared-owner/shared-repo" })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  const overlay = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: newUser.id, projectId: fixture.project.id } }
  });
  assert.deepEqual({
    category: overlay.category,
    categorySource: overlay.categorySource,
    categoryReason: overlay.categoryReason,
    status: overlay.status,
    recommended: overlay.recommended,
    note: overlay.note,
    demo: overlay.demo,
    docs: overlay.docs,
    tags: overlay.tags,
    features: overlay.features
  }, {
    category: "前端 UI / 可视化",
    categorySource: "language_fallback",
    categoryReason: "language:typescript",
    status: "收藏备用",
    recommended: false,
    note: "Imported from GitHub: shared-owner/shared-repo",
    demo: "https://github-homepage.example/",
    docs: "",
    tags: "[\"github-topic\"]",
    features: "[]"
  });
});

test("reimporting an already-public Project preserves trusted activity fields", async () => {
  const activity = {
    latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
    latestCommitAt: new Date("2026-06-02T00:00:00Z"),
    activityCheckedAt: new Date("2026-06-03T00:00:00Z")
  };
  await prisma.project.update({ where: { id: 1 }, data: activity });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo", full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" }, description: "refreshed public data",
        language: "Vue", stargazers_count: 25, pushed_at: "2026-07-25T00:00:00Z",
        html_url: "https://github.com/shared-owner/shared-repo", topics: [],
        private: false, visibility: "public"
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  let response;
  try {
    response = await api("/api/github/import-repo", {
      method: "POST", cookie: fixture.sessionA,
      body: JSON.stringify({ repo: "shared-owner/shared-repo" })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  const after = await prisma.project.findUnique({ where: { id: 1 } });
  assert.equal(after.description, "refreshed public data");
  for (const [field, value] of Object.entries(activity)) {
    assert.equal(after[field].getTime(), value.getTime(), `${field} was cleared on public reimport`);
  }
});

test("an incomplete public GitHub response keeps a hidden legacy Project offline without advancing its fence", async () => {
  const projectBefore = await prisma.project.update({
    where: { id: 1 },
    data: {
      name: "hidden incomplete name",
      author: "hidden incomplete author",
      language: "Unknown",
      stars: 4,
      updatedAt: "2020-04-04",
      description: "hidden incomplete description",
      publicVisible: false,
      visibilityVerifiedAt: null
    }
  });
  const overlaysBefore = await prisma.userProject.findMany({ orderBy: { id: "asc" } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        html_url: "https://github.com/shared-owner/shared-repo",
        private: false,
        visibility: "public"
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };

  let response;
  try {
    response = await api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ github: "https://github.com/shared-owner/shared-repo" })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(response.status >= 400 && response.status < 500);
  const projectAfter = await prisma.project.findUnique({ where: { id: 1 } });
  assert.equal(projectAfter.visibilityVerifiedAt, null);
  assert.deepEqual(projectAfter, projectBefore);
  assert.deepEqual(await prisma.userProject.findMany({ orderBy: { id: "asc" } }), overlaysBefore);
  assert.equal((await api("/api/projects/1")).status, 404);
});

test("manual project creation links by normalized GitHub URL without overwriting shared facts", async () => {
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/repos/SHARED-OWNER/SHARED-REPO")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        description: "remote description must not win",
        language: "Rust",
        stargazers_count: 99999,
        pushed_at: "2099-01-01T00:00:00Z",
        html_url: "https://github.com/shared-owner/shared-repo",
        topics: [],
        private: false,
        visibility: "public"
      });
    }
    if (String(url).endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${url}`);
  };
  let response;
  try {
    response = await api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({
        name: "attacker rename",
        author: "attacker",
        language: "Rust",
        stars: 99999,
        updatedAt: "2099-01-01",
        description: "attacker description",
        github: "https://GITHUB.com/SHARED-OWNER/SHARED-REPO.git",
        note: "my private note"
      })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 201);
  assert.equal(await prisma.project.count(), 1);
  const projectAfter = await prisma.project.findUnique({ where: { id: 1 } });
  for (const field of ["name", "author", "language", "stars", "updatedAt", "description", "github"]) {
    assert.deepEqual(projectAfter[field], projectBefore[field], `${field} shared fact was overwritten`);
  }
  assert.equal((await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  })).note, "my private note");
});

test("two users concurrently create one shared Project and two private overlays", async () => {
  const payload = {
    name: "Concurrent Repo",
    author: "Concurrent Owner",
    language: "JavaScript",
    stars: 42,
    updatedAt: "2026-07-26",
    description: "created concurrently",
    github: "https://github.com/Concurrent-Owner/Concurrent-Repo.git"
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes("/repos/Concurrent-Owner/Concurrent-Repo")) {
      return Response.json({
        name: "Concurrent-Repo",
        full_name: "Concurrent-Owner/Concurrent-Repo",
        owner: { login: "Concurrent-Owner" },
        description: "created concurrently",
        language: "JavaScript",
        stargazers_count: 42,
        pushed_at: "2026-07-26T00:00:00Z",
        html_url: "https://github.com/concurrent-owner/concurrent-repo",
        topics: [],
        private: false,
        visibility: "public"
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  let responseA;
  let responseB;
  try {
    [responseA, responseB] = await Promise.all([
      api("/api/projects", {
        method: "POST",
        cookie: fixture.sessionA,
        body: JSON.stringify({ ...payload, note: "A concurrent note" })
      }),
      api("/api/projects", {
        method: "POST",
        cookie: fixture.sessionB,
        body: JSON.stringify({ ...payload, note: "B concurrent note" })
      })
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(responseA.status, 201);
  assert.equal(responseB.status, 201);
  const projects = await prisma.project.findMany({
    where: { github: "https://github.com/concurrent-owner/concurrent-repo" }
  });
  assert.equal(projects.length, 1);
  const overlays = await prisma.userProject.findMany({
    where: { projectId: projects[0].id },
    orderBy: { userId: "asc" }
  });
  assert.equal(overlays.length, 2);
  assert.deepEqual(overlays.map(item => item.note), ["A concurrent note", "B concurrent note"]);
});

test("Project and UserProject creation rolls back and sanitizes an unknown overlay constraint error", async () => {
  const github = "https://github.com/atomic-owner/orphan-must-not-remain";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/repos/atomic-owner/orphan-must-not-remain")) {
      return Response.json({
        name: "orphan-must-not-remain",
        full_name: "atomic-owner/orphan-must-not-remain",
        owner: { login: "atomic-owner" },
        description: "must roll back",
        language: "Go",
        stargazers_count: 1,
        pushed_at: "2026-07-26T00:00:00Z",
        html_url: github,
        topics: [],
        private: false,
        visibility: "public"
      });
    }
    if (String(url).endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${url}`);
  };
  let response;
  try {
    response = await api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({
        name: "orphan-must-not-remain",
        author: "atomic-owner",
        language: "Go",
        stars: 1,
        updatedAt: "2026-07-26",
        description: "must roll back",
        github,
        status: null
      })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.equal(await prisma.project.count({ where: { github } }), 0);
});

test("project PATCH rejects unsafe demo and docs URLs without changing the overlay", async () => {
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  for (const [field, value] of [
    ["demo", "javascript:alert(1)"],
    ["demo", "data:text/html,unsafe"],
    ["docs", "file:///tmp/unsafe"],
    ["docs", "/relative"],
    ["docs", "https://user:secret@example.test/private"]
  ]) {
    const response = await api(`/api/projects/${fixture.project.id}`, {
      method: "PATCH", cookie: fixture.sessionA, body: JSON.stringify({ [field]: value })
    });
    assert.equal(response.status, 400, `${field}: ${value}`);
    assert.deepEqual(await response.json(), {
      message: `${field} must be empty or a valid HTTP(S) URL.`
    });
    assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
  }
});

test("project PATCH sends unknown database errors through the sanitized 500 boundary", async () => {
  const secret = "SQL UserProject trigger canonical collision token=secret";
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_project_patch"
    BEFORE UPDATE ON "UserProject"
    WHEN OLD."id" = ${before.id}
    BEGIN
      SELECT RAISE(ABORT, '${secret}');
    END
  `);
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  let response;
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "PATCH", cookie: fixture.sessionA, body: JSON.stringify({ note: "must roll back" })
    });
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_project_patch"');
  }

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Internal server error." });
  assert.equal(JSON.stringify(body).includes(secret), false);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
  assert.deepEqual(unhandled, []);
  assert.equal((await api("/api/health")).status, 200);
});

test("project PATCH does not trust public-error properties forged on an ordinary Error", async () => {
  const secret = "forged public SQL token=secret";
  const forged = Object.assign(new Error(secret), {
    expose: true,
    statusCode: 418,
    publicMessage: secret,
    rateLimited: true,
    retryAfterSeconds: 17
  });
  const userProjectAdapter = new Proxy(prisma.userProject, {
    get(target, property) {
      if (property === "upsert") return async () => { throw forged; };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const adapter = new Proxy(prisma, {
    get(target, property) {
      if (property === "userProject") return userProjectAdapter;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  let response;
  setPrismaAdapterForTests(adapter);
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "PATCH", cookie: fixture.sessionA, body: JSON.stringify({ note: "must not persist" })
    });
  } finally {
    resetPrismaAdapterForTests();
  }

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("retry-after"), null);
  const body = await response.json();
  assert.deepEqual(body, { error: "Internal server error." });
  assert.equal(JSON.stringify(body).includes(secret), false);
});

test("user DELETE removes only their UserProject", async () => {
  const response = await api("/api/projects/1", {
    method: "DELETE",
    cookie: fixture.sessionA,
    body: JSON.stringify({})
  });

  assert.equal(response.status, 200);
  assert.equal(await prisma.project.count({ where: { id: 1 } }), 1);
  assert.equal(await prisma.userProject.count({
    where: { userId: fixture.userA.id, projectId: 1 }
  }), 0);
  assert.equal(await prisma.userProject.count({
    where: { userId: fixture.userB.id, projectId: 1 }
  }), 1);
});

test("DELETE rejects every present non-boolean unstarOnGithub value before side effects", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "strict-unstar-user",
      login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"),
      scope: "public_repo",
      userId: fixture.userA.id
    }
  });
  const overlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(null, { status: 204 });
  };

  try {
    for (const value of ["false", "0", 0, 1, [], {}, null]) {
      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE",
        cookie: fixture.sessionA,
        body: JSON.stringify({ unstarOnGithub: value })
      });
      assert.equal(response.status, 400, JSON.stringify(value));
      assert.deepEqual(await response.json(), {
        message: "unstarOnGithub must be a boolean."
      }, JSON.stringify(value));
      assert.equal(fetchCalls, 0, JSON.stringify(value));
      assert.deepEqual(
        await prisma.userProject.findUnique({ where: { id: overlayBefore.id } }),
        overlayBefore,
        JSON.stringify(value)
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DELETE with omitted or false unstarOnGithub removes only the local overlay", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("GitHub must not be called for a local-only delete");
  };

  try {
    for (const [label, body] of [
      ["omitted", {}],
      ["false", { unstarOnGithub: false }]
    ]) {
      await resetDatabase();
      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE",
        cookie: fixture.sessionA,
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 200, label);
      const responseBody = await response.json();
      assert.deepEqual(responseBody.githubUnstar, {
        attempted: false,
        success: false,
        message: ""
      }, label);
      assert.equal(fetchCalls, 0, label);
      assert.equal(await prisma.userProject.count({
        where: { userId: fixture.userA.id, projectId: fixture.project.id }
      }), 0, label);
      assert.equal(await prisma.userProject.count({
        where: { userId: fixture.userB.id, projectId: fixture.project.id }
      }), 1, label);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("boolean true sends the exact authenticated GitHub DELETE and treats 204 or 404 as success", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [204, 404]) {
      await resetDatabase();
      await prisma.githubAccount.create({
        data: {
          githubUserId: `protocol-unstar-${status}`,
          login: fixture.userA.githubLogin,
          accessToken: encryptGithubToken("mock-unstar-token"),
          scope: "public_repo",
          userId: fixture.userA.id
        }
      });
      let fetchCalls = 0;
      globalThis.fetch = async (url, options) => {
        fetchCalls += 1;
        const target = new URL(String(url));
        assert.equal(target.pathname, "/user/starred/shared-owner/shared-repo");
        assert.equal(target.search, "");
        assert.equal(options.method, "DELETE");
        assert.equal(options.headers.Authorization, "Bearer mock-unstar-token");
        assert.equal(options.headers.Accept, "application/vnd.github+json");
        assert.equal(options.headers["X-GitHub-Api-Version"], "2022-11-28");
        return new Response(null, { status });
      };

      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE",
        cookie: fixture.sessionA,
        body: JSON.stringify({ unstarOnGithub: true })
      });
      assert.equal(response.status, 200, status);
      assert.equal(fetchCalls, 1, status);
      assert.deepEqual((await response.json()).githubUnstar, {
        attempted: true,
        success: true,
        message: "GitHub star removed."
      }, status);
      assert.equal(await prisma.userProject.count({
        where: { userId: fixture.userA.id, projectId: fixture.project.id }
      }), 0, status);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("boolean true without GitHub star-management scope fails safely before fetch or local delete", async () => {
  const overlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(null, { status: 204 });
  };

  let response;
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE",
      cookie: fixture.sessionA,
      body: JSON.stringify({ unstarOnGithub: true })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "GitHub authorization does not include star management yet. Please log out and log in again to grant the new permission."
  });
  assert.equal(fetchCalls, 0);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: overlayBefore.id } }), overlayBefore);
});

test("an unknown GitHub unstar network error is sanitized and preserves the overlay", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "network-unstar-user",
      login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"),
      scope: "public_repo",
      userId: fixture.userA.id
    }
  });
  const overlayBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  const secret = "token=network-secret&internal=socket";
  const unhandled = [];
  const onUnhandledRejection = reason => unhandled.push(reason);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(secret); };
  process.on("unhandledRejection", onUnhandledRejection);

  let response;
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE",
      cookie: fixture.sessionA,
      body: JSON.stringify({ unstarOnGithub: true })
    });
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    globalThis.fetch = originalFetch;
    process.off("unhandledRejection", onUnhandledRejection);
  }

  assert.equal(response.status, 400);
  const responseBody = await response.json();
  assert.deepEqual(responseBody, { message: "Unable to verify GitHub repository." });
  assert.equal(JSON.stringify(responseBody).includes(secret), false);
  assert.deepEqual(unhandled, []);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: overlayBefore.id } }), overlayBefore);
  assert.equal((await api("/api/health")).status, 200);
});

test("GitHub unstar rate limits preserve the overlay and safe Retry-After semantics", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "user-a-github", login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"), scope: "public_repo", userId: fixture.userA.id
    }
  });
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/user\/starred\/shared-owner\/shared-repo$/);
    return new Response("limited", { status: 429, headers: { "Retry-After": "19" } });
  };

  let response;
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE", cookie: fixture.sessionA, body: JSON.stringify({ unstarOnGithub: true })
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "19");
  assert.deepEqual(await response.json(), { message: "GitHub rate limit reached." });
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
  assert.equal((await api("/api/health")).status, 200);
});

test("GitHub unstar recognizes a 403 with official rate-limit evidence as 429", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "user-a-github", login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"), scope: "public_repo", userId: fixture.userA.id
    }
  });
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  const originalFetch = globalThis.fetch;
  let responseFactory;
  globalThis.fetch = async () => responseFactory();

  try {
    for (const [label, factory, expectedRetryAfter] of [
      ["primary", () => new Response("limited", {
        status: 403,
        headers: { "Retry-After": "23", "X-RateLimit-Remaining": "0" }
      }), "23"],
      ["secondary", () => Response.json({
        message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
        documentation_url: "https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits"
      }, { status: 403 }), null]
    ]) {
      responseFactory = factory;
      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE", cookie: fixture.sessionA, body: JSON.stringify({ unstarOnGithub: true })
      });
      assert.equal(response.status, 429, label);
      assert.equal(response.headers.get("retry-after"), expectedRetryAfter, label);
      assert.deepEqual(await response.json(), { message: "GitHub rate limit reached." }, label);
      assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before, label);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub unstar exposes only fixed messages for known safe 4xx responses", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "user-a-github", login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"), scope: "public_repo", userId: fixture.userA.id
    }
  });
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  const originalFetch = globalThis.fetch;
  let upstreamStatus = 422;
  globalThis.fetch = async () => Response.json(
    { message: "validation failed for token=secret" },
    { status: upstreamStatus }
  );

  try {
    for (const [status, expectedMessage] of [
      [401, "GitHub authorization expired. Please log in again."],
      [403, "GitHub authorization does not allow unstarring. Please re-authorize."],
      [422, "GitHub could not remove the star."]
    ]) {
      upstreamStatus = status;
      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE", cookie: fixture.sessionA, body: JSON.stringify({ unstarOnGithub: true })
      });
      assert.equal(response.status, status);
      const body = await response.json();
      assert.deepEqual(body, { message: expectedMessage });
      assert.equal(JSON.stringify(body).includes("token=secret"), false);
      assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub unstar never forwards an unsafe Retry-After value", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "user-a-github", login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"), scope: "public_repo", userId: fixture.userA.id
    }
  });
  const originalFetch = globalThis.fetch;
  let retryAfter = "-1";
  globalThis.fetch = async () => new Response("limited", {
    status: 429,
    headers: { "Retry-After": retryAfter }
  });

  try {
    for (retryAfter of ["-1", "1.5", "9007199254740992", "not-a-number"]) {
      const response = await api(`/api/projects/${fixture.project.id}`, {
        method: "DELETE", cookie: fixture.sessionA, body: JSON.stringify({ unstarOnGithub: true })
      });
      assert.equal(response.status, 429, retryAfter);
      assert.equal(response.headers.get("retry-after"), null, retryAfter);
      assert.deepEqual(await response.json(), { message: "GitHub rate limit reached." });
      assert.equal(await prisma.userProject.count({
        where: { userId: fixture.userA.id, projectId: fixture.project.id }
      }), 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unknown local delete failure after GitHub unstar is sanitized and preserves the overlay", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "user-a-github", login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("mock-unstar-token"), scope: "public_repo", userId: fixture.userA.id
    }
  });
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_local_overlay_delete"
    BEFORE DELETE ON "UserProject"
    WHEN OLD."id" = ${before.id}
    BEGIN
      SELECT RAISE(ABORT, 'UserProject SQL delete token=secret');
    END
  `);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });

  let response;
  try {
    response = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE", cookie: fixture.sessionA, body: JSON.stringify({ unstarOnGithub: true })
    });
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_local_overlay_delete"');
  }

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
  assert.equal((await api("/api/health")).status, 200);
});

test("unstar retries converge after remote 204 and local failure when GitHub later returns 404", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "retry-unstar-user",
      login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("retry-unstar-token"),
      scope: "public_repo",
      userId: fixture.userA.id
    }
  });
  const userAOverlay = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: fixture.project.id } }
  });
  const userBOverlay = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: fixture.project.id } }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_first_retry_unstar_delete"
    BEFORE DELETE ON "UserProject"
    WHEN OLD."id" = ${userAOverlay.id}
    BEGIN
      SELECT RAISE(ABORT, 'local retry window token=secret');
    END
  `);

  const originalFetch = globalThis.fetch;
  const remoteStatuses = [204, 404];
  let remoteCalls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers?.Authorization, "Bearer retry-unstar-token");
    return new Response(null, { status: remoteStatuses[remoteCalls++] });
  };

  let first;
  let second;
  try {
    first = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE",
      cookie: fixture.sessionA,
      body: JSON.stringify({ unstarOnGithub: true })
    });
    await prisma.$executeRawUnsafe('DROP TRIGGER "fail_first_retry_unstar_delete"');
    second = await api(`/api/projects/${fixture.project.id}`, {
      method: "DELETE",
      cookie: fixture.sessionA,
      body: JSON.stringify({ unstarOnGithub: true })
    });
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_first_retry_unstar_delete"');
  }

  assert.equal(first.status, 500);
  assert.deepEqual(await first.json(), { error: "Internal server error." });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).githubUnstar.success, true);
  assert.equal(remoteCalls, 2);
  assert.equal(await prisma.userProject.findUnique({ where: { id: userAOverlay.id } }), null);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: userBOverlay.id } }), userBOverlay);
});

test("anonymous project README never sends the server GitHub token", async () => {
  const originalFetch = globalThis.fetch;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const requests = [];
  process.env.GITHUB_TOKEN = "server-fallback-token";
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), headers: options.headers || {} });
    const authorization = options.headers?.Authorization;
    return authorization
      ? new Response("private README from server token", { status: 200 })
      : new Response("", { status: 404 });
  };

  let response;
  try {
    response = await api("/api/projects/1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
  }

  assert.equal(response.status, 200);
  assert.equal((await response.json()).readme, "");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.Authorization, undefined);
});

test("anonymous project README still reads a public repository without authentication", async () => {
  const originalFetch = globalThis.fetch;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  globalThis.fetch = async (_url, options = {}) => {
    assert.equal(options.headers?.Authorization, undefined);
    return new Response("public README", { status: 200 });
  };

  let response;
  try {
    response = await api("/api/projects/1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
  }

  assert.equal(response.status, 200);
  assert.equal((await response.json()).readme, "public README");
});

test("authenticated project README uses only the session token and is private no-store", async () => {
  await prisma.githubAccount.create({
    data: {
      githubUserId: "readme-user-a",
      login: fixture.userA.githubLogin,
      accessToken: encryptGithubToken("session-user-token"),
      scope: "repo",
      userId: fixture.userA.id
    }
  });
  const originalFetch = globalThis.fetch;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const authorizations = [];
  process.env.GITHUB_TOKEN = "server-fallback-token";
  globalThis.fetch = async (_url, options = {}) => {
    authorizations.push(options.headers?.Authorization);
    return new Response("user README", { status: 200 });
  };

  let response;
  try {
    response = await api("/api/projects/1", { cookie: fixture.sessionA });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
  }

  assert.equal(response.status, 200);
  assert.equal((await response.json()).readme, "user README");
  assert.deepEqual(authorizations, ["Bearer session-user-token"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("vary") || "", /(?:^|,\s*)Cookie(?:,|$)/i);
});

test("GitHub README failures return empty content without exposing internal errors", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    ["not found", async () => new Response("private repository", { status: 404 })],
    ["rate limited", async () => new Response("secret quota details", {
      status: 429,
      headers: { "Retry-After": "30" }
    })],
    ["network failure", async () => { throw new Error("connect ECONNREFUSED token=secret"); }]
  ];

  try {
    for (const [label, fetchMock] of cases) {
      globalThis.fetch = fetchMock;
      const response = await api("/api/projects/1");
      assert.equal(response.status, 200, label);
      const body = await response.json();
      assert.equal(body.readme, "", label);
      assert.doesNotMatch(JSON.stringify(body), /private repository|quota|ECONNREFUSED|secret/i, label);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal((await api("/api/health")).status, 200);
});

test("public project responses expose only shared repository facts", async () => {
  const listResponse = await api("/api/projects");
  const detailResponse = await api("/api/projects/1");
  const listItem = (await listResponse.json()).items[0];
  const detail = await detailResponse.json();
  const privateFields = [
    "category", "categorySource", "categoryReason", "status", "recommended",
    "note", "demo", "docs", "tags", "features", "aiCategory", "aiConfidence",
    "aiReason", "aiModel", "aiClassifiedAt"
  ];

  assert.equal(listResponse.status, 200);
  assert.equal(detailResponse.status, 200);
  for (const field of privateFields) {
    assert.equal(Object.hasOwn(listItem, field), false, `list leaked ${field}`);
    assert.equal(Object.hasOwn(detail, field), false, `detail leaked ${field}`);
  }
  assert.equal(detail.description, "shared description");
  assert.equal(detail.note, undefined);
  const publicKeys = [
    "activityCheckedAt", "author", "description", "github", "id", "language",
    "latestCommitAt", "latestReleaseAt", "name", "stars", "updatedAt"
  ];
  assert.deepEqual(Object.keys(listItem).sort(), publicKeys);
  assert.deepEqual(Object.keys(detail).filter(key => key !== "readme").sort(), publicKeys);
});

test("authenticated project responses do not expose overlay identity or version metadata", async () => {
  const overlay = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const response = await api("/api/sync/me/projects", { cookie: fixture.sessionA });
  const item = (await response.json()).items[0];

  assert.equal(response.status, 200);
  assert.equal(item.id, fixture.project.id);
  assert.equal(item.updatedAt, fixture.project.updatedAt);
  assert.notEqual(overlay.updatedAt, item.updatedAt);
  for (const field of [
    "userProjectId", "userProjectUpdatedAt", "overlayId", "overlayUpdatedAt",
    "userId", "projectId", "createdAt"
  ]) {
    assert.equal(Object.hasOwn(item, field), false, `authenticated response leaked ${field}`);
  }
});

test("cookie-dependent GET responses are private no-store and keep user overlays isolated", async () => {
  const cases = [
    ["anonymous detail", "/api/projects/1", {}],
    ["authenticated detail", "/api/projects/1", { cookie: fixture.sessionA }],
    ["anonymous sync projects", "/api/sync/me/projects", {}],
    ["authenticated sync projects", "/api/sync/me/projects", { cookie: fixture.sessionA }],
    ["anonymous sync status", "/api/sync/me/status", {}],
    ["authenticated sync status", "/api/sync/me/status", { cookie: fixture.sessionA }],
    ["anonymous auth state", "/auth/me", {}],
    ["authenticated auth state", "/auth/me", { cookie: fixture.sessionA }],
    ["OAuth callback state", "/auth/github/callback?state=invalid", {}]
  ];

  for (const [label, pathname, options] of cases) {
    const response = await api(pathname, options);
    assert.equal(response.headers.get("cache-control"), "private, no-store", label);
    assert.match(response.headers.get("vary") || "", /(?:^|,\s*)Cookie(?:,|$)/i, label);
  }

  const [userAResponse, userBResponse] = await Promise.all([
    api("/api/sync/me/projects", { cookie: fixture.sessionA }),
    api("/api/sync/me/projects", { cookie: fixture.sessionB })
  ]);
  const userAItem = (await userAResponse.json()).items[0];
  const userBItem = (await userBResponse.json()).items[0];
  assert.equal(userAItem.note, "A note");
  assert.equal(userBItem.note, "B note");

  const publicList = await api("/api/projects");
  assert.equal(publicList.headers.get("cache-control"), null);
});

test("anonymous list and detail hide projects without an affirmative public verification", async () => {
  const hidden = await prisma.project.create({
    data: {
      name: "unverified",
      author: "owner",
      category: "legacy",
      status: "saved",
      language: "Go",
      stars: 3,
      updatedAt: "2026-07-26",
      recommended: false,
      description: "must remain hidden",
      features: "[]",
      tags: "[]",
      github: "https://github.com/owner/unverified",
      demo: "",
      docs: "",
      note: ""
    }
  });

  const list = await api("/api/projects");
  const detail = await api(`/api/projects/${hidden.id}`);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).items.some(item => item.id === hidden.id), false);
  assert.equal(detail.status, 404);
});

test("full star sync immediately takes a formerly public project offline when GitHub reports it private", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls += 1;
    assert.match(String(url), /\/user\/starred\?/);
    return Response.json([{
      starred_at: "2026-07-26T12:00:00Z",
      repo: {
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        html_url: "https://github.com/shared-owner/shared-repo",
        private: true,
        visibility: "private"
      }
    }]);
  };

  try {
    const result = await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-token"
    }, { mode: "full" });
    assert.equal(result.skippedPrivate, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 1);
  assert.equal((await prisma.project.findUnique({ where: { id: 1 } })).publicVisible, false);
  assert.equal((await api("/api/projects/1")).status, 404);
  assert.equal((await api("/api/projects/1", { cookie: fixture.sessionA })).status, 200);
});

test("a validated private page is hidden before a later Star page fails, without public writes", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const star = (name, visibility = "public") => ({
    starred_at: "2026-07-26T12:00:00Z",
    repo: {
      name,
      full_name: `shared-owner/${name}`,
      owner: { login: "shared-owner" },
      description: `${name} description`,
      language: "TypeScript",
      stargazers_count: 1,
      pushed_at: "2026-07-26T00:00:00Z",
      html_url: `https://github.com/shared-owner/${name}`,
      topics: [],
      private: visibility !== "public",
      visibility,
      archived: false
    }
  });
  const pageOne = [star("shared-repo", "private")];
  for (let index = 1; index < 100; index += 1) pageOne.push(star(`public-${index}`));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const page = new URL(String(url)).searchParams.get("page");
    if (page === "1") return Response.json(pageOne);
    return Response.json({ message: "rate limited" }, {
      status: 429,
      headers: { "Retry-After": "0" }
    });
  };
  try {
    await assert.rejects(
      syncUserStars({
        id: String(fixture.userA.id),
        dbUserId: fixture.userA.id,
        accessToken: "mock-token"
      }, { mode: "full" })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const hidden = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(hidden.publicVisible, false);
  assert.equal(hidden.latestReleaseAt, null);
  assert.equal(hidden.latestCommitAt, null);
  assert.equal(hidden.activityCheckedAt, null);
  assert.equal(await prisma.project.count({
    where: { github: { startsWith: "https://github.com/shared-owner/public-" } }
  }), 0);
});

test("full remote recheck never refreshes shared activity after a formerly public project becomes private", async () => {
  const previousActivity = {
    latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
    latestCommitAt: new Date("2026-06-02T00:00:00Z"),
    activityCheckedAt: new Date("2026-06-03T00:00:00Z")
  };
  await prisma.project.update({ where: { id: fixture.project.id }, data: previousActivity });
  const userBBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: fixture.project.id } }
  });

  const originalFetch = globalThis.fetch;
  let releaseCalls = 0;
  let commitCalls = 0;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([]);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        html_url: "https://github.com/shared-owner/shared-repo",
        archived: false,
        private: true,
        visibility: "private"
      });
    }
    if (target.includes("/releases/latest")) {
      releaseCalls += 1;
      return Response.json({ published_at: "2026-07-27T00:00:00Z" });
    }
    if (target.includes("/commits")) {
      commitCalls += 1;
      return Response.json([{ commit: { committer: { date: "2026-07-28T00:00:00Z" } } }]);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "user-a-private-repo-token"
    }, { mode: "full" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(releaseCalls, 0);
  assert.equal(commitCalls, 0);
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, false);
  assert.equal(project.latestReleaseAt, null);
  assert.equal(project.latestCommitAt, null);
  assert.equal(project.activityCheckedAt, null);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: userBBefore.id } }), userBBefore);

  const userBItem = (await (await api("/api/sync/me/projects", { cookie: fixture.sessionB })).json()).items[0];
  assert.equal(userBItem.note, "B note");
  assert.equal(userBItem.latestReleaseAt, null);
  assert.equal(userBItem.latestCommitAt, null);
  assert.equal(userBItem.activityCheckedAt, null);
});

test("full remote recheck preserves visibility when repository visibility cannot be verified", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    const target = String(url);
    requested.push(new URL(target).pathname);
    if (target.includes("/user/starred?")) return Response.json([]);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      throw new TypeError("simulated visibility network failure");
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-token"
    }, { mode: "full" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requested[0], "/user/starred");
  assert.ok(requested.slice(1).length >= 1);
  assert.ok(requested.slice(1).every(pathname => pathname === "/repos/shared-owner/shared-repo"));
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  assert.equal(project.latestReleaseAt.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(project.latestCommitAt.toISOString(), "2026-06-02T00:00:00.000Z");
  assert.equal(project.activityCheckedAt.toISOString(), "2026-06-03T00:00:00.000Z");
});

test("full remote recheck refreshes activity only after an affirmative public inspection", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    requested.push(new URL(target).pathname);
    if (target.includes("/user/starred?")) return Response.json([]);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        html_url: "https://github.com/shared-owner/shared-repo",
        archived: false,
        private: false,
        visibility: "public"
      });
    }
    if (target.endsWith("/user/starred/shared-owner/shared-repo")) {
      return new Response(null, { status: 204, headers: options.headers });
    }
    if (target.endsWith("/releases/latest")) {
      return Response.json({ published_at: "2026-07-27T00:00:00Z" });
    }
    if (target.includes("/commits?")) {
      return Response.json([{ commit: { author: { date: "2026-07-28T00:00:00Z" } } }]);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-token"
    }, { mode: "full" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(requested.includes("/repos/shared-owner/shared-repo/releases/latest"));
  assert.ok(requested.includes("/repos/shared-owner/shared-repo/commits"));
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  assert.equal(project.latestReleaseAt.toISOString(), "2026-07-27T00:00:00.000Z");
  assert.equal(project.latestCommitAt.toISOString(), "2026-07-28T00:00:00.000Z");
  assert.ok(project.activityCheckedAt instanceof Date);
});

test("a stale public sync snapshot cannot republish a Project hidden by a newer user sync", async () => {
  const verifiedPublicBefore = new Date("2026-07-20T00:00:00Z");
  const hiddenAt = new Date("2026-07-21T00:00:00Z");
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      publicVisible: false,
      visibilityVerifiedAt: hiddenAt,
      latestReleaseAt: null,
      latestCommitAt: null,
      activityCheckedAt: null
    }
  });
  const existingUserProject = await getUserProjectByProjectId({
    id: String(fixture.userA.id),
    dbUserId: fixture.userA.id
  }, fixture.project.id);

  const saved = await upsertProjectForUser({
    id: String(fixture.userA.id),
    dbUserId: fixture.userA.id
  }, {
    name: fixture.project.name,
    author: fixture.project.author,
    description: fixture.project.description,
    language: fixture.project.language,
    stars: fixture.project.stars,
    updatedAt: fixture.project.updatedAt,
    github: fixture.project.github
  }, {}, {
    updateShared: true,
    verifiedPublic: true,
    verifiedPublicBefore,
    existingUserProject
  });

  assert.equal(saved, null);
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, false);
  assert.equal(project.visibilityVerifiedAt.toISOString(), hiddenAt.toISOString());
  assert.equal(project.latestReleaseAt, null);
  assert.equal(project.latestCommitAt, null);
  assert.equal(project.activityCheckedAt, null);
});

test("a stale public Star response cannot return activity cleared by a newer private fence", async () => {
  const previousActivity = {
    latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
    latestCommitAt: new Date("2026-06-02T00:00:00Z"),
    activityCheckedAt: new Date("2026-06-03T00:00:00Z")
  };
  await prisma.project.update({ where: { id: fixture.project.id }, data: previousActivity });
  const originalFetch = globalThis.fetch;
  let releaseStarBody;
  const starBodyStarted = new Promise(resolve => {
    globalThis.fetch = async url => {
      const target = String(url);
      if (!target.includes("/user/starred?")) throw new Error(`Unexpected request ${target}`);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          resolve();
          releaseStarBody = () => {
            controller.enqueue(encoder.encode(JSON.stringify([{
              starred_at: "2026-07-26T12:00:00Z",
              repo: {
                name: "shared-repo",
                full_name: "shared-owner/shared-repo",
                owner: { login: "shared-owner" },
                description: "stale public data",
                language: "JavaScript",
                stargazers_count: 7,
                pushed_at: "2026-07-26T00:00:00Z",
                html_url: fixture.project.github,
                topics: [],
                private: false,
                visibility: "public",
                archived: false
              }
            }])));
            controller.close();
          };
        }
      }), { headers: { "Content-Type": "application/json" } });
    };
  });

  const syncPromise = syncUserStars({
    id: String(fixture.userB.id), dbUserId: fixture.userB.id, accessToken: "mock-token"
  }, { mode: "full" });
  let result;
  try {
    await starBodyStarted;
    await prisma.project.update({
      where: { id: fixture.project.id },
      data: {
        publicVisible: false,
        visibilityVerifiedAt: new Date(Date.now() + 1_000),
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      }
    });
    const release = releaseStarBody;
    releaseStarBody = null;
    release();
    result = await syncPromise;
  } finally {
    releaseStarBody?.();
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].conflicted, true);
  for (const field of ["latestReleaseAt", "latestCommitAt", "activityCheckedAt"]) {
    assert.equal(result.items[0][field], null, `sync response leaked stale ${field}`);
  }
});

test("a stale public remote recheck cannot call activity after a newer private fence", async () => {
  const originalFetch = globalThis.fetch;
  let releaseVisibilityBody;
  let visibilityBodyStarted;
  const visibilityBodyStartedPromise = new Promise(resolve => { visibilityBodyStarted = resolve; });
  let releaseCalls = 0;
  let commitCalls = 0;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([]);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          visibilityBodyStarted();
          releaseVisibilityBody = () => {
            controller.enqueue(encoder.encode(JSON.stringify({
              name: "shared-repo",
              full_name: "shared-owner/shared-repo",
              owner: { login: "shared-owner" },
              description: "stale public inspection",
              language: "JavaScript",
              stargazers_count: 7,
              pushed_at: "2026-07-26T00:00:00Z",
              html_url: fixture.project.github,
              topics: [],
              private: false,
              visibility: "public",
              archived: false
            })));
            controller.close();
          };
        }
      }), { headers: { "Content-Type": "application/json" } });
    }
    if (target.includes("/releases/latest")) {
      releaseCalls += 1;
      return Response.json({ message: "not found" }, { status: 404 });
    }
    if (target.includes("/commits?")) {
      commitCalls += 1;
      return Response.json([]);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  const syncPromise = syncUserStars({
    id: String(fixture.userB.id), dbUserId: fixture.userB.id, accessToken: "mock-token"
  }, { mode: "full" });
  try {
    await visibilityBodyStartedPromise;
    await prisma.project.update({
      where: { id: fixture.project.id },
      data: {
        publicVisible: false,
        visibilityVerifiedAt: new Date(Date.now() + 1_000),
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      }
    });
    const release = releaseVisibilityBody;
    releaseVisibilityBody = null;
    release();
    await syncPromise;
  } finally {
    releaseVisibilityBody?.();
    globalThis.fetch = originalFetch;
  }

  assert.equal(releaseCalls, 0);
  assert.equal(commitCalls, 0);
  assert.equal((await prisma.project.findUnique({ where: { id: fixture.project.id } })).publicVisible, false);
});

test("a newer private fence clears activity from the final sync response after requests were in flight", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  let releaseActivity;
  let activityStarted;
  const activityStartedPromise = new Promise(resolve => { activityStarted = resolve; });
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) {
      return Response.json([{
        starred_at: "2026-07-26T12:00:00Z",
        repo: {
          name: "shared-repo",
          full_name: "shared-owner/shared-repo",
          owner: { login: "shared-owner" },
          description: "public before the activity race",
          language: "JavaScript",
          stargazers_count: 7,
          pushed_at: "2026-07-26T00:00:00Z",
          html_url: fixture.project.github,
          topics: [],
          private: false,
          visibility: "public",
          archived: false
        }
      }]);
    }
    if (target.endsWith("/releases/latest")) {
      activityStarted();
      await new Promise(resolve => { releaseActivity = resolve; });
      return Response.json({ published_at: "2026-07-27T00:00:00Z" });
    }
    if (target.includes("/commits?")) {
      return Response.json([{ commit: { author: { date: "2026-07-28T00:00:00Z" } } }]);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  const syncPromise = syncUserStars({
    id: String(fixture.userB.id), dbUserId: fixture.userB.id, accessToken: "mock-token"
  }, { mode: "full" });
  let result;
  try {
    await activityStartedPromise;
    await prisma.userProject.delete({
      where: { userId_projectId: { userId: fixture.userB.id, projectId: fixture.project.id } }
    });
    await prisma.project.update({
      where: { id: fixture.project.id },
      data: {
        publicVisible: false,
        visibilityVerifiedAt: new Date(Date.now() + 1_000),
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      }
    });
    releaseActivity();
    releaseActivity = null;
    result = await syncPromise;
  } finally {
    releaseActivity?.();
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.items.length, 1);
  for (const field of ["latestReleaseAt", "latestCommitAt", "activityCheckedAt"]) {
    assert.equal(result.items[0][field], null, `final sync response leaked ${field}`);
  }
  assert.equal((await prisma.project.findUnique({ where: { id: fixture.project.id } })).publicVisible, false);
});

test("independent recheck removes an earlier item when its overlay is deleted behind a newer private fence", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const secondProject = await prisma.project.create({
    data: {
      name: "second-repo",
      author: "shared-owner",
      category: "legacy",
      status: "saved",
      language: "JavaScript",
      stars: 2,
      updatedAt: "2026-07-26",
      recommended: false,
      description: "second target",
      features: "[]",
      tags: "[]",
      github: "https://github.com/shared-owner/second-repo",
      demo: "",
      docs: "",
      note: "",
      publicVisible: true,
      visibilityVerifiedAt: new Date()
    }
  });
  await prisma.userProject.create({
    data: privateUserProjectData(fixture.userB.id, secondProject.id, "B second")
  });

  const originalFetch = globalThis.fetch;
  let releaseSecond;
  let secondStarted;
  const secondStartedPromise = new Promise(resolve => { secondStarted = resolve; });
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo", full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" }, html_url: fixture.project.github,
        archived: false, private: false, visibility: "public"
      });
    }
    if (target.endsWith("/repos/shared-owner/second-repo")) {
      secondStarted();
      await new Promise(resolve => { releaseSecond = resolve; });
      return Response.json({
        name: "second-repo", full_name: "shared-owner/second-repo",
        owner: { login: "shared-owner" }, html_url: secondProject.github,
        archived: false, private: false, visibility: "public"
      });
    }
    if (target.includes("/user/starred/shared-owner/")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  const recheckPromise = recheckRemoteStatusForUser({
    id: String(fixture.userB.id), dbUserId: fixture.userB.id, accessToken: "mock-token"
  }, [fixture.project.id, secondProject.id]);
  let result;
  try {
    await secondStartedPromise;
    await prisma.userProject.delete({
      where: { userId_projectId: { userId: fixture.userB.id, projectId: fixture.project.id } }
    });
    await prisma.project.update({
      where: { id: fixture.project.id },
      data: {
        publicVisible: false,
        visibilityVerifiedAt: new Date(Date.now() + 1_000),
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      }
    });
    releaseSecond();
    releaseSecond = null;
    result = await recheckPromise;
  } finally {
    releaseSecond?.();
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.items.some(item => item.id === fixture.project.id), false);
  assert.equal(result.conflicts.some(item => item.projectId === fixture.project.id), true);
  assert.equal(result.items.some(item => item.id === secondProject.id), true);
  for (const item of result.items) {
    assert.equal(item.latestReleaseAt, null);
    assert.equal(item.latestCommitAt, null);
    assert.equal(item.activityCheckedAt, null);
  }
});

test("malformed manual GitHub inputs cannot hide a canonical shared Project", async () => {
  const activity = {
    latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
    latestCommitAt: new Date("2026-06-02T00:00:00Z"),
    activityCheckedAt: new Date("2026-06-03T00:00:00Z")
  };
  await prisma.project.update({ where: { id: fixture.project.id }, data: activity });
  const malformed = `${fixture.project.github}/extra`;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("invalid input must fail before fetch");
  };
  try {
    const createResponse = await api("/api/projects", {
      method: "POST", cookie: fixture.sessionA, body: JSON.stringify({ github: malformed })
    });
    const importResponse = await api("/api/github/import-repo", {
      method: "POST", cookie: fixture.sessionA, body: JSON.stringify({ repo: malformed })
    });
    assert.equal(createResponse.status, 400);
    assert.equal(importResponse.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  for (const [field, value] of Object.entries(activity)) {
    assert.equal(project[field].getTime(), value.getTime(), `${field} was cleared by malformed input`);
  }
});

test("concurrent public and private manual checks finish with the shared Project private", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  let releaseRepository;
  const repositoryGate = new Promise(resolve => { releaseRepository = resolve; });
  let repositoryRequested;
  const repositoryRequestedPromise = new Promise(resolve => { repositoryRequested = resolve; });
  let repositoryCalls = 0;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      repositoryCalls += 1;
      if (repositoryCalls > 1) {
        return Response.json({
          name: "shared-repo",
          full_name: "shared-owner/shared-repo",
          owner: { login: "shared-owner" },
          html_url: "https://github.com/shared-owner/shared-repo",
          archived: false,
          private: true,
          visibility: "private"
        });
      }
      repositoryRequested();
      await repositoryGate;
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        html_url: "https://github.com/shared-owner/shared-repo",
        description: "stale public response",
        language: "Vue",
        stargazers_count: 11,
        pushed_at: "2026-07-28T00:00:00Z",
        homepage: "",
        topics: [],
        archived: false,
        private: false,
        visibility: "public"
      });
    }
    if (target.endsWith("/repos/shared-owner/shared-repo/readme")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    const request = api("/api/projects", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ github: fixture.project.github })
    });
    await repositoryRequestedPromise;
    const negativeRequest = api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionB,
      body: JSON.stringify({ repo: fixture.project.github })
    });
    releaseRepository();
    const response = await request;
    const negativeResponse = await negativeRequest;
    assert.equal(response.status, 201);
    assert.equal(negativeResponse.status, 422);
  } finally {
    releaseRepository?.();
    globalThis.fetch = originalFetch;
  }

  assert.equal((await prisma.project.findUnique({
    where: { github: fixture.project.github }
  })).publicVisible, false);
});

test("manual repository verification failure hides an existing shared Project and clears activity", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/repos\/shared-owner\/shared-repo$/);
    return Response.json({
      name: "shared-repo",
      full_name: "shared-owner/shared-repo",
      owner: { login: "shared-owner" },
      html_url: fixture.project.github,
      archived: false,
      private: true,
      visibility: "private"
    });
  };
  try {
    const response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ repo: fixture.project.github })
    });
    assert.equal(response.status, 422);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, false);
  assert.equal(project.latestReleaseAt, null);
  assert.equal(project.latestCommitAt, null);
  assert.equal(project.activityCheckedAt, null);
});

test("manual repository unknown failures preserve shared visibility and activity", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      publicVisible: true,
      latestReleaseAt: new Date("2026-06-11T00:00:00Z"),
      latestCommitAt: new Date("2026-06-12T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-13T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unknown upstream failure"); };
  try {
    const response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ repo: fixture.project.github })
    });
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  assert.equal(project.latestReleaseAt.toISOString(), "2026-06-11T00:00:00.000Z");
  assert.equal(project.latestCommitAt.toISOString(), "2026-06-12T00:00:00.000Z");
  assert.equal(project.activityCheckedAt.toISOString(), "2026-06-13T00:00:00.000Z");
});

test("incremental sync revalidates older projects so the starred_at cutoff cannot leave a private repo public", async () => {
  await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
    data: { starredAt: new Date("2026-07-25T12:00:00Z") }
  });
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    const target = String(url);
    requested.push(new URL(target).pathname);
    if (target.includes("/user/starred?")) {
      return Response.json([{
        starred_at: "2026-07-24T12:00:00Z",
        repo: {
          name: "shared-repo",
          full_name: "shared-owner/shared-repo",
          owner: { login: "shared-owner" },
          html_url: "https://github.com/shared-owner/shared-repo",
          private: true,
          visibility: "private"
        }
      }]);
    }
    if (target.endsWith("/repos/shared-owner/shared-repo")) {
      return Response.json({
        name: "shared-repo",
        full_name: "shared-owner/shared-repo",
        owner: { login: "shared-owner" },
        html_url: "https://github.com/shared-owner/shared-repo",
        archived: false,
        private: true,
        visibility: "private"
      });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    const result = await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-token"
    }, { mode: "incremental" });
    assert.equal(result.mode, "incremental");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requested, ["/user/starred", "/repos/shared-owner/shared-repo"]);
  assert.equal((await prisma.project.findUnique({ where: { id: 1 } })).publicVisible, false);
  assert.equal((await api("/api/projects/1")).status, 404);
});

test("empty project storage stays empty and failed database probes return health 503", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const empty = await api("/api/projects");
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).items, []);

  const healthy = await api("/api/health");
  assert.equal(healthy.status, 200);
  setPrismaAdapterForTests({
    $queryRawUnsafe: async () => { throw new Error("injected database failure"); }
  });
  try {
    const unhealthy = await api("/api/health");
    assert.equal(unhealthy.status, 503);
    assert.deepEqual(await unhealthy.json(), {
      ok: false,
      service: "github-star-show-backend",
      database: "unavailable"
    });
  } finally {
    resetPrismaAdapterForTests();
  }

  setPrismaAdapterForTests({
    project: {
      findMany: async () => { throw new Error("injected route database failure"); }
    },
    $queryRawUnsafe: async () => [{ ok: 1 }]
  });
  try {
    const failedRoute = await api("/api/projects");
    assert.equal(failedRoute.status, 500);
    assert.deepEqual(await failedRoute.json(), { error: "Internal server error." });
    assert.equal((await api("/api/health")).status, 200);
  } finally {
    resetPrismaAdapterForTests();
  }
});

test("app-level meta rejection is sanitized without destabilizing later health requests", async () => {
  const unhandled = [];
  const onUnhandledRejection = reason => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandledRejection);
  setPrismaAdapterForTests({
    project: {
      findMany: async () => { throw new Error("sensitive injected meta failure"); }
    },
    $queryRawUnsafe: async () => [{ ok: 1 }]
  });

  try {
    let failedMeta;
    try {
      failedMeta = await nativeFetch(`${baseUrl}/api/meta`, {
        signal: AbortSignal.timeout(250)
      });
    } catch {
      failedMeta = null;
    }
    assert.ok(failedMeta, "meta request should reach the Express error handler");
    assert.equal(failedMeta.status, 500);
    assert.deepEqual(await failedMeta.json(), { error: "Internal server error." });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.equal((await api("/api/health")).status, 200);
  } finally {
    resetPrismaAdapterForTests();
    process.off("unhandledRejection", onUnhandledRejection);
  }
});

test("GitHub sync updates shared facts and creates only user A's classification overlay", async () => {
  await prisma.userProject.delete({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });
  const userBBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred")) {
      return jsonResponse([{
        starred_at: "2026-07-25T12:00:00Z",
        repo: {
          name: "shared-repo",
          full_name: "shared-owner/shared-repo",
          owner: { login: "shared-owner" },
          description: "fresh GitHub description",
          language: "Vue",
          stargazers_count: 321,
          pushed_at: "2026-07-25T00:00:00Z",
          html_url: "https://github.com/shared-owner/shared-repo",
          homepage: "https://demo.example.test",
          topics: ["vue"],
          private: false,
          visibility: "public",
          archived: false
        }
      }]);
    }
    return jsonResponse({ message: "not found" }, 404);
  };

  try {
    const result = await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-github-token"
    });
    assert.equal(result.total, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const projectAfter = await prisma.project.findUnique({ where: { id: 1 } });
  const userAAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(projectAfter.stars, 321);
  assert.equal(projectAfter.description, "fresh GitHub description");
  assert.equal(projectAfter.category, projectBefore.category);
  assert.equal(projectAfter.note, projectBefore.note);
  assert.notEqual(userAAfter.category, projectBefore.category);
  assert.notEqual(userAAfter.categorySource, "manual");
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  }), userBBefore);
});

test("GitHub Star sync imports public repositories and never persists explicit private or internal repositories", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes("/user/starred")) {
      return jsonResponse([
        {
          starred_at: "2026-07-25T12:00:00Z",
          repo: {
            name: "public-repo",
            full_name: "sync-owner/public-repo",
            owner: { login: "sync-owner" },
            description: "public sync data",
            language: "TypeScript",
            stargazers_count: 12,
            pushed_at: "2026-07-25T00:00:00Z",
            html_url: "https://github.com/sync-owner/public-repo",
            topics: [],
            private: false,
            visibility: "public",
            archived: false
          }
        },
        {
          starred_at: "2026-07-24T12:00:00Z",
          repo: {
            name: "private-repo",
            full_name: "sync-owner/private-repo",
            owner: { login: "sync-owner" },
            description: "private data must not persist",
            language: "Go",
            stargazers_count: 1,
            pushed_at: "2026-07-24T00:00:00Z",
            html_url: "https://github.com/sync-owner/private-repo",
            topics: ["secret"],
            private: true,
            visibility: "private",
            archived: false
          }
        },
        {
          starred_at: "2026-07-23T12:00:00Z",
          repo: {
            name: "unverified-repo",
            full_name: "sync-owner/unverified-repo",
            owner: { login: "sync-owner" },
            description: "internal data must not persist",
            language: "Python",
            stargazers_count: 2,
            pushed_at: "2026-07-23T00:00:00Z",
            html_url: "https://github.com/sync-owner/unverified-repo",
            topics: [],
            private: true,
            visibility: "internal",
            archived: false
          }
        }
      ]);
    }
    return jsonResponse({ message: "not found" }, 404);
  };

  try {
    const result = await syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken: "mock-github-token"
    });
    assert.equal(result.total, 1);
    assert.equal(result.skippedPrivate, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/sync-owner/public-repo" }
  }), 1);
  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/sync-owner/private-repo" }
  }), 0);
  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/sync-owner/unverified-repo" }
  }), 0);
  assert.equal(await prisma.project.count({
    where: { description: { contains: "private data" } }
  }), 0);
});

test("GitHub repository completeness gate rejects unsafe downstream types and values", () => {
  const valid = {
    name: "typed-repo",
    full_name: "typed-owner/typed-repo",
    owner: { login: "typed-owner" },
    description: null,
    language: null,
    stargazers_count: 0,
    pushed_at: null,
    html_url: "https://github.com/typed-owner/typed-repo",
    topics: [],
    homepage: null,
    private: false,
    visibility: "public",
    archived: false
  };
  const invalidCases = [
    ["pushed_at number", repo => { repo.pushed_at = 42; }],
    ["pushed_at array", repo => { repo.pushed_at = []; }],
    ["pushed_at object", repo => { repo.pushed_at = {}; }],
    ["pushed_at invalid date", repo => { repo.pushed_at = "not-a-date"; }],
    ["pushed_at loose zero", repo => { repo.pushed_at = "0"; }],
    ["pushed_at local text", repo => { repo.pushed_at = "July 26, 2026"; }],
    ["pushed_at invalid calendar date", repo => { repo.pushed_at = "2026-02-30T00:00:00Z"; }],
    ["pushed_at date only", repo => { repo.pushed_at = "2026-07-26"; }],
    ["pushed_at offset timezone", repo => { repo.pushed_at = "2026-07-26T08:00:00+08:00"; }],
    ["name number", repo => { repo.name = 42; }],
    ["name array", repo => { repo.name = []; }],
    ["name whitespace", repo => { repo.name = "   "; }],
    ["owner array", repo => { repo.owner = []; }],
    ["owner.login number", repo => { repo.owner.login = 42; }],
    ["owner.login object", repo => { repo.owner.login = {}; }],
    ["owner.login whitespace", repo => { repo.owner.login = "  "; }],
    ["html_url array", repo => { repo.html_url = []; }],
    ["html_url number", repo => { repo.html_url = 42; }],
    ["html_url non-GitHub", repo => { repo.html_url = "https://example.com/o/r"; }],
    ["html_url whitespace", repo => { repo.html_url = "  "; }],
    ["description object", repo => { repo.description = {}; }],
    ["description array", repo => { repo.description = []; }],
    ["language object", repo => { repo.language = {}; }],
    ["language array", repo => { repo.language = []; }],
    ["stars string", repo => { repo.stargazers_count = "0"; }],
    ["stars negative", repo => { repo.stargazers_count = -1; }],
    ["stars fractional", repo => { repo.stargazers_count = 1.5; }],
    ["stars NaN", repo => { repo.stargazers_count = Number.NaN; }],
    ["stars Infinity", repo => { repo.stargazers_count = Number.POSITIVE_INFINITY; }],
    ["topics object", repo => { repo.topics = {}; }],
    ["topics mixed", repo => { repo.topics = ["safe", 42]; }],
    ["homepage object", repo => { repo.homepage = {}; }],
    ["full_name object", repo => { repo.full_name = {}; }],
    ["full_name blank", repo => { repo.full_name = " "; }]
  ];

  assert.equal(hasCompleteSharedRepositoryData(valid), true);
  assert.equal(hasCompleteSharedRepositoryData(null), false, "null repo");
  assert.equal(hasCompleteSharedRepositoryData([]), false, "array repo");
  for (const [label, mutate] of invalidCases) {
    const repo = structuredClone(valid);
    mutate(repo);
    assert.equal(hasCompleteSharedRepositoryData(repo), false, label);
  }
});

test("GitHub Star DTO rejects loose timestamps, malformed wrappers, and ambiguous visibility", () => {
  const publicRepo = {
    name: "strict-star", full_name: "strict-owner/strict-star",
    owner: { login: "strict-owner" }, description: "strict DTO", language: "TypeScript",
    stargazers_count: 1, pushed_at: "2026-07-26T00:00:00Z",
    html_url: "https://github.com/strict-owner/strict-star", topics: [], homepage: null,
    private: false, visibility: "public", archived: false
  };
  const invalidStarredAt = [undefined, null, 0, "0", "July 26, 2026", "2026-02-30T00:00:00Z"];
  for (const starred_at of invalidStarredAt) {
    const starItem = { repo: structuredClone(publicRepo) };
    if (starred_at !== undefined) starItem.starred_at = starred_at;
    assert.throws(
      () => normalizeGithubStarItem(starItem, { mode: "incremental" }),
      error => error.code === "INVALID_RESPONSE",
      `incremental starred_at ${String(starred_at)}`
    );
  }

  for (const mutate of [
    item => { item.repo = []; },
    item => { delete item.repo.owner; },
    item => { delete item.repo.name; },
    item => { delete item.repo.html_url; },
    item => { delete item.repo.visibility; },
    item => { item.repo.visibility = "unknown"; },
    item => { item.repo.private = false; item.repo.visibility = "private"; },
    item => { item.repo.private = true; item.repo.visibility = "public"; }
  ]) {
    const starItem = { starred_at: "2026-07-26T12:00:00Z", repo: structuredClone(publicRepo) };
    mutate(starItem);
    assert.throws(
      () => normalizeGithubStarItem(starItem, { mode: "incremental" }),
      error => error.code === "INVALID_RESPONSE"
    );
  }

  assert.throws(
    () => normalizeGithubStarItem(structuredClone(publicRepo), { mode: "incremental" }),
    error => error.code === "INVALID_RESPONSE"
  );
  assert.equal(normalizeGithubStarItem(structuredClone(publicRepo), { mode: "full" }).starredAt, null);
  for (const starred_at of ["0", "July 26, 2026", "2026-02-30T00:00:00Z"]) {
    assert.throws(
      () => normalizeGithubStarItem({ starred_at, repo: structuredClone(publicRepo) }, { mode: "full" }),
      error => error.code === "INVALID_RESPONSE"
    );
  }
});

test("GitHub DTO clears unsafe optional homepages and bounds normalized topics", () => {
  const valid = {
    name: "safe-metadata", full_name: "safe-owner/safe-metadata",
    owner: { login: "safe-owner" }, description: null, language: null,
    stargazers_count: 0, pushed_at: null,
    html_url: "https://github.com/safe-owner/safe-metadata",
    topics: ["  security  ", "", "security"], homepage: "https://example.test/demo path",
    private: false, visibility: "public", archived: false
  };

  const normalized = normalizePublicGithubRepository(valid);
  assert.equal(normalized.homepage, "https://example.test/demo%20path");
  assert.deepEqual(normalized.topics, ["security"]);

  for (const homepage of [
    "javascript:alert(1)", "data:text/html,unsafe", "file:///tmp/unsafe",
    "/relative", "https://user:secret@example.test/path", "   ", null
  ]) {
    const repo = structuredClone(valid);
    repo.homepage = homepage;
    assert.equal(normalizePublicGithubRepository(repo).homepage, "", String(homepage));
  }

  for (const topics of [
    ["x".repeat(51)],
    Array.from({ length: 21 }, (_, index) => `topic-${index}`),
    ["safe", "bad\u0000topic"],
    ["safe", {}],
    ["safe", ["nested"]]
  ]) {
    const repo = structuredClone(valid);
    repo.topics = topics;
    assert.throws(
      () => normalizePublicGithubRepository(repo),
      error => error.code === "INVALID_RESPONSE"
    );
  }
});

test("GitHub repository identity and URL parsing reject mixed or ambiguous repositories", () => {
  const valid = {
    name: "Identity.Repo", full_name: "Identity-Owner/identity.repo",
    owner: { login: "identity-owner" }, description: null, language: null,
    stargazers_count: 0, pushed_at: "2026-07-26T12:34:56.123Z",
    html_url: "https://github.com/IDENTITY-OWNER/IDENTITY.REPO",
    topics: [], homepage: null, private: false, visibility: "public", archived: false
  };
  assert.equal(normalizePublicGithubRepository(valid).html_url, "https://github.com/identity-owner/Identity.Repo");

  for (const mutate of [
    repo => { repo.name = "other"; },
    repo => { repo.owner.login = "other-owner"; },
    repo => { repo.full_name = "identity-owner/other"; },
    repo => { repo.html_url = "https://github.com/identity-owner/other"; },
    repo => { repo.html_url = "http://github.com/identity-owner/Identity.Repo"; },
    repo => { repo.html_url = "https://github.com/identity-owner/Identity.Repo?token=secret"; },
    repo => { repo.html_url = "https://github.com/identity-owner/Identity.Repo#fragment"; },
    repo => { repo.html_url = "https://user:pass@github.com/identity-owner/Identity.Repo"; },
    repo => { repo.html_url = "https://github.com:444/identity-owner/Identity.Repo"; },
    repo => { repo.html_url = "https://github.com/identity-owner/Identity.Repo/extra"; }
  ]) {
    const repo = structuredClone(valid);
    mutate(repo);
    assert.throws(
      () => normalizePublicGithubRepository(repo),
      error => error.code === "INVALID_RESPONSE"
    );
  }

  for (const input of [
    "https://github.com/owner/repo?query=1",
    "https://github.com/owner/repo#fragment",
    "https://user:pass@github.com/owner/repo",
    "https://github.com:444/owner/repo",
    "https://github.com/owner/repo/extra",
    "https://github.com/./repo",
    "https://github.com/%2e%2e/repo",
    "https://github.com/owner\\repo",
    "owner/..",
    "owner/repo\u0000"
  ]) {
    assert.throws(() => parseGithubRepositoryUrl(input), error => error.code === "INVALID_REPOSITORY_FORMAT", input);
  }
});

test("repository visibility inspection requires a complete DTO for the requested identity", async () => {
  const originalFetch = globalThis.fetch;
  const previousServerToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "server-token-must-not-leak";
  const valid = {
    name: "Target.Repo",
    full_name: "Target-Owner/Target.Repo",
    owner: { login: "Target-Owner" },
    html_url: "https://github.com/Target-Owner/Target.Repo",
    archived: false,
    private: false,
    visibility: "public"
  };
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(new Headers(options?.headers).has("Authorization"), false);
      return Response.json(valid);
    };
    assert.deepEqual(await inspectRepositoryState("target-owner/target.repo"), {
      exists: true,
      archived: false,
      publicVisible: true
    });

    for (const mutate of [
      data => { delete data.full_name; },
      data => { delete data.html_url; },
      data => { data.owner.login = "other-owner"; },
      data => { data.full_name = "target-owner/other"; },
      data => { data.private = true; data.visibility = "public"; },
      data => { data.archived = "false"; }
    ]) {
      const malformed = structuredClone(valid);
      mutate(malformed);
      globalThis.fetch = async () => Response.json(malformed);
      await assert.rejects(
        inspectRepositoryState("target-owner/target.repo"),
        error => error.code === "INVALID_RESPONSE"
      );
    }

    globalThis.fetch = async () => Response.json({ ...valid, private: true, visibility: "internal" });
    assert.equal((await inspectRepositoryState("target-owner/target.repo")).publicVisible, false);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.deepEqual(await inspectRepositoryState("target-owner/target.repo"), {
      exists: false,
      archived: false,
      publicVisible: false
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousServerToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousServerToken;
  }
});

test("GitHub Star sync prevalidates every public repository before any project or overlay write", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const malformedCases = [
    ["name", repo => { delete repo.name; }],
    ["description", repo => { delete repo.description; }],
    ["language", repo => { delete repo.language; }],
    ["pushed_at", repo => { delete repo.pushed_at; }],
    ["stargazers_count", repo => { delete repo.stargazers_count; }],
    ["owner.login", repo => { repo.owner = {}; }],
    ["html_url", repo => { delete repo.html_url; }],
    ["negative stargazers_count", repo => { repo.stargazers_count = -1; }],
    ["pushed_at number", repo => { repo.pushed_at = 42; }],
    ["pushed_at array", repo => { repo.pushed_at = []; }],
    ["pushed_at object", repo => { repo.pushed_at = {}; }],
    ["pushed_at invalid date", repo => { repo.pushed_at = "invalid-date"; }],
    ["name number", repo => { repo.name = 42; }],
    ["name array", repo => { repo.name = []; }],
    ["name blank", repo => { repo.name = " "; }],
    ["owner.login number", repo => { repo.owner.login = 42; }],
    ["owner.login object", repo => { repo.owner.login = {}; }],
    ["owner.login blank", repo => { repo.owner.login = " "; }],
    ["html_url array", repo => { repo.html_url = []; }],
    ["html_url number", repo => { repo.html_url = 42; }],
    ["html_url non-GitHub", repo => { repo.html_url = "https://example.com/o/r"; }],
    ["html_url blank", repo => { repo.html_url = " "; }],
    ["description object", repo => { repo.description = {}; }],
    ["description array", repo => { repo.description = []; }],
    ["language object", repo => { repo.language = {}; }],
    ["language array", repo => { repo.language = []; }],
    ["stars string", repo => { repo.stargazers_count = "10"; }],
    ["stars fractional", repo => { repo.stargazers_count = 1.5; }],
    ["topics object", repo => { repo.topics = {}; }],
    ["topics mixed", repo => { repo.topics = ["safe", 42]; }],
    ["homepage object", repo => { repo.homepage = {}; }],
    ["full_name mismatch", repo => { repo.full_name = "other-owner/other-repo"; }],
    ["html_url identity mismatch", repo => { repo.html_url = "https://github.com/other-owner/other-repo"; }],
    ["missing private", repo => { delete repo.private; }],
    ["missing visibility", repo => { delete repo.visibility; }],
    ["unknown visibility", repo => { repo.visibility = "unknown"; }],
    ["public/private conflict", repo => { repo.visibility = "private"; }],
    ["private/public conflict", repo => { repo.private = true; }],
    ["repo is not an object", _repo => {}, starItem => { starItem.repo = []; }],
    ["invalid starred_at", _repo => {}, starItem => { starItem.starred_at = "invalid-date"; }]
  ];
  const originalFetch = globalThis.fetch;

  try {
    for (const [index, [invalidField, mutateRepo, mutateStarItem]] of malformedCases.entries()) {
      const testUser = await prisma.user.create({ data: { githubLogin: `malformed-${index}` } });
      const completeRepo = {
        name: `complete-${index}`,
        full_name: `validation-owner/complete-${index}`,
        owner: { login: "validation-owner" },
        description: "must not be partially persisted",
        language: "TypeScript",
        stargazers_count: 10,
        pushed_at: "2026-07-25T00:00:00Z",
        html_url: `https://github.com/validation-owner/complete-${index}`,
        topics: [], private: false, visibility: "public", archived: false
      };
      const malformedRepo = structuredClone({
        ...completeRepo,
        name: `malformed-${index}`,
        full_name: `validation-owner/malformed-${index}`,
        html_url: `https://github.com/validation-owner/malformed-${index}`
      });
      mutateRepo(malformedRepo);
      const malformedStarItem = { starred_at: "2026-07-25T12:00:00Z", repo: malformedRepo };
      mutateStarItem?.(malformedStarItem);
      globalThis.fetch = async url => {
        if (String(url).includes("/user/starred?")) {
          return jsonResponse([
            { starred_at: "2026-07-26T12:00:00Z", repo: completeRepo },
            malformedStarItem
          ]);
        }
        throw new Error(`unexpected side-effect request after malformed ${invalidField}: ${url}`);
      };

      await assert.rejects(
        syncUserStars({ id: String(testUser.id), dbUserId: testUser.id, accessToken: "mock-token" }),
        /incomplete/i,
        invalidField
      );
      assert.equal(await prisma.project.count(), 0, `${invalidField} caused a Project side effect`);
      assert.equal(await prisma.userProject.count(), 0, `${invalidField} caused an overlay side effect`);
      const run = await prisma.syncRun.findFirst({
        where: { userId: testUser.id }, orderBy: { id: "desc" }
      });
      assert.equal(run.status, "failed");
      assert.equal(run.errorCode, "SYNC_FAILED");
      assert.equal(run.errorSummary, "GitHub star sync failed.");
      assert.equal(JSON.stringify(run).includes(invalidField), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub Star sync accepts explicit nullable shared fields but not missing properties", async () => {
  const testUser = await prisma.user.create({ data: { githubLogin: "nullable-public" } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) {
      return jsonResponse([{
        starred_at: "2026-07-26T12:00:00Z",
        repo: {
          name: "nullable-repo", full_name: "nullable-owner/nullable-repo",
          owner: { login: "nullable-owner" }, description: null, language: null,
          stargazers_count: 0, pushed_at: null,
          html_url: "https://github.com/nullable-owner/nullable-repo",
          topics: [], private: false, visibility: "public", archived: false
        }
      }]);
    }
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return jsonResponse({ message: "not found" }, 404);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  let result;
  try {
    result = await syncUserStars({
      id: String(testUser.id), dbUserId: testUser.id, accessToken: "mock-token"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.status, "succeeded");
  const project = await prisma.project.findUnique({
    where: { github: "https://github.com/nullable-owner/nullable-repo" }
  });
  assert.equal(project.description, "");
  assert.equal(project.language, "Unknown");
  assert.equal(project.stars, 0);
  assert.match(project.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("manual GitHub import rejects private repositories before persistence", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/private-owner/private-repo")) {
      return Response.json({
        name: "private-repo",
        full_name: "private-owner/private-repo",
        owner: { login: "private-owner" },
        description: "must not persist",
        language: "Go",
        stargazers_count: 1,
        pushed_at: "2026-07-26T00:00:00Z",
        html_url: "https://github.com/private-owner/private-repo",
        topics: ["secret"],
        private: true,
        visibility: "private"
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };
  try {
    const response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ repo: "private-owner/private-repo" })
    });
    assert.ok(response.status >= 400 && response.status < 500);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
});

test("both manual repository routes share strict format and upstream DTO validation", async () => {
  const beforeProjects = await prisma.project.findMany({ orderBy: { id: "asc" } });
  const beforeOverlays = await prisma.userProject.findMany({ orderBy: { id: "asc" } });

  for (const [pathname, body] of [
    ["/api/projects", { github: "https://example.com/not-github/repo" }],
    ["/api/github/import-repo", { repo: "not-a-repository" }]
  ]) {
    const response = await api(pathname, {
      method: "POST", cookie: fixture.sessionA, body: JSON.stringify(body)
    });
    assert.equal(response.status, 400, pathname);
    assert.deepEqual(await response.json(), { message: "Invalid repository format. Use owner/repo." });
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/repos/typed-owner/typed-repo")) {
      return Response.json({
        name: "typed-repo", full_name: "typed-owner/typed-repo",
        owner: { login: "typed-owner" }, description: "invalid pushed_at type",
        language: "TypeScript", stargazers_count: 3, pushed_at: 42,
        html_url: "https://github.com/typed-owner/typed-repo", topics: [],
        private: false, visibility: "public", archived: false
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    for (const [pathname, body] of [
      ["/api/projects", { github: "typed-owner/typed-repo" }],
      ["/api/github/import-repo", { repo: "typed-owner/typed-repo" }]
    ]) {
      const response = await api(pathname, {
        method: "POST", cookie: fixture.sessionA, body: JSON.stringify(body)
      });
      assert.equal(response.status, 422, pathname);
      assert.deepEqual(await response.json(), {
        message: "GitHub repository response was incomplete or invalid."
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(await prisma.project.findMany({ orderBy: { id: "asc" } }), beforeProjects);
  assert.deepEqual(await prisma.userProject.findMany({ orderBy: { id: "asc" } }), beforeOverlays);
});

test("manual repository routes clear unsafe homepages and reject unsafe user demo or docs URLs", async () => {
  const github = "https://github.com/safe-owner/safe-homepage";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/repos/safe-owner/safe-homepage")) {
      return Response.json({
        name: "safe-homepage", full_name: "safe-owner/safe-homepage",
        owner: { login: "safe-owner" }, description: "safe metadata", language: "TypeScript",
        stargazers_count: 4, pushed_at: "2026-07-26T00:00:00Z", html_url: github,
        topics: [" security "], homepage: "javascript:alert(1)",
        private: false, visibility: "public", archived: false
      });
    }
    if (target.endsWith("/readme")) return new Response("", { status: 404 });
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    const importedResponse = await api("/api/github/import-repo", {
      method: "POST", cookie: fixture.sessionA,
      body: JSON.stringify({ repo: "safe-owner/safe-homepage", docs: "" })
    });
    assert.equal(importedResponse.status, 201);
    const imported = await importedResponse.json();
    assert.equal(imported.imported.homepage, "");
    assert.equal(imported.project.demo, "");
    assert.deepEqual(imported.project.tags, ["security"]);

    const before = await prisma.userProject.findUnique({
      where: { userId_projectId: { userId: fixture.userA.id, projectId: imported.project.id } }
    });
    for (const [pathname, body, field] of [
      ["/api/projects", { github, demo: "data:text/html,unsafe" }, "demo"],
      ["/api/github/import-repo", { repo: "safe-owner/safe-homepage", docs: "file:///tmp/unsafe" }, "docs"]
    ]) {
      const response = await api(pathname, {
        method: "POST", cookie: fixture.sessionA, body: JSON.stringify(body)
      });
      assert.equal(response.status, 400, pathname);
      assert.deepEqual(await response.json(), {
        message: `${field} must be empty or a valid HTTP(S) URL.`
      });
      assert.deepEqual(await prisma.userProject.findUnique({ where: { id: before.id } }), before);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("project PATCH normalizes valid external URLs and preserves explicit clearing", async () => {
  const setResponse = await api(`/api/projects/${fixture.project.id}`, {
    method: "PATCH", cookie: fixture.sessionA,
    body: JSON.stringify({ demo: " https://demo.example.test/demo path ", docs: "http://docs.example.test" })
  });
  assert.equal(setResponse.status, 200);
  const setProject = await setResponse.json();
  assert.equal(setProject.demo, "https://demo.example.test/demo%20path");
  assert.equal(setProject.docs, "http://docs.example.test/");

  const clearResponse = await api(`/api/projects/${fixture.project.id}`, {
    method: "PATCH", cookie: fixture.sessionA, body: JSON.stringify({ demo: "", docs: null })
  });
  assert.equal(clearResponse.status, 200);
  const cleared = await clearResponse.json();
  assert.equal(cleared.demo, "");
  assert.equal(cleared.docs, "");
});

test("manual GitHub import rejects repository data without both explicit public signals", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/repos/unknown-owner/unknown-visibility")) {
      return Response.json({
        name: "unknown-visibility",
        full_name: "unknown-owner/unknown-visibility",
        owner: { login: "unknown-owner" },
        html_url: "https://github.com/unknown-owner/unknown-visibility",
        private: false
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const response = await api("/api/github/import-repo", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ repo: "unknown-owner/unknown-visibility" })
    });
    assert.ok(response.status >= 400 && response.status < 500);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
});

test("network policy aborts timed out requests and clears retry behavior", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  try {
    await assert.rejects(
      requestJson("https://timeout.example.test", {}, {
        service: "test upstream",
        timeoutMs: 50,
        maxRetries: 0
      }),
      error => error.code === "REQUEST_TIMEOUT"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rate limiting stops sync and records one safe failed SyncRun", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "120", "X-RateLimit-Remaining": "0" }
    });
  };
  const accessToken = "secret-token-must-not-be-stored";
  try {
    await assert.rejects(syncUserStars({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id,
      accessToken
    }), error => error.code === "RATE_LIMITED" && error.retryAfterSeconds === 120);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 1);
  const run = await prisma.syncRun.findFirst({ orderBy: { id: "desc" } });
  assert.equal(run.status, "failed");
  assert.equal(run.errorCode, "RATE_LIMITED");
  assert.equal(run.errorSummary, "GitHub rate limit reached.");
  assert.equal(JSON.stringify(run).includes(accessToken), false);
  assert.equal(run.completedAt instanceof Date, true);
});

test("remote-status rate limits stop full sync without changing shared visibility or activity", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-06-01T00:00:00Z"),
      latestCommitAt: new Date("2026-06-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-06-03T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls += 1;
    if (String(url).includes("/user/starred?")) return Response.json([]);
    return new Response("limited", {
      status: 429,
      headers: { "Retry-After": "30" }
    });
  };
  try {
    await assert.rejects(syncUserStars({
      id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
    }), error => error.code === "RATE_LIMITED");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 2);
  assert.equal((await prisma.syncRun.findFirst({ orderBy: { id: "desc" } })).status, "failed");
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  assert.equal(project.latestReleaseAt.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(project.latestCommitAt.toISOString(), "2026-06-02T00:00:00.000Z");
  assert.equal(project.activityCheckedAt.toISOString(), "2026-06-03T00:00:00.000Z");
});

test("independent remote recheck preserves visibility before propagating a rate limit", async () => {
  await prisma.project.update({
    where: { id: fixture.project.id },
    data: {
      latestReleaseAt: new Date("2026-05-01T00:00:00Z"),
      latestCommitAt: new Date("2026-05-02T00:00:00Z"),
      activityCheckedAt: new Date("2026-05-03T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("limited", {
    status: 429,
    headers: { "Retry-After": "30" }
  });
  try {
    await assert.rejects(
      recheckRemoteStatusForUser({
        id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
      }, [fixture.project.id]),
      error => error.code === "RATE_LIMITED"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
  assert.equal(project.publicVisible, true);
  assert.equal(project.latestReleaseAt.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(project.latestCommitAt.toISOString(), "2026-05-02T00:00:00.000Z");
  assert.equal(project.activityCheckedAt.toISOString(), "2026-05-03T00:00:00.000Z");
});

test("manual and automatic sync entry points share the same database lease", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  let releaseFetch;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const releasePromise = new Promise(resolve => { releaseFetch = resolve; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    started();
    await releasePromise;
    return Response.json([]);
  };
  const user = {
    id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
  };

  try {
    const manual = syncUserStars(user, { mode: "full", source: "manual" });
    await startedPromise;
    assert.equal((await prisma.syncRun.findFirst({ orderBy: { id: "desc" } })).status, "running");
    await assert.rejects(
      syncUserStars(user, { mode: "full", source: "scheduler" }),
      error => error.statusCode === 409
    );
    await assert.rejects(
      recheckRemoteStatusForUser(user),
      error => error.statusCode === 409
    );
    releaseFetch();
    await manual;
  } finally {
    releaseFetch?.();
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 1);
});

test("expired GitHub sync owner cannot persist after a newer generation completes", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  let releaseStaleBody;
  let staleBodyReleased = false;
  let staleBodyStarted;
  const staleBodyStartedPromise = new Promise(resolve => { staleBodyStarted = resolve; });
  let starCalls = 0;
  const repository = (name, stars) => ({
    starred_at: "2026-07-26T12:00:00Z",
    repo: {
      name,
      full_name: `lease-owner/${name}`,
      owner: { login: "lease-owner" },
      description: `${name} description`,
      language: "TypeScript",
      stargazers_count: stars,
      pushed_at: "2026-07-26T00:00:00Z",
      html_url: `https://github.com/lease-owner/${name}`,
      topics: [],
      private: false,
      visibility: "public",
      archived: false
    }
  });

  globalThis.fetch = async url => {
    if (!String(url).includes("/user/starred?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    starCalls += 1;
    if (starCalls === 1) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          staleBodyStarted();
          releaseStaleBody = () => {
            if (staleBodyReleased) return;
            staleBodyReleased = true;
            controller.enqueue(encoder.encode(JSON.stringify([repository("stale-a", 1)])));
            controller.close();
          };
        }
      }), { headers: { "Content-Type": "application/json" } });
    }
    return Response.json([repository("winner-b", 2)]);
  };

  const user = {
    id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
  };
  let stale;
  try {
    stale = syncUserStars(user, { mode: "full", source: "manual" });
    await staleBodyStartedPromise;
    await prisma.operationLease.update({
      where: { key: `sync:${fixture.userA.id}` },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    await prisma.operationLease.update({
      where: { key: "shared-project-catalog" },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });

    const winner = await syncUserStars(user, { mode: "full", source: "scheduler" });
    assert.equal(winner.total, 1);
    releaseStaleBody();
    await assert.rejects(stale, error => error.code === "LEASE_LOST");
  } finally {
    releaseStaleBody?.();
    await stale?.catch(() => {});
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/lease-owner/stale-a" }
  }), 0);
  assert.equal(await prisma.userProject.count({
    where: { project: { github: "https://github.com/lease-owner/stale-a" } }
  }), 0);
  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/lease-owner/winner-b", stars: 2 }
  }), 1);
  const runs = await prisma.syncRun.findMany({ orderBy: { id: "asc" } });
  assert.equal(runs.filter(run => run.status === "succeeded").length, 1);
  assert.notEqual(runs[0].status, "succeeded");
});

test("Star sync rolls back shared Project when overlay persistence fails", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_synced_overlay_insert"
    BEFORE INSERT ON "UserProject"
    BEGIN
      SELECT RAISE(ABORT, 'injected overlay failure');
    END
  `);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes("/user/starred?")) {
      return Response.json([{
        starred_at: "2026-07-26T12:00:00Z",
        repo: {
          name: "atomic-sync",
          full_name: "owner/atomic-sync",
          owner: { login: "owner" },
          description: "must roll back",
          language: "JS",
          stargazers_count: 1,
          pushed_at: "2026-07-26T00:00:00Z",
          html_url: "https://github.com/owner/atomic-sync",
          topics: [],
          private: false,
          visibility: "public",
          archived: false
        }
      }]);
    }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    await assert.rejects(syncUserStars({
      id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
    }));
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_synced_overlay_insert"');
  }
  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
  assert.equal((await prisma.syncRun.findFirst({ orderBy: { id: "desc" } })).status, "failed");
});

test("activity refresh observes the configured small concurrency limit", async () => {
  await prisma.userProject.deleteMany();
  await prisma.project.deleteMany();
  const originalFetch = globalThis.fetch;
  const previousConcurrency = process.env.ACTIVITY_FETCH_CONCURRENCY;
  process.env.ACTIVITY_FETCH_CONCURRENCY = "2";
  let active = 0;
  let maxActive = 0;
  const repos = Array.from({ length: 5 }, (_, index) => ({
    starred_at: `2026-07-2${index}T12:00:00Z`,
    repo: {
      name: `repo-${index}`,
      full_name: `owner/repo-${index}`,
      owner: { login: "owner" },
      description: "public",
      language: "JS",
      stargazers_count: index,
      pushed_at: "2026-07-20T00:00:00Z",
      html_url: `https://github.com/owner/repo-${index}`,
      topics: [],
      private: false,
      visibility: "public",
      archived: false
    }
  }));
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json(repos);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return target.includes("/releases/latest")
        ? new Response("", { status: 404 })
        : Response.json([]);
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    const result = await syncUserStars({
      id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token"
    });
    assert.equal(result.total, repos.length);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousConcurrency === undefined) delete process.env.ACTIVITY_FETCH_CONCURRENCY;
    else process.env.ACTIVITY_FETCH_CONCURRENCY = previousConcurrency;
  }
  assert.ok(maxActive <= 2, `observed ${maxActive} concurrent activity requests`);
});

test("rule reclassification updates only user A", async () => {
  await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
    data: { category: "A before rule", categorySource: "rule", categoryReason: "rule:old" }
  });
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });
  const userBBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  });

  const result = await rerunRuleClassificationForUser({
    id: String(fixture.userA.id),
    dbUserId: fixture.userA.id
  });
  const userAAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });

  assert.equal(result.updated, 1);
  assert.notEqual(userAAfter.category, "A before rule");
  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), projectBefore);
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  }), userBBefore);
});

test("rule reclassification does not overwrite a manual edit made after its snapshot", async () => {
  await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
    data: { category: "Rule snapshot", categorySource: "rule", categoryReason: "rule:old" }
  });
  const userProjectAdapter = new Proxy(prisma.userProject, {
    get(target, property) {
      if (property === "findMany") {
        return async args => {
          const records = await target.findMany(args);
          await prisma.userProject.update({
            where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
            data: {
              category: "Human edit after rule snapshot",
              categorySource: "manual",
              categoryReason: "manual:concurrent-rule-edit"
            }
          });
          return records;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const adapter = new Proxy(prisma, {
    get(target, property) {
      if (property === "userProject") return userProjectAdapter;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  let result;
  setPrismaAdapterForTests(adapter);
  try {
    result = await rerunRuleClassificationForUser({
      id: String(fixture.userA.id),
      dbUserId: fixture.userA.id
    });
  } finally {
    resetPrismaAdapterForTests();
  }

  const after = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.items[0].conflicted, true);
  assert.equal(after.category, "Human edit after rule snapshot");
  assert.equal(after.categorySource, "manual");
  assert.equal(after.categoryReason, "manual:concurrent-rule-edit");
});

test("rule reclassification rejects a classification ABA after its overlay snapshot", async () => {
  const original = await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
    data: { category: "Rule ABA", categorySource: "rule", categoryReason: "rule:aba" }
  });
  const userProjectAdapter = new Proxy(prisma.userProject, {
    get(target, property) {
      if (property === "findMany") {
        return async args => {
          const records = await target.findMany(args);
          await target.update({
            where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
            data: { category: "Human intermediate", categorySource: "manual", categoryReason: "manual:away" }
          });
          await target.update({
            where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
            data: {
              category: original.category,
              categorySource: original.categorySource,
              categoryReason: original.categoryReason,
              updatedAt: new Date(original.updatedAt.getTime() + 2_000)
            }
          });
          return records;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const adapter = new Proxy(prisma, {
    get(target, property) {
      if (property === "userProject") return userProjectAdapter;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  let result;
  setPrismaAdapterForTests(adapter);
  try {
    result = await rerunRuleClassificationForUser({ id: String(fixture.userA.id), dbUserId: fixture.userA.id });
  } finally {
    resetPrismaAdapterForTests();
  }

  const after = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(result.updated, 0);
  assert.equal(result.items[0].conflicted, true);
  assert.equal(after.category, original.category);
  assert.equal(after.categorySource, original.categorySource);
  assert.equal(after.categoryReason, original.categoryReason);
});

test("non-force AI classification never changes a manual category when AI metadata is empty", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const item = await getUserProjectByProjectId(user, 1);
  const before = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({
      status: "completed",
      output_text: JSON.stringify({
        category: "AI / LLM 应用",
        confidence: 0.91,
        reason: "must not be used"
      })
    });
  };

  try {
    const result = await classifyProjectsWithAi([item], { user, limit: 1 });
    assert.equal(result.processed, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls, 0);
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  }), before);
});

test("AI classification does not overwrite a manual edit made while the request is in flight", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const item = await getUserProjectByProjectId(user, 1);
  const originalFetch = globalThis.fetch;
  let signalStarted;
  let releaseFetch;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const release = new Promise(resolve => { releaseFetch = resolve; });
  globalThis.fetch = async () => {
    signalStarted();
    await release;
    return jsonResponse({
      status: "completed",
      output_text: JSON.stringify({
        category: "AI / LLM 应用",
        confidence: 0.91,
        reason: "stale classification"
      })
    });
  };

  let result;
  try {
    const classification = classifyProjectsWithAi([item], { user, force: true, limit: 1 });
    await started;
    await prisma.userProject.update({
      where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
      data: {
        category: "Human edit during AI request",
        categorySource: "manual",
        categoryReason: "manual:concurrent-edit"
      }
    });
    releaseFetch();
    result = await classification;
  } finally {
    releaseFetch?.();
    globalThis.fetch = originalFetch;
  }

  const after = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(result.processed, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.items[0].conflicted, true);
  assert.equal(after.category, "Human edit during AI request");
  assert.equal(after.categorySource, "manual");
  assert.equal(after.categoryReason, "manual:concurrent-edit");
  assert.equal(after.aiCategory, null);
  assert.equal(after.aiConfidence, null);
  assert.equal(after.aiReason, "");
  assert.equal(after.aiModel, "");
  assert.equal(after.aiClassifiedAt, null);
});

test("AI classification rejects away-and-back, same-value edits, and delete-recreate ABA", async t => {
  const scenarios = [
    ["away and back", async before => {
      await prisma.userProject.update({
        where: { id: before.id },
        data: { category: "Intermediate", categorySource: "manual", categoryReason: "manual:away" }
      });
      await prisma.userProject.update({
        where: { id: before.id },
        data: {
          category: before.category,
          categorySource: before.categorySource,
          categoryReason: before.categoryReason,
          updatedAt: new Date(before.updatedAt.getTime() + 2_000)
        }
      });
    }],
    ["same-value manual update", async before => {
      await prisma.userProject.update({
        where: { id: before.id },
        data: { note: "same classification, newer intent", updatedAt: new Date(before.updatedAt.getTime() + 2_000) }
      });
    }],
    ["delete and recreate", async before => {
      await prisma.userProject.delete({ where: { id: before.id } });
      await prisma.userProject.create({
        data: {
          ...privateUserProjectData(fixture.userA.id, 1, "A"),
          category: before.category,
          categorySource: before.categorySource,
          categoryReason: before.categoryReason,
          aiCategory: "new-overlay-sentinel",
          aiConfidence: 0.25,
          aiReason: "must remain",
          aiModel: "manual-model"
        }
      });
    }]
  ];

  for (const [name, mutate] of scenarios) {
    await t.test(name, async () => {
      await resetDatabase();
      const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
      const item = await getUserProjectByProjectId(user, 1);
      const before = await prisma.userProject.findUnique({
        where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
      });
      const originalFetch = globalThis.fetch;
      let signalStarted;
      let releaseFetch;
      const started = new Promise(resolve => { signalStarted = resolve; });
      const release = new Promise(resolve => { releaseFetch = resolve; });
      globalThis.fetch = async () => {
        signalStarted();
        await release;
        return jsonResponse({
          status: "completed",
          output_text: JSON.stringify({ category: "AI / LLM 应用", confidence: 0.99, reason: "stale" })
        });
      };

      let result;
      try {
        const classification = classifyProjectsWithAi([item], { user, force: true, limit: 1 });
        await started;
        await mutate(before);
        releaseFetch();
        result = await classification;
      } finally {
        releaseFetch?.();
        globalThis.fetch = originalFetch;
      }

      const after = await prisma.userProject.findUnique({
        where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
      });
      assert.equal(result.updated, 0);
      assert.equal(result.skipped, 1);
      assert.equal(result.items[0].conflicted, true);
      assert.equal(after.category, before.category);
      assert.equal(after.categorySource, before.categorySource);
      assert.equal(after.categoryReason, before.categoryReason);
      if (name === "delete and recreate") {
        assert.notEqual(after.id, before.id);
        assert.equal(after.aiCategory, "new-overlay-sentinel");
        assert.equal(after.aiConfidence, 0.25);
        assert.equal(after.aiReason, "must remain");
        assert.equal(after.aiModel, "manual-model");
      } else {
        assert.equal(after.aiCategory, before.aiCategory);
        assert.equal(after.aiConfidence, before.aiConfidence);
        assert.equal(after.aiReason, before.aiReason);
        assert.equal(after.aiModel, before.aiModel);
        assert.equal(after.aiClassifiedAt?.getTime() ?? null, before.aiClassifiedAt?.getTime() ?? null);
      }
    });
  }
});

test("AI classification stores result and metadata only on user A", async () => {
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });
  const userBBefore = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  });
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const item = await getUserProjectByProjectId(user, 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /\/responses$/);
    return jsonResponse({
      status: "completed",
      output_text: JSON.stringify({
        category: "AI / LLM 应用",
        confidence: 0.91,
        reason: "Mocked classification result"
      })
    });
  };

  try {
    const result = await classifyProjectsWithAi([item], { user, force: true, limit: 1 });
    assert.equal(result.updated, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const userAAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  assert.equal(userAAfter.category, "AI / LLM 应用");
  assert.equal(userAAfter.categorySource, "ai");
  assert.equal(userAAfter.aiCategory, "AI / LLM 应用");
  assert.equal(userAAfter.aiConfidence, 0.91);
  assert.equal(userAAfter.aiModel, "gpt-4o-mini");
  assert.ok(userAAfter.aiClassifiedAt instanceof Date);
  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), projectBefore);
  assert.deepEqual(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  }), userBBefore);
});

test("AI item failures use a fixed summary instead of internal model or database details", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const item = await getUserProjectByProjectId(user, 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    status: "completed",
    output_text: "SQL path=C:\\private\\ai.db token=ai-secret"
  });

  let result;
  try {
    result = await classifyProjectsWithAi([item], { user, force: true, limit: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.updated, 0);
  assert.equal(result.items[0].error, "AI classification failed.");
  assert.doesNotMatch(JSON.stringify(result), /private|ai\.db|ai-secret|SQL/i);
});

test("AI persistence failure aborts the run, stops later model calls, and does not create cooldown", async () => {
  const secondProject = await prisma.project.create({
    data: {
      name: "second-ai-repo", author: "ai-owner", category: "未分类", categorySource: "rule",
      status: "saved", language: "JavaScript", stars: 2, updatedAt: "2026-07-27",
      recommended: false, description: "second", features: "[]", tags: "[]",
      github: "https://github.com/ai-owner/second-ai-repo", demo: "", docs: "", note: "",
      publicVisible: true, visibilityVerifiedAt: new Date()
    }
  });
  await prisma.userProject.create({
    data: {
      userId: fixture.userA.id, projectId: secondProject.id, category: "未分类",
      categorySource: "rule", categoryReason: "rule:default", status: "saved",
      recommended: false, note: "", demo: "", docs: "", tags: "[]", features: "[]"
    }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_ai_persistence"
    BEFORE UPDATE OF "aiCategory" ON "UserProject"
    BEGIN
      SELECT RAISE(ABORT, 'SQL table UserProject path=C:\\private\\ai.db token=db-secret');
    END;
  `);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({
      status: "completed",
      output_text: JSON.stringify({ category: "AI / LLM 应用", confidence: 0.8, reason: "valid" })
    });
  };
  const syncRunsBefore = await prisma.syncRun.count();
  let response;
  try {
    response = await api("/api/sync/ai-classify", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ force: true, limit: 2 })
    });
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_ai_persistence"');
  }

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { error: "Internal server error." });
  assert.doesNotMatch(JSON.stringify(body), /UserProject|private|ai\.db|db-secret|SQL/i);
  assert.equal(calls, 1);
  assert.equal(await prisma.syncRun.count(), syncRunsBefore);
  const lease = await prisma.operationLease.findUnique({ where: { key: `classification:${fixture.userA.id}` } });
  assert.equal(lease.cooldownUntil, null);
});

test("AI classification enforces per-user lease, configured cap, cooldown, and strict force", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id };
  const item = await getUserProjectByProjectId(user, 1);
  const originalFetch = globalThis.fetch;
  const previousMax = process.env.AI_CLASSIFICATION_MAX_PER_RUN;
  const previousCooldown = process.env.AI_CLASSIFICATION_COOLDOWN_SECONDS;
  const previousModel = process.env.OPENAI_MODEL;
  const previousBase = process.env.OPENAI_API_BASE_URL;
  process.env.AI_CLASSIFICATION_MAX_PER_RUN = "1";
  process.env.AI_CLASSIFICATION_COOLDOWN_SECONDS = "60";
  process.env.OPENAI_MODEL = "env-model";
  process.env.OPENAI_API_BASE_URL = "https://env-openai.example.test/v1";
  let releaseFetch;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const releasePromise = new Promise(resolve => { releaseFetch = resolve; });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(String(url), "https://env-openai.example.test/v1/responses");
    assert.equal(JSON.parse(options.body).model, "env-model");
    started();
    await releasePromise;
    return Response.json({
      status: "completed",
      output_text: JSON.stringify({
        category: "AI / LLM 应用", confidence: 0.8, reason: "bounded"
      })
    });
  };

  try {
    await assert.rejects(
      classifyProjectsWithAi([item], { user, force: "false", limit: 1 }),
      /force must be a boolean/
    );
    const first = classifyProjectsWithAi([item, item], { user, force: true, limit: 10 });
    await startedPromise;
    await assert.rejects(
      classifyProjectsWithAi([item], { user, force: true, limit: 1 }),
      error => error.statusCode === 409
    );
    await assert.rejects(
      rerunRuleClassificationForUser(user),
      error => error.statusCode === 409
    );
    releaseFetch();
    const result = await first;
    assert.equal(result.processed, 1);
    assert.equal(result.model, "env-model");
    await assert.rejects(
      classifyProjectsWithAi([item], { user, force: true, limit: 1 }),
      error => error.statusCode === 429 && error.code === "LEASE_COOLDOWN"
    );
  } finally {
    releaseFetch?.();
    globalThis.fetch = originalFetch;
    if (previousMax === undefined) delete process.env.AI_CLASSIFICATION_MAX_PER_RUN;
    else process.env.AI_CLASSIFICATION_MAX_PER_RUN = previousMax;
    if (previousCooldown === undefined) delete process.env.AI_CLASSIFICATION_COOLDOWN_SECONDS;
    else process.env.AI_CLASSIFICATION_COOLDOWN_SECONDS = previousCooldown;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
    if (previousBase === undefined) delete process.env.OPENAI_API_BASE_URL;
    else process.env.OPENAI_API_BASE_URL = previousBase;
  }
  assert.equal(calls, 1);
});

test("AI README rate limits stop classification before the OpenAI request", async () => {
  const user = { id: String(fixture.userA.id), dbUserId: fixture.userA.id, accessToken: "mock-token" };
  const item = await getUserProjectByProjectId(user, 1);
  const originalFetch = globalThis.fetch;
  const previousReadme = process.env.AI_CLASSIFICATION_INCLUDE_README;
  process.env.AI_CLASSIFICATION_INCLUDE_README = "true";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("limited", { status: 429, headers: { "Retry-After": "20" } });
  };
  try {
    await assert.rejects(
      classifyProjectsWithAi([item], { user, force: true, limit: 1 }),
      error => error.code === "RATE_LIMITED"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousReadme === undefined) delete process.env.AI_CLASSIFICATION_INCLUDE_README;
    else process.env.AI_CLASSIFICATION_INCLUDE_README = previousReadme;
  }
  assert.equal(calls, 1);
});

test("category rename is tenant-scoped and leaves Project unchanged", async () => {
  await prisma.managedCategory.createMany({
    data: [
      { userId: fixture.userA.id, name: "Shared category" },
      { userId: fixture.userB.id, name: "Shared category" }
    ]
  });
  await prisma.userProject.updateMany({ data: { category: "Shared category" } });
  const projectBefore = await prisma.project.findUnique({ where: { id: 1 } });

  await renameManagedCategory(fixture.userA.id, "Shared category", "A category renamed");

  assert.equal(await prisma.managedCategory.count({
    where: { userId: fixture.userA.id, name: "A category renamed" }
  }), 1);
  assert.equal(await prisma.managedCategory.count({
    where: { userId: fixture.userB.id, name: "Shared category" }
  }), 1);
  assert.equal((await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  })).category, "A category renamed");
  assert.equal((await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  })).category, "Shared category");
  assert.deepEqual(await prisma.project.findUnique({ where: { id: 1 } }), projectBefore);
});

test("category service rejects invalid user ids and blank names", async () => {
  await assert.rejects(createManagedCategory(0, "valid"), /positive userId/);
  await assert.rejects(createManagedCategory(fixture.userA.id, "   "), /required/);
  await assert.rejects(renameManagedCategory(fixture.userA.id, "", "new"), /required/);
  await assert.rejects(deleteManagedCategory(fixture.userA.id, "\t"), /required/);
});

test("category routes sanitize unknown persistence errors and remain healthy", async () => {
  const secret = "ManagedCategory SQL path=C:\\secret token=category-secret";
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_managed_category_insert"
    BEFORE INSERT ON "ManagedCategory"
    BEGIN
      SELECT RAISE(ABORT, '${secret.replaceAll("'", "''")}');
    END
  `);

  let response;
  try {
    response = await api("/api/categories/managed", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ name: "Must fail safely" })
    });
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_managed_category_insert"');
  }

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.equal((await api("/api/health")).status, 200);
});

test("auto-sync config validates input and partial updates preserve scheduling", async () => {
  const enabled = await updateAutoSyncConfig(fixture.userA.id, {
    enabled: true,
    mode: "incremental",
    intervalHours: 12
  });
  assert.ok(enabled.nextScheduledAt instanceof Date);

  const modeOnly = await updateAutoSyncConfig(fixture.userA.id, { mode: "full" });
  assert.equal(modeOnly.mode, "full");
  assert.equal(modeOnly.nextScheduledAt.getTime(), enabled.nextScheduledAt.getTime());

  await assert.rejects(updateAutoSyncConfig(fixture.userA.id, { enabled: "false" }), /boolean/);
  await assert.rejects(updateAutoSyncConfig(fixture.userA.id, { mode: "other" }), /mode/);
  await assert.rejects(updateAutoSyncConfig(fixture.userA.id, { intervalHours: 0 }), /intervalHours/);
  await assert.rejects(updateAutoSyncConfig(fixture.userA.id, { intervalHours: 1.5 }), /intervalHours/);
});

test("sync routes reject forged public error properties on ordinary errors", async () => {
  const secret = "forged sync SQL path=C:\\private token=sync-secret";
  const forged = Object.assign(new Error(secret), {
    statusCode: 429,
    code: "LEASE_COOLDOWN",
    rateLimited: true,
    retryAfterSeconds: 42
  });
  const userProjectAdapter = new Proxy(prisma.userProject, {
    get(target, property) {
      if (property === "findMany") return async () => { throw forged; };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const adapter = new Proxy(prisma, {
    get(target, property) {
      if (property === "userProject") return userProjectAdapter;
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  let response;
  setPrismaAdapterForTests(adapter);
  try {
    response = await api("/api/sync/ai-classify", {
      method: "POST",
      cookie: fixture.sessionA,
      body: JSON.stringify({ force: true, limit: 1 })
    });
  } finally {
    resetPrismaAdapterForTests();
  }

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("retry-after"), null);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
  assert.equal((await api("/api/health")).status, 200);
});

test("stale scheduler completion cannot overwrite disable or interval changes", async () => {
  const first = await updateAutoSyncConfig(fixture.userA.id, {
    enabled: true, intervalHours: 12, mode: "full"
  });
  await updateAutoSyncConfig(fixture.userA.id, { enabled: false });
  assert.equal(await finalizeScheduledRun(first), false);
  assert.equal((await prisma.autoSyncConfig.findUnique({
    where: { userId: fixture.userA.id }
  })).nextScheduledAt, null);

  const enabled = await updateAutoSyncConfig(fixture.userA.id, {
    enabled: true, intervalHours: 12
  });
  await new Promise(resolve => setTimeout(resolve, 2));
  const changed = await updateAutoSyncConfig(fixture.userA.id, { intervalHours: 48 });
  const expectedNext = changed.nextScheduledAt.getTime();
  assert.equal(await finalizeScheduledRun(enabled), false);
  const after = await prisma.autoSyncConfig.findUnique({ where: { userId: fixture.userA.id } });
  assert.equal(after.intervalHours, 48);
  assert.equal(after.nextScheduledAt.getTime(), expectedNext);
});

test("scheduler isolates a corrupt user token and continues later due users across ticks", async () => {
  assert.ok(fixture.userA.id < fixture.userB.id, "corrupt user must sort before the healthy user");
  const corruptToken = "v1.invalid.invalid.invalid-ciphertext";
  await prisma.githubAccount.createMany({
    data: [
      {
        githubUserId: "scheduler-a",
        login: fixture.userA.githubLogin,
        accessToken: corruptToken,
        scope: "repo",
        userId: fixture.userA.id
      },
      {
        githubUserId: "scheduler-b",
        login: fixture.userB.githubLogin,
        accessToken: encryptGithubToken("scheduler-user-b-token"),
        scope: "repo",
        userId: fixture.userB.id
      }
    ]
  });
  const dueAt = new Date(Date.now() - 60_000);
  await prisma.autoSyncConfig.createMany({
    data: [
      { userId: fixture.userA.id, enabled: true, mode: "incremental", intervalHours: 1, nextScheduledAt: dueAt },
      { userId: fixture.userB.id, enabled: true, mode: "incremental", intervalHours: 1, nextScheduledAt: dueAt }
    ]
  });

  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const schedulerErrors = [];
  let userBStarFetches = 0;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers?.Authorization, "Bearer scheduler-user-b-token");
    if (String(url).includes("/user/starred?")) {
      userBStarFetches += 1;
      return Response.json([]);
    }
    return Response.json({ message: "not found" }, { status: 404 });
  };
  console.error = (...args) => schedulerErrors.push(args.map(String).join(" "));

  async function waitForTick(expectedStarFetches, scheduledAfter) {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const configs = await prisma.autoSyncConfig.findMany({ orderBy: { userId: "asc" } });
      if (userBStarFetches >= expectedStarFetches &&
          configs.length === 2 &&
          configs.every(config => config.nextScheduledAt > scheduledAfter)) {
        return configs;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`scheduler tick did not finish; B fetches=${userBStarFetches}`);
  }

  try {
    startScheduler();
    const firstConfigs = await waitForTick(1, dueAt);
    stopScheduler();

    assert.ok(firstConfigs.every(config => config.nextScheduledAt > dueAt));

    const secondDueAt = new Date(Date.now() - 30_000);
    await prisma.autoSyncConfig.updateMany({
      data: { nextScheduledAt: secondDueAt }
    });
    startScheduler();
    await waitForTick(2, secondDueAt);
  } finally {
    stopScheduler();
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  assert.ok(schedulerErrors.length >= 1);
  assert.doesNotMatch(schedulerErrors.join("\n"), /invalid-ciphertext|scheduler-user-b-token/);
});

test("database lease admits one instance, rejects competitors, and permits expired takeover", async () => {
  const options = {
    key: `sync:${fixture.userA.id}`,
    userId: fixture.userA.id,
    kind: "sync",
    ttlSeconds: 30
  };
  const claims = await Promise.allSettled([
    claimOperationLease(options),
    claimOperationLease(options)
  ]);
  assert.equal(claims.filter(item => item.status === "fulfilled").length, 1);
  const rejected = claims.find(item => item.status === "rejected");
  assert.equal(rejected.reason.statusCode, 409);

  const winner = claims.find(item => item.status === "fulfilled").value;
  assert.equal(await releaseOperationLease({ ...winner, owner: "wrong-owner" }), false);
  await prisma.operationLease.update({
    where: { key: options.key },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  const takeover = await claimOperationLease(options);
  assert.notEqual(takeover.owner, winner.owner);
  assert.equal(await releaseOperationLease(takeover), true);
});

test("lease generations increase monotonically and an old generation cannot write", async () => {
  const options = {
    key: `sync:${fixture.userA.id}`,
    userId: fixture.userA.id,
    kind: "sync",
    ttlSeconds: 30
  };
  const first = await claimOperationLease(options);
  await prisma.operationLease.update({
    where: { key: options.key },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  const second = await claimOperationLease(options);
  assert.ok(second.generation > first.generation);

  const abaHandle = { ...first, owner: second.owner };
  await assert.rejects(
    withOperationLeaseTransaction(abaHandle, tx => tx.project.create({
      data: {
        name: "old-generation", author: "owner", category: "x", status: "x",
        language: "JS", stars: 0, updatedAt: "2026-01-01", description: "",
        features: "[]", tags: "[]", github: "https://github.com/owner/old-generation",
        demo: "", docs: "", note: ""
      }
    })),
    error => error.code === "LEASE_LOST"
  );
  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/owner/old-generation" }
  }), 0);
  assert.equal(await releaseOperationLease(abaHandle), false);
  assert.equal(await releaseOperationLease(second), true);
});

test("lease heartbeat loss aborts stale work before it can write", async () => {
  const key = `sync:${fixture.userA.id}`;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const work = withOperationLease({
    key,
    userId: fixture.userA.id,
    kind: "sync",
    ttlSeconds: 1
  }, async (_lease, signal) => {
    started();
    await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
    signal.throwIfAborted();
    await prisma.project.create({
      data: {
        name: "stale-write", author: "owner", category: "x", status: "x",
        language: "JS", stars: 0, updatedAt: "2026-01-01", description: "",
        features: "[]", tags: "[]", github: "https://github.com/owner/stale-write",
        demo: "", docs: "", note: ""
      }
    });
  });
  await startedPromise;
  await prisma.operationLease.update({ where: { key }, data: { owner: "new-owner" } });
  await assert.rejects(work, error => error.code === "LEASE_LOST");
  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/owner/stale-write" }
  }), 0);
});

test("category delete is tenant-scoped and rolls back completely on failure", async () => {
  await prisma.managedCategory.createMany({
    data: [
      { userId: fixture.userA.id, name: "Delete me" },
      { userId: fixture.userB.id, name: "Delete me" }
    ]
  });
  await prisma.userProject.updateMany({ data: { category: "Delete me" } });

  await deleteManagedCategory(fixture.userA.id, "Delete me");
  const userAAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  });
  const userBAfter = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userB.id, projectId: 1 } }
  });
  assert.equal(userAAfter.category, "未分类 / 待整理");
  assert.equal(userAAfter.categorySource, "uncategorized");
  assert.equal(userAAfter.categoryReason, "uncategorized:category-deleted");
  assert.equal(userBAfter.category, "Delete me");
  assert.equal(await prisma.managedCategory.count({
    where: { userId: fixture.userB.id, name: "Delete me" }
  }), 1);

  await prisma.managedCategory.create({ data: { userId: fixture.userA.id, name: "Rollback me" } });
  await prisma.userProject.update({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } },
    data: { category: "Rollback me" }
  });
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_user_project_category_update"
    BEFORE UPDATE OF "category" ON "UserProject"
    WHEN OLD."category" = 'Rollback me'
    BEGIN
      SELECT RAISE(ABORT, 'injected category update failure');
    END
  `);

  try {
    await assert.rejects(deleteManagedCategory(fixture.userA.id, "Rollback me"));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_user_project_category_update"');
  }

  assert.equal(await prisma.managedCategory.count({
    where: { userId: fixture.userA.id, name: "Rollback me" }
  }), 1);
  assert.equal((await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: fixture.userA.id, projectId: 1 } }
  })).category, "Rollback me");
});
