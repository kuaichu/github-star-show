import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { after, beforeEach, test } from "node:test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "github-star-show-sync-reliability-"));
const databasePath = path.join(tempDirectory, "test.db").replaceAll("\\", "/");

process.env.DATABASE_URL = `file:${databasePath}`;
process.env.NODE_ENV = "test";
process.env.GITHUB_API_BASE_URL = "https://github.invalid.test";

new DatabaseSync(databasePath).close();

const deployed = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: backendRoot,
  env: process.env,
  encoding: "utf8",
  timeout: 60_000
});
assert.equal(deployed.status, 0, [deployed.stdout, deployed.stderr].filter(Boolean).join("\n"));

const { PrismaClient } = await import("@prisma/client");
const { getPrisma } = await import("../src/lib/prisma.js");
const { getSyncStatusForUser } = await import("../src/services/syncStatusService.js");
const { recheckRemoteStatusForUser, syncUserStars } = await import("../src/services/syncService.js");
const {
  claimOperationLease,
  releaseOperationLease,
  withOperationLease
} = await import("../src/services/operationLeaseService.js");

const prisma = new PrismaClient();
let user;

function starredRepository(name = "activity-repo") {
  return {
    starred_at: "2026-07-26T12:00:00Z",
    repo: {
      name,
      full_name: `activity-owner/${name}`,
      owner: { login: "activity-owner" },
      description: "activity reliability fixture",
      language: "JavaScript",
      stargazers_count: 7,
      pushed_at: "2026-07-25T00:00:00Z",
      html_url: `https://github.com/activity-owner/${name}`,
      topics: [],
      private: false,
      visibility: "public",
      archived: false
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

async function resetDatabase() {
  await prisma.operationLease.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.userProject.deleteMany();
  await prisma.autoSyncConfig.deleteMany();
  await prisma.managedCategory.deleteMany();
  await prisma.githubAccount.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  user = await prisma.user.create({ data: { githubLogin: "sync-reliability" } });
}

async function createRemoteStatusFixture(name) {
  const project = await prisma.project.create({
    data: {
      name, author: "remote-owner", category: "legacy", categorySource: "rule",
      status: "legacy", language: "JavaScript", stars: 1, updatedAt: "2020-01-01",
      description: "remote status fixture", features: "[]", tags: "[]",
      github: `https://github.com/remote-owner/${name}`, demo: "", docs: "", note: "",
      publicVisible: true, visibilityVerifiedAt: new Date("2026-01-01T00:00:00Z")
    }
  });
  const overlay = await prisma.userProject.create({
    data: {
      userId: user.id, projectId: project.id, category: "Original category", categorySource: "manual",
      categoryReason: "manual:original", status: "Original status", recommended: true,
      note: "Original note", demo: "https://original.example/demo", docs: "https://original.example/docs",
      tags: JSON.stringify(["original-tag"]), features: JSON.stringify(["original-feature"]),
      remoteStatus: "active", remoteStatusNote: "", lastSyncedAt: new Date("2026-01-01T00:00:00Z")
    }
  });
  const otherUser = await prisma.user.create({ data: { githubLogin: `other-${name}` } });
  const otherOverlay = await prisma.userProject.create({
    data: {
      userId: otherUser.id, projectId: project.id, category: "Other category", categorySource: "manual",
      categoryReason: "manual:other", status: "Other status", recommended: false,
      note: "Other note", demo: "", docs: "", tags: "[]", features: "[]",
      remoteStatus: "active", remoteStatusNote: "Other untouched remote state"
    }
  });
  return { project, overlay, otherUser, otherOverlay };
}

beforeEach(resetDatabase);

after(async () => {
  await prisma.$disconnect();
  await getPrisma()?.$disconnect();
  await rm(tempDirectory, { recursive: true, force: true });
});

test("Star sync rejects a non-array page before any Project or UserProject write", async () => {
  for (const [label, payload] of [
    ["empty object", {}],
    ["null", null],
    ["string", "not-an-array"],
    ["ordinary object", { items: [] }]
  ]) {
    await resetDatabase();
    const { project, overlay } = await createRemoteStatusFixture(`invalid-page-${label.replaceAll(" ", "-")}`);
    const projectBefore = await prisma.project.findUnique({ where: { id: project.id } });
    const overlayBefore = await prisma.userProject.findUnique({ where: { id: overlay.id } });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      if (String(url).includes("/user/starred?")) return Response.json(payload);
      throw new Error(`Unexpected request after invalid Star page: ${url}`);
    };

    try {
      await assert.rejects(
        syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" }),
        error => error.code === "INVALID_RESPONSE" && !String(error.message).includes(label),
        label
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(await prisma.project.findUnique({ where: { id: project.id } }), projectBefore, label);
    assert.deepEqual(await prisma.userProject.findUnique({ where: { id: overlay.id } }), overlayBefore, label);
    const run = await prisma.syncRun.findFirst({ where: { userId: user.id }, orderBy: { id: "desc" } });
    assert.equal(run.status, "failed", label);
    assert.equal(run.errorCode, "SYNC_FAILED", label);
    assert.equal(run.errorSummary, "GitHub star sync failed.", label);
  }
});

test("incremental Star cutoff uses only fully validated DTO timestamps", async () => {
  const { project, overlay } = await createRemoteStatusFixture("incremental-cutoff-barrier");
  await prisma.userProject.update({
    where: { id: overlay.id },
    data: { starredAt: new Date("2026-07-25T12:00:00Z") }
  });
  const projectBefore = await prisma.project.findUnique({ where: { id: project.id } });
  const overlayBefore = await prisma.userProject.findUnique({ where: { id: overlay.id } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes("/user/starred?")) {
      const cutoffItem = starredRepository("invalid-cutoff");
      cutoffItem.starred_at = "0";
      return Response.json([starredRepository("must-not-persist"), cutoffItem]);
    }
    throw new Error(`Unexpected request after invalid cutoff item: ${url}`);
  };

  try {
    await assert.rejects(
      syncUserStars(
        { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
        { mode: "incremental" }
      ),
      error => error.code === "INVALID_RESPONSE"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count({
    where: { github: "https://github.com/activity-owner/must-not-persist" }
  }), 0);
  assert.deepEqual(await prisma.project.findUnique({ where: { id: project.id } }), projectBefore);
  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: overlay.id } }), overlayBefore);
});

test("incremental sync imports a new Star whose timestamp equals the previous cutoff", async () => {
  const cutoff = "2026-07-26T12:00:00Z";
  const { overlay } = await createRemoteStatusFixture("same-second-cutoff");
  await prisma.userProject.update({
    where: { id: overlay.id },
    data: { starredAt: new Date(cutoff) }
  });
  const equalTimestampItem = starredRepository("same-second-new");
  equalTimestampItem.starred_at = cutoff;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([equalTimestampItem]);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected equal-cutoff request: ${url}`);
  };

  let result;
  try {
    result = await syncUserStars(
      { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
      { mode: "incremental" }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.mode, "incremental");
  assert.equal(result.total, 1);
  const project = await prisma.project.findUnique({
    where: { github: "https://github.com/activity-owner/same-second-new" }
  });
  assert.ok(project);
  assert.ok(await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: user.id, projectId: project.id } }
  }));
});

test("incremental sync deduplicates and idempotently re-reads every equal-cutoff Star", async () => {
  const cutoff = "2026-07-26T12:00:00Z";
  const { project: existingProject, overlay, otherOverlay } =
    await createRemoteStatusFixture("equal-existing");
  await prisma.project.update({
    where: { id: existingProject.id },
    data: {
      name: "equal-existing",
      author: "activity-owner",
      github: "https://github.com/activity-owner/equal-existing"
    }
  });
  await prisma.userProject.update({
    where: { id: overlay.id },
    data: { starredAt: new Date(cutoff) }
  });
  const items = ["equal-existing", "equal-new-a", "equal-new-b"].map(name => {
    const item = starredRepository(name);
    item.starred_at = cutoff;
    return item;
  });
  items.push(structuredClone(items[1]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json(items);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected equal-cutoff idempotency request: ${url}`);
  };

  try {
    const first = await syncUserStars(
      { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
      { mode: "incremental" }
    );
    assert.equal(first.total, 3);
    const firstProjects = await prisma.project.findMany({ orderBy: { id: "asc" } });
    const firstOverlays = await prisma.userProject.findMany({
      where: { userId: user.id },
      orderBy: { id: "asc" }
    });
    assert.equal(firstProjects.length, 3);
    assert.equal(firstOverlays.length, 3);
    assert.deepEqual(firstProjects.map(item => item.github), [
      "https://github.com/activity-owner/equal-existing",
      "https://github.com/activity-owner/equal-new-a",
      "https://github.com/activity-owner/equal-new-b"
    ]);

    const second = await syncUserStars(
      { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
      { mode: "incremental" }
    );
    assert.equal(second.total, 3);
    assert.deepEqual(
      (await prisma.project.findMany({ orderBy: { id: "asc" } })).map(item => item.id),
      firstProjects.map(item => item.id)
    );
    assert.deepEqual(
      (await prisma.userProject.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } }))
        .map(item => item.id),
      firstOverlays.map(item => item.id)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(await prisma.userProject.findUnique({ where: { id: otherOverlay.id } }), otherOverlay);
});

test("incremental sync follows equal-cutoff Stars onto page two and stops at the first older item", async () => {
  const cutoff = "2026-07-26T12:00:00Z";
  const { overlay } = await createRemoteStatusFixture("equal-page-cutoff");
  await prisma.userProject.update({
    where: { id: overlay.id },
    data: { starredAt: new Date(cutoff) }
  });
  const firstPage = Array.from({ length: 100 }, (_, index) => {
    const item = starredRepository(`equal-page-one-${index}`);
    item.starred_at = cutoff;
    return item;
  });
  const pageTwoEqual = starredRepository("equal-page-two");
  pageTwoEqual.starred_at = cutoff;
  const pageTwoOlder = starredRepository("older-page-two");
  pageTwoOlder.starred_at = "2026-07-26T11:59:59Z";
  const requestedPages = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname === "/user/starred") {
      const page = target.searchParams.get("page");
      requestedPages.push(page);
      return Response.json(page === "1" ? firstPage : [pageTwoEqual, pageTwoOlder]);
    }
    if (target.pathname.endsWith("/releases/latest") || target.pathname.endsWith("/commits")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected equal-cutoff pagination request: ${url}`);
  };

  let result;
  try {
    result = await syncUserStars(
      { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
      { mode: "incremental" }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.equal(result.total, 101);
  assert.ok(await prisma.project.findUnique({
    where: { github: "https://github.com/activity-owner/equal-page-two" }
  }));
  assert.equal(await prisma.project.findUnique({
    where: { github: "https://github.com/activity-owner/older-page-two" }
  }), null);
});

test("a malformed second incremental page blocks all equal-cutoff writes", async () => {
  const cutoff = "2026-07-26T12:00:00Z";
  const { overlay } = await createRemoteStatusFixture("equal-malformed-cutoff");
  await prisma.userProject.update({
    where: { id: overlay.id },
    data: { starredAt: new Date(cutoff) }
  });
  const firstPage = Array.from({ length: 100 }, (_, index) => {
    const item = starredRepository(`equal-malformed-${index}`);
    item.starred_at = cutoff;
    return item;
  });
  const projectsBefore = await prisma.project.count();
  const overlaysBefore = await prisma.userProject.count();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname === "/user/starred") {
      return Response.json(target.searchParams.get("page") === "1" ? firstPage : { items: [] });
    }
    throw new Error(`Unexpected malformed incremental page request: ${url}`);
  };

  try {
    await assert.rejects(
      syncUserStars(
        { id: String(user.id), dbUserId: user.id, accessToken: "mock-token" },
        { mode: "incremental" }
      ),
      error => error.code === "INVALID_RESPONSE"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count(), projectsBefore);
  assert.equal(await prisma.userProject.count(), overlaysBefore);
  assert.equal(await prisma.project.count({
    where: { github: { startsWith: "https://github.com/activity-owner/equal-malformed-" } }
  }), 0);
});

test("a malformed second Star page prevents every first-page domain write", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => starredRepository(`page-one-${index}`));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname === "/user/starred") {
      return Response.json(target.searchParams.get("page") === "1" ? firstPage : { items: [] });
    }
    throw new Error(`Unexpected request after malformed second Star page: ${url}`);
  };

  try {
    await assert.rejects(
      syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" }),
      error => error.code === "INVALID_RESPONSE"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
  const run = await prisma.syncRun.findFirst({ where: { userId: user.id }, orderBy: { id: "desc" } });
  assert.equal(run.status, "failed");
  assert.equal(run.errorSummary, "GitHub star sync failed.");
});

test("a malformed item on the second Star page also blocks every first-page write", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => starredRepository(`page-item-${index}`));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = new URL(String(url));
    if (target.pathname === "/user/starred") {
      return Response.json(target.searchParams.get("page") === "1"
        ? firstPage
        : [{ starred_at: "2026-07-20T12:00:00Z", repo: null }]);
    }
    throw new Error(`Unexpected request after malformed second-page item: ${url}`);
  };

  try {
    await assert.rejects(
      syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" }),
      error => error.code === "INVALID_RESPONSE"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
});

test("conflicting duplicate canonical Star URLs fail closed before domain writes", async () => {
  const publicItem = starredRepository("duplicate-conflict");
  const privateItem = structuredClone(publicItem);
  privateItem.repo.private = true;
  privateItem.repo.visibility = "private";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes("/user/starred?")) return Response.json([publicItem, privateItem]);
    throw new Error(`Unexpected request after conflicting duplicate: ${url}`);
  };

  try {
    await assert.rejects(
      syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" }),
      error => error.code === "INVALID_RESPONSE"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(await prisma.project.count(), 0);
  assert.equal(await prisma.userProject.count(), 0);
});

test("identical duplicate canonical Star DTOs are safely deduplicated", async () => {
  const item = starredRepository("duplicate-identical");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([item, structuredClone(item)]);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected duplicate request: ${url}`);
  };

  let result;
  try {
    result = await syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(result.total, 1);
  assert.equal(await prisma.project.count(), 1);
  assert.equal(await prisma.userProject.count(), 1);
});

test("sync status marks an old running run stale when no valid lease exists", async () => {
  const startedAt = new Date(Date.now() - 60 * 60 * 1000);
  const run = await prisma.syncRun.create({
    data: {
      userId: user.id,
      source: "github_star_full",
      status: "running",
      startedAt,
      createdAt: startedAt
    }
  });

  const status = await getSyncStatusForUser({ id: String(user.id), dbUserId: user.id });
  const reported = status.recentRuns.find(item => item.id === run.id);

  assert.equal(reported.status, "failed");
  assert.equal(reported.errorCode, "SYNC_RUN_STALE");
  assert.match(reported.errorSummary, /stale/i);
  assert.ok(reported.completedAt instanceof Date);
});

test("sync status preserves a long-running run while its lease is active", async () => {
  const startedAt = new Date(Date.now() - 60 * 60 * 1000);
  const run = await prisma.syncRun.create({
    data: {
      userId: user.id,
      source: "github_star_full",
      status: "running",
      startedAt,
      createdAt: startedAt
    }
  });
  const lease = await claimOperationLease({
    key: `sync:${user.id}`,
    userId: user.id,
    kind: "sync",
    ttlSeconds: 60
  });

  try {
    const status = await getSyncStatusForUser({ id: String(user.id), dbUserId: user.id });
    assert.equal(status.recentRuns.find(item => item.id === run.id).status, "running");
  } finally {
    await releaseOperationLease(lease);
  }
});

test("release and commit 404s are successful no-data activity checks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([starredRepository()]);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  let result;
  try {
    result = await syncUserStars({
      id: String(user.id),
      dbUserId: user.id,
      accessToken: "mock-token"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.warnings, []);
  const run = await prisma.syncRun.findUnique({ where: { id: result.runId } });
  assert.equal(run.status, result.status);
  const project = await prisma.project.findUnique({
    where: { github: "https://github.com/activity-owner/activity-repo" }
  });
  assert.ok(project.activityCheckedAt instanceof Date);
  assert.equal(project.latestReleaseAt, null);
  assert.equal(project.latestCommitAt, null);
});

test("sync preserves an overlay created manually after the initial snapshot", async () => {
  const project = await prisma.project.create({
    data: {
      name: "stale-shared-name",
      author: "stale-owner",
      category: "legacy",
      categorySource: "rule",
      status: "legacy",
      language: "Unknown",
      stars: 1,
      updatedAt: "2020-01-01",
      description: "stale shared description",
      features: "[]",
      tags: "[]",
      github: "https://github.com/activity-owner/concurrent-overlay",
      demo: "",
      docs: "",
      note: "",
      publicVisible: true,
      visibilityVerifiedAt: new Date("2026-01-01T00:00:00Z")
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) {
      await prisma.userProject.create({
        data: {
          userId: user.id,
          projectId: project.id,
          category: "Human concurrent category",
          categorySource: "manual",
          categoryReason: "manual:created-during-sync",
          status: "Human status",
          recommended: true,
          note: "Human note",
          demo: "https://human.example/demo",
          docs: "https://human.example/docs",
          tags: JSON.stringify(["human-tag"]),
          features: JSON.stringify(["human-feature"]),
          remoteStatus: "missing",
          remoteStatusNote: "old remote state",
          lastSyncedAt: new Date("2026-01-01T00:00:00Z")
        }
      });
      return Response.json([starredRepository("concurrent-overlay")]);
    }
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  let result;
  try {
    result = await syncUserStars({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const overlay = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: user.id, projectId: project.id } }
  });
  assert.equal(await prisma.userProject.count({ where: { userId: user.id, projectId: project.id } }), 1);
  assert.equal(result.items[0].classificationSkipped, true);
  assert.equal(result.items[0].classificationConflicted, true);
  assert.equal(overlay.category, "Human concurrent category");
  assert.equal(overlay.categorySource, "manual");
  assert.equal(overlay.categoryReason, "manual:created-during-sync");
  assert.equal(overlay.status, "Human status");
  assert.equal(overlay.recommended, true);
  assert.equal(overlay.note, "Human note");
  assert.equal(overlay.demo, "https://human.example/demo");
  assert.equal(overlay.docs, "https://human.example/docs");
  assert.deepEqual(JSON.parse(overlay.tags), ["human-tag"]);
  assert.deepEqual(JSON.parse(overlay.features), ["human-feature"]);
  assert.equal(overlay.remoteStatus, "active");
  assert.equal(overlay.remoteStatusNote, "");
  assert.ok(overlay.remoteCheckedAt instanceof Date);
  assert.ok(overlay.starredAt instanceof Date);
  assert.ok(overlay.lastSyncedAt > new Date("2026-01-01T00:00:00Z"));
  const shared = await prisma.project.findUnique({ where: { id: project.id } });
  assert.equal(shared.name, "concurrent-overlay");
  assert.equal(shared.author, "activity-owner");
  assert.equal(shared.description, "activity reliability fixture");
  assert.equal(shared.stars, 7);
});

test("sync never recreates a deleted snapshotted overlay and reports the identity conflict", async () => {
  const project = await prisma.project.create({
    data: {
      name: "existing-before-fetch", author: "activity-owner", category: "legacy",
      categorySource: "rule", status: "legacy", language: "JavaScript", stars: 1,
      updatedAt: "2020-01-01", description: "old", features: "[]", tags: "[]",
      github: "https://github.com/activity-owner/deleted-overlay", demo: "", docs: "", note: "",
      publicVisible: true, visibilityVerifiedAt: new Date("2026-01-01T00:00:00Z")
    }
  });
  const before = await prisma.userProject.create({
    data: {
      userId: user.id, projectId: project.id, category: "Human category", categorySource: "manual",
      categoryReason: "manual:before-delete", status: "Human status", recommended: true,
      note: "Human note", demo: "https://old.example/demo", docs: "https://old.example/docs",
      tags: JSON.stringify(["old-tag"]), features: JSON.stringify(["old-feature"])
    }
  });
  const originalFetch = globalThis.fetch;
  const remoteStarted = deferred();
  const releaseRemote = deferred();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) {
      remoteStarted.resolve();
      await releaseRemote.promise;
      return Response.json([starredRepository("deleted-overlay")]);
    }
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  const syncPromise = syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" });
  let result;
  try {
    await remoteStarted.promise;
    await prisma.userProject.delete({ where: { id: before.id } });
    releaseRemote.resolve();
    result = await syncPromise;
  } finally {
    releaseRemote.resolve();
    globalThis.fetch = originalFetch;
  }

  const after = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId: user.id, projectId: project.id } }
  });
  assert.equal(await prisma.userProject.count({ where: { userId: user.id, projectId: project.id } }), 0);
  assert.equal(after, null);
  assert.equal(result.items[0].classificationSkipped, true);
  assert.equal(result.items[0].classificationConflicted, true);
  assert.equal(result.items[0].overlayUpdateSkipped, true);
  const shared = await prisma.project.findUnique({ where: { id: project.id } });
  assert.equal(shared.name, "deleted-overlay");
  assert.equal(shared.stars, 7);
  assert.equal(shared.publicVisible, true);
});

test("sync keeps all create-only private fields when the snapshotted overlay is unchanged", async () => {
  const project = await prisma.project.create({
    data: {
      name: "existing-overlay", author: "activity-owner", category: "legacy",
      categorySource: "rule", status: "legacy", language: "JavaScript", stars: 1,
      updatedAt: "2020-01-01", description: "old", features: "[]", tags: "[]",
      github: "https://github.com/activity-owner/existing-overlay", demo: "", docs: "", note: "",
      publicVisible: true, visibilityVerifiedAt: new Date("2026-01-01T00:00:00Z")
    }
  });
  const before = await prisma.userProject.create({
    data: {
      userId: user.id, projectId: project.id, category: "Manual category", categorySource: "manual",
      categoryReason: "manual:keep", status: "Manual status", recommended: true,
      note: "Manual note", demo: "https://manual.example/demo", docs: "https://manual.example/docs",
      tags: JSON.stringify(["manual-tag"]), features: JSON.stringify(["manual-feature"])
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([starredRepository("existing-overlay")]);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  let result;
  try {
    result = await syncUserStars({ id: String(user.id), dbUserId: user.id, accessToken: "mock-token" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const after = await prisma.userProject.findUnique({ where: { id: before.id } });
  assert.equal(result.items[0].classificationConflicted, undefined);
  for (const field of [
    "id", "category", "categorySource", "categoryReason", "status", "recommended",
    "note", "demo", "docs", "tags", "features"
  ]) {
    assert.deepEqual(after[field], before[field], `${field} was overwritten by create-only sync data`);
  }
});

test("full sync remote-status updates use existing-only CAS across delete, edit, and unchanged interleavings", async () => {
  for (const scenario of ["deleted", "edited", "same-value", "unchanged"]) {
    await resetDatabase();
    const { project, overlay, otherOverlay } = await createRemoteStatusFixture(`full-${scenario}`);
    const remoteStarted = deferred();
    const releaseRemote = deferred();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      const target = String(url);
      if (target.includes("/user/starred?")) return Response.json([]);
      if (target.endsWith(`/repos/remote-owner/full-${scenario}`)) {
        remoteStarted.resolve();
        await releaseRemote.promise;
        return Response.json({ message: "not found" }, { status: 404 });
      }
      if (target.includes("/releases/latest") || target.includes("/commits?")) {
        return Response.json({ message: "not found" }, { status: 404 });
      }
      throw new Error(`Unexpected request ${target}`);
    };

    const syncPromise = syncUserStars({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    }, { mode: "full" });
    let result;
    try {
      await remoteStarted.promise;
      if (scenario === "deleted") {
        await prisma.userProject.delete({ where: { id: overlay.id } });
      } else if (scenario === "edited") {
        await prisma.userProject.update({
          where: { id: overlay.id },
          data: {
            category: "Human concurrent category",
            note: "Human concurrent note",
            updatedAt: new Date("2099-01-01T00:00:00Z")
          }
        });
      } else if (scenario === "same-value") {
        await prisma.userProject.update({
          where: { id: overlay.id },
          data: { note: "Original note", updatedAt: new Date("2099-01-01T00:00:00Z") }
        });
      }
      releaseRemote.resolve();
      result = await syncPromise;
    } finally {
      releaseRemote.resolve();
      globalThis.fetch = originalFetch;
    }

    const current = await prisma.userProject.findUnique({ where: { id: overlay.id } });
    const shared = await prisma.project.findUnique({ where: { id: project.id } });
    const otherAfter = await prisma.userProject.findUnique({ where: { id: otherOverlay.id } });
    assert.equal(shared.publicVisible, false, `${scenario}: trusted shared visibility was not saved`);
    assert.deepEqual(otherAfter, otherOverlay, `${scenario}: another user's overlay changed`);

    if (scenario === "deleted") {
      assert.equal(current, null);
      assert.equal(await prisma.userProject.count({ where: { userId: user.id, projectId: project.id } }), 0);
    } else if (scenario === "edited" || scenario === "same-value") {
      assert.equal(current.category, scenario === "edited" ? "Human concurrent category" : "Original category");
      assert.equal(current.note, scenario === "edited" ? "Human concurrent note" : "Original note");
      assert.equal(current.remoteStatus, "active");
      assert.equal(current.remoteCheckedAt, null);
    } else {
      assert.equal(current.id, overlay.id);
      assert.equal(current.remoteStatus, "missing");
      assert.match(current.remoteStatusNote, /404/);
      assert.ok(current.remoteCheckedAt instanceof Date);
    }

    const conflicts = result.warnings.filter(item => item.code === "OVERLAY_CONFLICT");
    assert.equal(conflicts.length, scenario === "unchanged" ? 0 : 1, scenario);
  }
});

test("remote recheck reports existing-only CAS conflicts without fabricated updated items", async () => {
  for (const scenario of ["deleted", "edited", "same-value", "unchanged"]) {
    await resetDatabase();
    const { project, overlay, otherOverlay } = await createRemoteStatusFixture(`recheck-${scenario}`);
    const remoteStarted = deferred();
    const releaseRemote = deferred();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      const target = String(url);
      if (target.endsWith(`/repos/remote-owner/recheck-${scenario}`)) {
        remoteStarted.resolve();
        await releaseRemote.promise;
        return Response.json({ message: "not found" }, { status: 404 });
      }
      throw new Error(`Unexpected request ${target}`);
    };

    const recheckPromise = recheckRemoteStatusForUser({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    }, [project.id]);
    let result;
    try {
      await remoteStarted.promise;
      if (scenario === "deleted") {
        await prisma.userProject.delete({ where: { id: overlay.id } });
      } else if (scenario === "edited") {
        await prisma.userProject.update({
          where: { id: overlay.id },
          data: {
            status: "Human concurrent status",
            note: "Human concurrent note",
            updatedAt: new Date("2099-01-01T00:00:00Z")
          }
        });
      } else if (scenario === "same-value") {
        await prisma.userProject.update({
          where: { id: overlay.id },
          data: { note: "Original note", updatedAt: new Date("2099-01-01T00:00:00Z") }
        });
      }
      releaseRemote.resolve();
      result = await recheckPromise;
    } finally {
      releaseRemote.resolve();
      globalThis.fetch = originalFetch;
    }

    const current = await prisma.userProject.findUnique({ where: { id: overlay.id } });
    const shared = await prisma.project.findUnique({ where: { id: project.id } });
    assert.equal(shared.publicVisible, false, `${scenario}: trusted shared visibility was not saved`);
    assert.deepEqual(
      await prisma.userProject.findUnique({ where: { id: otherOverlay.id } }),
      otherOverlay,
      `${scenario}: another user's overlay changed`
    );

    if (scenario === "unchanged") {
      assert.equal(result.updated, 1);
      assert.equal(result.skipped, 0);
      assert.equal(result.conflicted, 0);
      assert.equal(result.items.length, 1);
      assert.equal(current.remoteStatus, "missing");
      assert.ok(current.remoteCheckedAt instanceof Date);
    } else {
      assert.equal(result.updated, 0);
      assert.equal(result.skipped, 1);
      assert.equal(result.conflicted, 1);
      assert.deepEqual(result.items, []);
      assert.equal(result.conflicts.length, 1);
      assert.equal(result.conflicts[0].projectId, project.id);
      if (scenario === "deleted") {
        assert.equal(current, null);
        assert.equal(await prisma.userProject.count({ where: { userId: user.id, projectId: project.id } }), 0);
      } else {
        assert.equal(current.status, scenario === "edited" ? "Human concurrent status" : "Original status");
        assert.equal(current.note, scenario === "edited" ? "Human concurrent note" : "Original note");
        assert.equal(current.remoteStatus, "active");
        assert.equal(current.remoteCheckedAt, null);
      }
    }
  }
});

test("predictable activity endpoint failures produce a warning without claiming a successful check", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([starredRepository("warning-repo")]);
    if (target.includes("/releases/latest")) {
      return Response.json({ message: "temporary failure" }, { status: 503 });
    }
    if (target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  let result;
  try {
    result = await syncUserStars({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.status, "succeeded_with_warnings");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "HTTP_ERROR");
  assert.equal(result.warnings[0].scope, "release_activity");
  assert.equal((await prisma.syncRun.findUnique({ where: { id: result.runId } })).status, result.status);
  const project = await prisma.project.findUnique({
    where: { github: "https://github.com/activity-owner/warning-repo" }
  });
  assert.equal(project.activityCheckedAt, null);
  assert.ok((await prisma.user.findUnique({ where: { id: user.id } })).lastStarSyncAt instanceof Date);
});

test("a database activity write error fails the sync run instead of being swallowed", async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_activity_checked_at"
    BEFORE UPDATE OF "activityCheckedAt" ON "Project"
    BEGIN
      SELECT RAISE(ABORT, 'injected activity persistence failure');
    END
  `);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes("/user/starred?")) return Response.json([starredRepository("db-failure-repo")]);
    if (target.includes("/releases/latest") || target.includes("/commits?")) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected request ${target}`);
  };

  try {
    await assert.rejects(syncUserStars({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    }), error => error?.code === "P2003");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_activity_checked_at"');
  }

  const run = await prisma.syncRun.findFirst({ orderBy: { id: "desc" } });
  assert.equal(run.status, "failed");
  assert.equal(run.errorCode, "SYNC_FAILED");
  assert.ok(run.completedAt instanceof Date);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).lastStarSyncAt, null);
});

test("failure-state persistence errors do not replace the original sync error", async () => {
  const secret = "terminal SyncRun token=secret v1.ciphertext";
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_sync_terminal_state"
    BEFORE UPDATE OF "status" ON "SyncRun"
    WHEN NEW."status" = 'failed'
    BEGIN
      SELECT RAISE(ABORT, '${secret}');
    END
  `);
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const logCalls = [];
  console.error = (...args) => logCalls.push(args);
  globalThis.fetch = async url => {
    assert.match(String(url), /\/user\/starred\?/);
    return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "45" }
    });
  };

  try {
    await assert.rejects(syncUserStars({
      id: String(user.id), dbUserId: user.id, accessToken: "mock-token"
    }), error => error?.code === "RATE_LIMITED" && error.retryAfterSeconds === 45);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_sync_terminal_state"');
  }

  assert.equal((await prisma.syncRun.findFirst({ orderBy: { id: "desc" } })).status, "running");
  assert.ok(logCalls.some(args => String(args[0]).includes("Failed to record terminal state")));
  assert.ok(logCalls.every(args => args.length === 1 && typeof args[0] === "string"));
  assert.doesNotMatch(logCalls.flat().map(String).join("\n"), /token=secret|v1\.ciphertext/);
});

test("lease release failures do not replace completed work results", async () => {
  const secret = "lease release token=secret v1.ciphertext";
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "fail_lease_release"
    BEFORE UPDATE OF "owner" ON "OperationLease"
    WHEN NEW."owner" = ''
    BEGIN
      SELECT RAISE(ABORT, '${secret}');
    END
  `);
  const originalConsoleError = console.error;
  const logCalls = [];
  console.error = (...args) => logCalls.push(args);
  let result;
  try {
    result = await withOperationLease({
      key: `sync:${user.id}`,
      userId: user.id,
      kind: "sync",
      ttlSeconds: 60
    }, async () => "primary-result");
  } finally {
    console.error = originalConsoleError;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_lease_release"');
  }

  assert.equal(result, "primary-result");
  assert.ok(logCalls.some(args => String(args[0]).includes("Failed to release")));
  assert.ok(logCalls.every(args => args.length === 1 && typeof args[0] === "string"));
  assert.doesNotMatch(logCalls.flat().map(String).join("\n"), /token=secret|v1\.ciphertext/);
});
