-- AI classification belongs to a user-project relationship. All columns are
-- nullable so the migration is additive and does not invent ownership for
-- legacy AI values currently stored on Project.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

ALTER TABLE "UserProject" ADD COLUMN "aiCategory" TEXT;
ALTER TABLE "UserProject" ADD COLUMN "aiConfidence" REAL;
ALTER TABLE "UserProject" ADD COLUMN "aiReason" TEXT;
ALTER TABLE "UserProject" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "UserProject" ADD COLUMN "aiClassifiedAt" DATETIME;

-- Stage only project identity and the canonical GitHub key. The UNIQUE
-- constraint is a preflight guard: canonical collisions stop the migration
-- before the Project table is rebuilt or any project row is copied. Keeping
-- the guard free of user/overlay columns also prevents private values from
-- appearing in a constraint error.
CREATE TABLE "ProjectGithubCanonicalPreflight" (
  "projectId" INTEGER NOT NULL PRIMARY KEY,
  "canonicalGithub" TEXT NOT NULL UNIQUE
);

INSERT INTO "ProjectGithubCanonicalPreflight" ("projectId", "canonicalGithub")
WITH "raw_project" AS (
  SELECT "id", TRIM("github") AS "github"
  FROM "Project"
),
"url_source" AS (
  SELECT
    "id",
    "github",
    CASE
      WHEN INSTR("github", '://') > 0 THEN SUBSTR("github", INSTR("github", '://') + 3)
      ELSE "github"
    END AS "authorityAndPath"
  FROM "raw_project"
),
"url_parts" AS (
  SELECT
    "id",
    "github",
    CASE
      WHEN INSTR("authorityAndPath", '/') > 0
        THEN SUBSTR("authorityAndPath", 1, INSTR("authorityAndPath", '/') - 1)
      ELSE "authorityAndPath"
    END AS "authority",
    CASE
      WHEN INSTR("authorityAndPath", '/') > 0
        THEN SUBSTR("authorityAndPath", INSTR("authorityAndPath", '/') + 1)
      ELSE NULL
    END AS "pathAndSuffix"
  FROM "url_source"
),
"url_host_path" AS (
  SELECT
    "id",
    "github",
    CASE
      WHEN INSTR("authority", '@') > 0 THEN SUBSTR("authority", INSTR("authority", '@') + 1)
      ELSE "authority"
    END AS "hostPort",
    "pathAndSuffix"
  FROM "url_parts"
),
"github_path" AS (
  SELECT
    "id",
    "github",
    CASE
      WHEN LOWER("hostPort") = 'github.com' THEN "pathAndSuffix"
      WHEN SUBSTR(LOWER("hostPort"), 1, 11) = 'github.com:'
        AND LENGTH(SUBSTR("hostPort", 12)) > 0
        AND SUBSTR("hostPort", 12) NOT GLOB '*[^0-9]*'
        AND CAST(SUBSTR("hostPort", 12) AS INTEGER) BETWEEN 0 AND 65535
        THEN "pathAndSuffix"
      ELSE NULL
    END AS "pathAndSuffix"
  FROM "url_host_path"
),
"path_positions" AS (
  SELECT
    "id",
    "github",
    "pathAndSuffix",
    INSTR("pathAndSuffix", '?') AS "queryPosition",
    INSTR("pathAndSuffix", '#') AS "fragmentPosition"
  FROM "github_path"
),
"github_segments" AS (
  SELECT
    "id",
    "github",
    TRIM(
      CASE
        WHEN "queryPosition" > 0
          AND ("fragmentPosition" = 0 OR "queryPosition" < "fragmentPosition")
          THEN SUBSTR("pathAndSuffix", 1, "queryPosition" - 1)
        WHEN "fragmentPosition" > 0
          THEN SUBSTR("pathAndSuffix", 1, "fragmentPosition" - 1)
        ELSE "pathAndSuffix"
      END,
      '/'
    ) AS "path",
    INSTR(
      TRIM(
        CASE
          WHEN "queryPosition" > 0
            AND ("fragmentPosition" = 0 OR "queryPosition" < "fragmentPosition")
            THEN SUBSTR("pathAndSuffix", 1, "queryPosition" - 1)
          WHEN "fragmentPosition" > 0
            THEN SUBSTR("pathAndSuffix", 1, "fragmentPosition" - 1)
          ELSE "pathAndSuffix"
        END,
        '/'
      ),
      '/'
    ) AS "separator"
  FROM "path_positions"
),
"github_owner_repo" AS (
  SELECT
    "id",
    "github",
    CASE WHEN "separator" > 1 THEN SUBSTR("path", 1, "separator" - 1) END AS "owner",
    CASE
      WHEN "separator" > 1 THEN
        CASE
          WHEN INSTR(SUBSTR("path", "separator" + 1), '/') > 0
            THEN SUBSTR(
              SUBSTR("path", "separator" + 1),
              1,
              INSTR(SUBSTR("path", "separator" + 1), '/') - 1
            )
          ELSE SUBSTR("path", "separator" + 1)
        END
    END AS "repo"
  FROM "github_segments"
)
SELECT
  "id",
  CASE
    WHEN "owner" IS NULL OR "owner" = '' OR "repo" IS NULL OR "repo" = '' THEN "github"
    ELSE 'https://github.com/' || LOWER(
      CASE
        WHEN LOWER("owner") LIKE '%.git' THEN SUBSTR("owner", 1, LENGTH("owner") - 4)
        ELSE "owner"
      END
    ) || '/' || LOWER(
      CASE
        WHEN LOWER("repo") LIKE '%.git' THEN SUBSTR("repo", 1, LENGTH("repo") - 4)
        ELSE "repo"
      END
    )
  END
FROM "github_owner_repo";

-- Project ids used to be assigned by `max(id) + 1` in application code. Rebuild
-- the table so SQLite owns id allocation and concurrent writers cannot choose
-- the same id. All existing ids and foreign-key references are preserved.
CREATE TABLE "new_Project" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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

INSERT INTO "new_Project" (
  "id", "name", "author", "category", "categorySource", "status",
  "language", "stars", "updatedAt", "recommended", "description",
  "features", "tags", "github", "demo", "docs", "note", "aiCategory",
  "aiConfidence", "aiReason", "aiModel", "aiClassifiedAt",
  "latestReleaseAt", "latestCommitAt", "activityCheckedAt"
)
SELECT
  "id", "name", "author", "category", "categorySource", "status",
  "language", "stars", "updatedAt", "recommended", "description",
  "features", "tags", "canonicalGithub", "demo", "docs", "note", "aiCategory",
  "aiConfidence", "aiReason", "aiModel", "aiClassifiedAt",
  "latestReleaseAt", "latestCommitAt", "activityCheckedAt"
FROM "Project"
JOIN "ProjectGithubCanonicalPreflight"
  ON "ProjectGithubCanonicalPreflight"."projectId" = "Project"."id";

DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_github_key" ON "Project"("github");
DROP TABLE "ProjectGithubCanonicalPreflight";

COMMIT;
PRAGMA foreign_keys=ON;
