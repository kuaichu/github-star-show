-- Baseline matching databases created by the pre-migration `prisma db push`
-- workflow. Fresh databases apply this migration and the following hardening
-- migration. Existing databases must resolve this baseline only after the
-- documented PRAGMA verification.

BEGIN IMMEDIATE;

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
  "activityCheckedAt" DATETIME
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
  "total" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

COMMIT;
