import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
const baselineName = "20260725000000_baseline";

function runPrisma(databasePath, args) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`
    },
    encoding: "utf8",
    timeout: 60_000
  });
}

function assertPrismaSucceeded(result) {
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
}

async function withLegacyDatabase(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "github-url-migration-"));
  const databasePath = path.join(directory, "test.db");
  const baselineSql = await readFile(path.join(
    backendRoot, "prisma", "migrations", baselineName, "migration.sql"
  ), "utf8");
  const database = new DatabaseSync(databasePath);
  database.exec(baselineSql);

  try {
    await run({ database, databasePath });
  } finally {
    if (database.isOpen) database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function insertLegacyProject(database, { id, github }) {
  database.prepare(`
    INSERT INTO "Project" (
      "id", "name", "author", "category", "status", "language", "stars",
      "updatedAt", "description", "features", "tags", "github", "demo", "docs", "note"
    ) VALUES (?, ?, 'legacy-owner', 'legacy-category', 'saved', 'JS', 1,
      '2026-01-01', 'shared description', '[]', '[]', ?, '', '', 'legacy project note')
  `).run(id, `project-${id}`, github);
}

test("migration canonicalizes a legacy GitHub URL batch without changing project identity or overlays", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    const legacyProjects = [
      { id: 7, github: "HTTPS://GitHub.COM/Owner/Repo" },
      { id: 8, github: "https://github.com/Mixed/Case.git" },
      { id: 9, github: "https://github.com/Trailing/Slash/" },
      { id: 10, github: "https://github.com/Query/Repo.git?tab=readme" },
      { id: 12, github: "github.com/Fragment/Repo#readme" },
      { id: 14, github: "https://github.com:443/Explicit/Port.git/" }
    ];
    for (const project of legacyProjects) insertLegacyProject(database, project);

    database.exec(`
      INSERT INTO "User" ("id", "githubLogin", "createdAt", "updatedAt")
      VALUES (11, 'legacy-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "UserProject" (
        "id", "userId", "projectId", "category", "categorySource", "categoryReason",
        "status", "recommended", "note", "demo", "docs", "tags", "features", "updatedAt"
      ) VALUES (
        21, 11, 14, 'private overlay', 'manual', 'manual:legacy',
        'in-use', true, 'private note', 'private demo', 'private docs',
        '["private tag"]', '["private feature"]', CURRENT_TIMESTAMP
      );
    `);
    database.close();

    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "resolve", "--applied", baselineName]));
    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "deploy"]));

    const migrated = new DatabaseSync(databasePath);
    try {
      const projects = migrated.prepare(
        'SELECT "id", "github" FROM "Project" ORDER BY "id"'
      ).all().map(({ id, github }) => ({ id, github }));
      assert.deepEqual(projects, [
        { id: 7, github: "https://github.com/owner/repo" },
        { id: 8, github: "https://github.com/mixed/case" },
        { id: 9, github: "https://github.com/trailing/slash" },
        { id: 10, github: "https://github.com/query/repo" },
        { id: 12, github: "https://github.com/fragment/repo" },
        { id: 14, github: "https://github.com/explicit/port" }
      ]);

      const rawOverlay = migrated.prepare(`
        SELECT "id", "userId", "projectId", "category", "note", "tags", "features"
        FROM "UserProject" WHERE "id" = 21
      `).get();
      const overlay = { ...rawOverlay };
      assert.deepEqual(overlay, {
        id: 21,
        userId: 11,
        projectId: 14,
        category: "private overlay",
        note: "private note",
        tags: '["private tag"]',
        features: '["private feature"]'
      });
      assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      migrated.close();
    }
  });
});

test("canonical collisions hard-stop before rebuild without leaking or losing private data", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    insertLegacyProject(database, { id: 31, github: "https://github.com/Owner/Repo" });
    insertLegacyProject(database, {
      id: 32,
      github: "https://github.com/owner/repo.git?tab=readme#fragment"
    });
    database.exec(`
      UPDATE "Project"
      SET "description" = 'SECRET_PROJECT_DESCRIPTION', "note" = 'SECRET_PROJECT_NOTE'
      WHERE "id" = 31;
      INSERT INTO "User" ("id", "githubLogin", "createdAt", "updatedAt")
      VALUES (41, 'collision-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "UserProject" (
        "id", "userId", "projectId", "category", "categorySource", "categoryReason",
        "status", "note", "demo", "docs", "tags", "features", "updatedAt"
      ) VALUES (
        51, 41, 31, 'SECRET_OVERLAY_CATEGORY', 'manual', 'manual:legacy',
        'saved', 'SECRET_OVERLAY_NOTE', '', '', '[]', '[]', CURRENT_TIMESTAMP
      );
    `);
    database.close();

    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "resolve", "--applied", baselineName]));
    const failed = runPrisma(databasePath, ["migrate", "deploy"]);
    assert.notEqual(failed.status, 0);
    const migrationError = [failed.stdout, failed.stderr].filter(Boolean).join("\n");
    assert.match(migrationError, /canonicalGithub|ProjectGithubCanonicalPreflight/);
    assert.doesNotMatch(
      migrationError,
      /SECRET_PROJECT_DESCRIPTION|SECRET_PROJECT_NOTE|SECRET_OVERLAY_CATEGORY|SECRET_OVERLAY_NOTE/
    );

    const unchanged = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(
        unchanged.prepare('SELECT "id", "github" FROM "Project" ORDER BY "id"').all()
          .map(({ id, github }) => ({ id, github })),
        [
          { id: 31, github: "https://github.com/Owner/Repo" },
          { id: 32, github: "https://github.com/owner/repo.git?tab=readme#fragment" }
        ]
      );
      assert.deepEqual(
        { ...unchanged.prepare(`
          SELECT "id", "userId", "projectId", "category", "note"
          FROM "UserProject" WHERE "id" = 51
        `).get() },
        {
          id: 51,
          userId: 41,
          projectId: 31,
          category: "SECRET_OVERLAY_CATEGORY",
          note: "SECRET_OVERLAY_NOTE"
        }
      );
      assert.equal(
        unchanged.prepare(`
          SELECT COUNT(*) AS "count" FROM "sqlite_master"
          WHERE "type" = 'table' AND "name" IN ('new_Project', 'ProjectGithubCanonicalPreflight')
        `).get().count,
        0
      );
      assert.deepEqual(unchanged.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      unchanged.close();
    }
  });
});

test("explicit GitHub port collisions also roll back before Project or UserProject changes", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    insertLegacyProject(database, { id: 34, github: "https://github.com/Explicit/Port" });
    insertLegacyProject(database, {
      id: 35,
      github: "https://github.com:443/explicit/port.git/#readme"
    });
    database.exec(`
      INSERT INTO "User" ("id", "githubLogin", "createdAt", "updatedAt")
      VALUES (44, 'port-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      INSERT INTO "UserProject" (
        "id", "userId", "projectId", "category", "categorySource", "categoryReason",
        "status", "note", "demo", "docs", "tags", "features", "updatedAt"
      ) VALUES (
        54, 44, 35, 'PORT_PRIVATE_CATEGORY', 'manual', 'manual:legacy',
        'saved', 'PORT_PRIVATE_NOTE', '', '', '[]', '[]', CURRENT_TIMESTAMP
      );
    `);
    database.close();

    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "resolve", "--applied", baselineName]));
    const failed = runPrisma(databasePath, ["migrate", "deploy"]);
    assert.notEqual(failed.status, 0);
    const migrationError = [failed.stdout, failed.stderr].filter(Boolean).join("\n");
    assert.match(migrationError, /canonicalGithub|ProjectGithubCanonicalPreflight/);
    assert.doesNotMatch(migrationError, /PORT_PRIVATE_CATEGORY|PORT_PRIVATE_NOTE/);

    const unchanged = new DatabaseSync(databasePath);
    try {
      assert.deepEqual(
        unchanged.prepare('SELECT "id", "github" FROM "Project" ORDER BY "id"').all()
          .map(({ id, github }) => ({ id, github })),
        [
          { id: 34, github: "https://github.com/Explicit/Port" },
          { id: 35, github: "https://github.com:443/explicit/port.git/#readme" }
        ]
      );
      assert.deepEqual(
        { ...unchanged.prepare(`
          SELECT "id", "userId", "projectId", "category", "note"
          FROM "UserProject" WHERE "id" = 54
        `).get() },
        {
          id: 54,
          userId: 44,
          projectId: 35,
          category: "PORT_PRIVATE_CATEGORY",
          note: "PORT_PRIVATE_NOTE"
        }
      );
      assert.deepEqual(unchanged.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      unchanged.close();
    }
  });
});

test("runtime upsert reuses a legacy URL project before the migration is deployed", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    insertLegacyProject(database, {
      id: 61,
      github: "HTTPS://GitHub.COM/Runtime/Transition.git/"
    });
    database.close();

    const { PrismaClient } = await import("@prisma/client");
    const { upsertProjectByGithub } = await import("../src/services/projectService.js");
    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath.replaceAll("\\", "/")}`
    });

    try {
      const project = await upsertProjectByGithub({
        name: "transition",
        author: "runtime",
        language: "JavaScript",
        stars: 10,
        updatedAt: "2026-07-26",
        description: "updated shared description",
        github: "https://github.com/runtime/transition"
      }, { client, updateExisting: true });

      assert.equal(project.id, 61);
      assert.equal(project.github, "https://github.com/runtime/transition");
      assert.equal(await client.project.count(), 1);
    } finally {
      await client.$disconnect();
    }
  });
});

test("post-migration upsert variants do not create another Project", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    insertLegacyProject(database, {
      id: 71,
      github: "https://github.com/Post/Migration.git/"
    });
    database.close();

    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "resolve", "--applied", baselineName]));
    assertPrismaSucceeded(runPrisma(databasePath, ["migrate", "deploy"]));

    const { PrismaClient } = await import("@prisma/client");
    const { upsertProjectByGithub } = await import("../src/services/projectService.js");
    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath.replaceAll("\\", "/")}`
    });

    try {
      const project = await upsertProjectByGithub({
        name: "migration",
        author: "post",
        language: "JavaScript",
        stars: 11,
        updatedAt: "2026-07-26",
        description: "post migration upsert",
        github: "HTTPS://GITHUB.COM:443/POST/MIGRATION.GIT/?tab=readme#fragment"
      }, { client, updateExisting: true });

      assert.equal(project.id, 71);
      assert.equal(project.github, "https://github.com/post/migration");
      assert.equal(await client.project.count(), 1);
    } finally {
      await client.$disconnect();
    }
  });
});

test("runtime canonical collision errors contain only project IDs and the canonical key", async () => {
  await withLegacyDatabase(async ({ database, databasePath }) => {
    insertLegacyProject(database, { id: 80, github: "https://github.com/collision/runtime" });
    insertLegacyProject(database, {
      id: 81,
      github: "https://github.com/Collision/Runtime.git?tab=readme"
    });
    insertLegacyProject(database, {
      id: 82,
      github: "HTTPS://GITHUB.COM:443/collision/runtime/#fragment"
    });
    database.exec(`
      UPDATE "Project"
      SET "description" = 'SECRET_RUNTIME_DESCRIPTION', "note" = 'SECRET_RUNTIME_NOTE'
    `);
    database.close();

    const { PrismaClient } = await import("@prisma/client");
    const { upsertProjectByGithub } = await import("../src/services/projectService.js");
    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath.replaceAll("\\", "/")}`
    });

    try {
      await assert.rejects(
        upsertProjectByGithub({
          name: "runtime",
          author: "collision",
          language: "JavaScript",
          stars: 1,
          updatedAt: "2026-07-26",
          description: "incoming",
          github: "https://github.com/collision/runtime"
        }, { client, updateExisting: true }),
        error => {
          assert.equal(
            error.message,
            "Canonical GitHub URL collision for project IDs [80,81,82]: https://github.com/collision/runtime"
          );
          assert.doesNotMatch(error.message, /SECRET_RUNTIME_DESCRIPTION|SECRET_RUNTIME_NOTE/);
          return true;
        }
      );
      assert.equal(await client.project.count(), 3);
    } finally {
      await client.$disconnect();
    }
  });
});
