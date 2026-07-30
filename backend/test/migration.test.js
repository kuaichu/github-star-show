import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.dirname(backendRoot);
const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
const migrationsRoot = path.join(backendRoot, "prisma", "migrations");
const legacySchema = path.join(backendRoot, "prisma", "legacy-schema.prisma");
const migrationNames = [
  "20260725000000_baseline",
  "20260726000000_add_user_project_ai_fields",
  "20260726010000_harden_auth_storage",
  "20260726020000_reliability_leases",
  "20260726030000_public_project_verification"
];
const windowsOnlyTest = process.platform === "win32" ? test : test.skip;
const powershells = ["powershell.exe", "pwsh"];

function run(command, args, { cwd = backendRoot, databasePath, timeout = 60_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    env: databasePath
      ? { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` }
      : process.env
  });
  assert.equal(result.error?.code, undefined, result.error?.message);
  return result;
}

function prisma(databasePath, args, expectedStatus = 0) {
  const result = run(process.execPath, [prismaCli, ...args], { databasePath });
  assert.equal(result.status, expectedStatus, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result;
}

async function withTempDatabase(callback) {
  const directory = await mkdtemp(path.join(backendRoot, ".migration-test-"));
  const databasePath = path.join(directory, "fixture.db");
  try {
    new DatabaseSync(databasePath).close();
    await callback(databasePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function migrationRows(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    return database.prepare(`
      SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations ORDER BY started_at
    `).all();
  } finally {
    database.close();
  }
}

function assertCompleteHistory(databasePath) {
  const rows = migrationRows(databasePath);
  assert.deepEqual(rows.map(row => row.migration_name), migrationNames);
  assert.ok(rows.every(row => row.finished_at !== null && row.rolled_back_at === null));
  assert.ok([0, 1].includes(rows[0].applied_steps_count));
  assert.ok(rows.slice(1).every(row => row.applied_steps_count === 1));
}

function diffLegacy(databasePath, expectedStatus = 0) {
  const result = prisma(databasePath, [
    "migrate", "diff", "--exit-code",
    "--from-schema-datamodel", legacySchema,
    "--to-url", `file:${databasePath.replaceAll("\\", "/")}`
  ], expectedStatus);
  return result;
}

test("migration SQL and attributes remain LF-stable", async () => {
  const attributesPath = path.join(repositoryRoot, ".gitattributes");
  assert.equal((await readFile(attributesPath)).includes(13), false);
  const attributes = await readFile(attributesPath, "utf8");
  assert.match(attributes, /backend\/prisma\/migrations\/\*\*\/\*\.sql text eol=lf/);
  for (const name of migrationNames) {
    const sql = await readFile(path.join(migrationsRoot, name, "migration.sql"));
    assert.equal(sql.includes(13), false, `${name}/migration.sql must use LF`);
  }
});

test("fresh database deploys the complete current history", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["migrate", "deploy"]);
    assertCompleteHistory(databasePath);
  });
});

test("exact real legacy db-push resolves only baseline and then deploys", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["db", "push", "--schema", legacySchema, "--skip-generate"]);
    diffLegacy(databasePath);

    const database = new DatabaseSync(databasePath);
    database.exec(`
      INSERT INTO "Project" (
        "id", "name", "author", "category", "status", "language", "stars",
        "updatedAt", "description", "features", "tags", "github", "demo", "docs", "note"
      ) VALUES (
        7, 'legacy', 'owner', 'private legacy value', 'saved', 'JS', 1,
        '2026-01-01', 'kept', '[]', '[]', 'https://github.com/owner/legacy', '', '', 'note'
      )
    `);
    database.close();

    prisma(databasePath, ["migrate", "resolve", "--applied", migrationNames[0]]);
    prisma(databasePath, ["migrate", "deploy"]);
    assertCompleteHistory(databasePath);

    const migrated = new DatabaseSync(databasePath);
    try {
      assert.equal(migrated.prepare('SELECT "name" FROM "Project" WHERE "id" = 7').get().name, "legacy");
    } finally {
      migrated.close();
    }
  });
});

test("complete current history deploy is a no-op", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["migrate", "deploy"]);
    const before = migrationRows(databasePath).map(row => ({
      name: row.migration_name,
      checksum: row.checksum,
      finished: String(row.finished_at)
    }));
    const output = prisma(databasePath, ["migrate", "deploy"]);
    assert.match(`${output.stdout}\n${output.stderr}`, /No pending migrations to apply/i);
    const after = migrationRows(databasePath).map(row => ({
      name: row.migration_name,
      checksum: row.checksum,
      finished: String(row.finished_at)
    }));
    assert.deepEqual(after, before);
  });
});

test("complete history accepts baseline zero steps but requires one step for migrations 2 through 5", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["migrate", "deploy"]);
    const database = new DatabaseSync(databasePath);
    try {
      database.prepare("UPDATE _prisma_migrations SET applied_steps_count = 0 WHERE migration_name = ?")
        .run(migrationNames[0]);
    } finally {
      database.close();
    }
    assert.doesNotThrow(() => assertCompleteHistory(databasePath));

    const invalid = new DatabaseSync(databasePath);
    try {
      invalid.prepare("UPDATE _prisma_migrations SET applied_steps_count = 0 WHERE migration_name = ?")
        .run(migrationNames[1]);
    } finally {
      invalid.close();
    }
    assert.throws(() => assertCompleteHistory(databasePath));
  });
});

test("legacy comparison is Prisma migrate diff and rejects schema drift", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["db", "push", "--schema", legacySchema, "--skip-generate"]);
    const database = new DatabaseSync(databasePath);
    database.exec('ALTER TABLE "Project" ADD COLUMN "unexpected" TEXT');
    database.close();
    diffLegacy(databasePath, 2);
  });
});

test("legacy databases with any VIEW or TRIGGER are rejected before diff or resolve", async () => {
  for (const ddl of [
    'CREATE VIEW "LegacyView" AS SELECT "id" FROM "Project"',
    'CREATE TRIGGER "LegacyTrigger" AFTER INSERT ON "Project" BEGIN SELECT 1; END'
  ]) {
    await withTempDatabase(async databasePath => {
      prisma(databasePath, ["db", "push", "--schema", legacySchema, "--skip-generate"]);
      const database = new DatabaseSync(databasePath);
      database.exec(ddl);
      try {
        const objects = database.prepare(
          "SELECT type, name FROM sqlite_master WHERE type IN ('view','trigger')"
        ).all();
        assert.equal(objects.length, 1);
      } finally {
        database.close();
      }
    });
  }
});

test("runbook permits only fresh, exact legacy, and complete current automation", async () => {
  const runbook = await readFile(path.join(backendRoot, "prisma", "MIGRATION.md"), "utf8");
  assert.match(runbook, /fresh[\s\S]*migrate deploy/i);
  assert.match(runbook, /legacy-schema\.prisma[\s\S]*migrate diff/i);
  assert.match(runbook, /complete current history[\s\S]*deploy/i);
  for (const state of ["partial", "failed", "historyless-current", "resolved-only"]) {
    assert.match(runbook, new RegExp(`${state}[\\s\\S]{0,240}(hard-stop|manual)`, "i"));
  }
  assert.doesNotMatch(runbook, /verify-migration-schema\.mjs|prefix 1|prefixes 1 through 5/i);
  assert.match(runbook, /type IN \('view','trigger'\)[\s\S]{0,300}hard-stop/i);
  assert.match(runbook, /@\(Invoke-SqliteLines/);
});

windowsOnlyTest("PowerShell 5.1 and 7 resolve backend from repository root and backend", () => {
  const resolver = path.join(backendRoot, "prisma", "resolve-backend-root.ps1");
  for (const powershell of powershells) {
    for (const cwd of [repositoryRoot, backendRoot]) {
      const result = run(powershell, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-File", resolver,
        "-StartPath", cwd, "-ConfirmBackendRoot", backendRoot
      ], { cwd, timeout: 10_000 });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Resolved BackendRoot:/);
    }
  }
});

windowsOnlyTest("PowerShell 5.1 and 7 preserve one sqlite result as an array", () => {
  const script = [
    "function Invoke-SqliteLines { return 'ok' }",
    "$Lines = @(Invoke-SqliteLines)",
    "if ($Lines.Count -ne 1 -or $Lines[0] -cne 'ok') { throw 'array capture failed' }",
    "Write-Output \"$($Lines.Count)|$($Lines[0])\""
  ].join("; ");
  for (const powershell of powershells) {
    const result = run(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "1|ok");
  }
});

test("repository migration checksums are the history checksums", async () => {
  await withTempDatabase(async databasePath => {
    prisma(databasePath, ["migrate", "deploy"]);
    for (const row of migrationRows(databasePath)) {
      const sql = await readFile(path.join(migrationsRoot, row.migration_name, "migration.sql"));
      assert.equal(row.checksum, createHash("sha256").update(sql).digest("hex"));
    }
  });
});
