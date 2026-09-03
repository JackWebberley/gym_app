-- Strava import.
--
-- A workout logged on a watch should not need logging again by hand.

-- What Strava last set on a day, so a re-sync can tell its own ticks from ones
-- pressed by hand and leave yours alone.
ALTER TABLE "DayLog" ADD COLUMN "stravaTicks" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "StravaAccount" (
    "id"             TEXT         NOT NULL DEFAULT 'singleton',
    "athleteId"      TEXT         NOT NULL,
    "athleteName"    TEXT,
    "accessToken"    TEXT         NOT NULL,
    "refreshToken"   TEXT         NOT NULL,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "scope"          TEXT         NOT NULL,
    "connectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" TEXT,
    "lastSyncedAt"   TIMESTAMP(3),

    CONSTRAINT "StravaAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StravaAccount_athleteId_key" ON "StravaAccount"("athleteId");

-- Strava ids are past 2^53 and JSON has one number type, so they are text here
-- and everywhere else they travel.
CREATE TABLE "StravaActivity" (
    "id"               TEXT             NOT NULL,
    "dayKey"           TEXT             NOT NULL,
    "name"             TEXT             NOT NULL,
    "sportType"        TEXT             NOT NULL,
    "startedAt"        TIMESTAMP(3)     NOT NULL,
    "distanceM"        DOUBLE PRECISION NOT NULL,
    "movingSeconds"    INTEGER          NOT NULL,
    "elapsedSeconds"   INTEGER          NOT NULL,
    "elevationM"       DOUBLE PRECISION,
    "stravaCalories"   DOUBLE PRECISION,
    "averageHeartRate" DOUBLE PRECISION,
    "maxHeartRate"     DOUBLE PRECISION,
    "mappedKind"       TEXT,
    "mappedBand"       TEXT,
    "seenAt"           TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StravaActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StravaActivity_dayKey_idx"    ON "StravaActivity"("dayKey");
CREATE INDEX "StravaActivity_seenAt_idx"    ON "StravaActivity"("seenAt");
CREATE INDEX "StravaActivity_startedAt_idx" ON "StravaActivity"("startedAt");

-- The webhook inbox. Strava wants a 200 within two seconds, which is not enough
-- time to fetch an activity and re-price a day on a cold worker, so events are
-- written here, acknowledged, and processed afterwards.
CREATE TABLE "StravaEvent" (
    "id"          TEXT         NOT NULL,
    "objectType"  TEXT         NOT NULL,
    "objectId"    TEXT         NOT NULL,
    "aspectType"  TEXT         NOT NULL,
    "ownerId"     TEXT         NOT NULL,
    "eventTime"   TIMESTAMP(3) NOT NULL,
    "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error"       TEXT,

    CONSTRAINT "StravaEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StravaEvent_processedAt_idx" ON "StravaEvent"("processedAt");
