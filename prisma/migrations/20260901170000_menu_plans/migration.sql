-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT;

-- Adopt whatever plan is currently in play, so an existing menu does not become
-- orphaned the moment plans become switchable.
UPDATE "Menu" SET "isActive" = true
WHERE "id" = (SELECT "id" FROM "Menu" ORDER BY "createdAt" DESC LIMIT 1);

-- Name any plan that predates naming, after the week it was made for.
UPDATE "Menu" SET "name" = 'Week of ' || "weekStart" WHERE "name" IS NULL;
