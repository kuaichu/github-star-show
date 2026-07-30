-- Authentication hardening intentionally invalidates legacy sessions and
-- clears legacy plaintext GitHub tokens. Users must sign in again; subsequent
-- tokens are stored as versioned AES-256-GCM envelopes by the application.
BEGIN IMMEDIATE;

DELETE FROM "Session";
UPDATE "GithubAccount" SET "accessToken" = '';

CREATE TABLE "OAuthState" (
  "stateHash" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

COMMIT;
