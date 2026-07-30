PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- Rebuild instead of ALTERing startedAt with CURRENT_TIMESTAMP: SQLite rejects
-- that non-constant default when SyncRun already contains rows. Rows created
-- before run lifecycle tracking existed are completed history, not live work.
CREATE TABLE "new_SyncRun" (
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

INSERT INTO "new_SyncRun" (
  "id", "userId", "source", "status", "total", "skippedPrivate",
  "errorCode", "errorSummary", "startedAt", "completedAt", "createdAt"
)
SELECT
  "id", "userId", "source", 'succeeded', "total", 0,
  NULL, NULL, "createdAt", "createdAt", "createdAt"
FROM "SyncRun";

DROP TABLE "SyncRun";
ALTER TABLE "new_SyncRun" RENAME TO "SyncRun";

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

COMMIT;
PRAGMA foreign_keys=ON;
