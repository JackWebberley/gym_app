-- The wall-clock time Strava recorded, kept as text.
--
-- startedAt is an instant, and rendering it lands in the server's timezone on a
-- server component and the browser's on a client one — the same run showed two
-- different times on the Strava page and in the new-activity popup. This column
-- is sliced, never converted, so every screen agrees with the watch.
--
-- Empty for rows imported before this; a re-sync fills them in, and until then
-- the formatter falls back to the instant.
ALTER TABLE "StravaActivity" ADD COLUMN "startedLocal" TEXT NOT NULL DEFAULT '';
