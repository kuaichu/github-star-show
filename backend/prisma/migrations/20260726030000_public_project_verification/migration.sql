-- Legacy Project rows predate authoritative GitHub visibility checks. Keep
-- them off the anonymous catalogue until a trusted import or sync verifies
-- the repository as explicitly public.
BEGIN IMMEDIATE;

ALTER TABLE "Project" ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "visibilityVerifiedAt" DATETIME;

COMMIT;
