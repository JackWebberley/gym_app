-- Additive activity model, replacing the two fixed day types.
--
-- Before: every day was either 2400 or, if you played golf, 2800. After: a
-- 2200 rest-day baseline with an allowance added per activity ticked, capped.

-- ── Settings ────────────────────────────────────────────────────────────────
-- Renamed rather than dropped-and-added so the column keeps its identity; the
-- value is then set to the new model's baseline, which is a different quantity
-- from the old all-in figure and not a conversion of it.
ALTER TABLE "Settings" RENAME COLUMN "baseCalories" TO "baselineCalories";
ALTER TABLE "Settings" ALTER COLUMN "baselineCalories" SET DEFAULT 2200;
UPDATE "Settings" SET "baselineCalories" = 2200;

-- Superseded: golf is now an allowance, not a whole separate day.
ALTER TABLE "Settings" DROP COLUMN "golfDayCalories";

ALTER TABLE "Settings"
  ADD COLUMN "calorieCap"         INTEGER          NOT NULL DEFAULT 2900,
  ADD COLUMN "addOnScalePercent"  INTEGER          NOT NULL DEFAULT 100,
  ADD COLUMN "gymCalories"        INTEGER          NOT NULL DEFAULT 200,
  ADD COLUMN "golfCalories"       INTEGER          NOT NULL DEFAULT 600,
  ADD COLUMN "runShortCalories"   INTEGER          NOT NULL DEFAULT 200,
  ADD COLUMN "runMediumCalories"  INTEGER          NOT NULL DEFAULT 350,
  ADD COLUMN "runLongCalories"    INTEGER          NOT NULL DEFAULT 500,
  ADD COLUMN "walkShortCalories"  INTEGER          NOT NULL DEFAULT 75,
  ADD COLUMN "walkMediumCalories" INTEGER          NOT NULL DEFAULT 150,
  ADD COLUMN "walkLongCalories"   INTEGER          NOT NULL DEFAULT 250,
  ADD COLUMN "bandShortMaxKm"     DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN "bandMediumMaxKm"    DOUBLE PRECISION NOT NULL DEFAULT 10;

-- ── DayLog ──────────────────────────────────────────────────────────────────
ALTER TABLE "DayLog"
  ADD COLUMN "gym"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "golf"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "runBand"     TEXT,
  ADD COLUMN "walkBand"    TEXT,
  ADD COLUMN "runKm"       DOUBLE PRECISION,
  ADD COLUMN "walkKm"      DOUBLE PRECISION,
  ADD COLUMN "targetParts" TEXT NOT NULL DEFAULT '[]';

-- Carry the one thing the old column actually recorded across before dropping
-- it. calorieTarget is deliberately left alone: those days were logged against
-- the figure stored on them, and re-pricing history under a new model would be
-- exactly the retroactive rewrite the snapshot exists to prevent.
UPDATE "DayLog" SET "golf" = true WHERE "dayType" = 'golf';

ALTER TABLE "DayLog" DROP COLUMN "dayType";
