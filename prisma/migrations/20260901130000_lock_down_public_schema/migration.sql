-- This app talks to Postgres only from its own server, through Prisma, as the
-- table owner. Nothing should ever reach these tables via PostgREST with the
-- project's publishable key.
--
-- ENABLE (not FORCE) row level security: with no policies attached, every role
-- except the table owner is denied everything. The owner bypasses RLS, which is
-- how Prisma keeps working untouched. FORCE would lock the app out too.

ALTER TABLE "Exercise"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseGroup"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseGroupItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cycle"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CycleSlot"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SetLog"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Settings"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLog"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoodEntry"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedFood"         ENABLE ROW LEVEL SECURITY;

-- Defence in depth: Supabase grants the anon and authenticated roles table
-- privileges by default. RLS already denies them, but there is no reason for the
-- grants to exist at all in a server-only app.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;

-- Same treatment for anything added later, so a new table cannot quietly ship
-- exposed.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
