-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "isUnilateral" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "restSeconds" INTEGER NOT NULL DEFAULT 120,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseGroupItem" (
    "id" TEXT NOT NULL,
    "exerciseGroupId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER NOT NULL DEFAULT 3,
    "targetRepMin" INTEGER NOT NULL DEFAULT 8,
    "targetRepMax" INTEGER NOT NULL DEFAULT 12,

    CONSTRAINT "ExerciseGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleSlot" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "exerciseGroupId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CycleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "exerciseGroupId" TEXT,
    "cycleId" TEXT,
    "cycleSlotId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "bodyweightKg" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "rpe" DOUBLE PRECISION,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "isFailure" BOOLEAN NOT NULL DEFAULT false,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "baseCalories" INTEGER NOT NULL DEFAULT 2400,
    "golfDayCalories" INTEGER NOT NULL DEFAULT 2800,
    "proteinTargetG" INTEGER NOT NULL DEFAULT 160,
    "weeklyLossTargetKg" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
    "heightCm" INTEGER,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayLog" (
    "date" TEXT NOT NULL,
    "dayType" TEXT NOT NULL DEFAULT 'base',
    "calorieTarget" INTEGER NOT NULL,
    "proteinTarget" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "steps" INTEGER,

    CONSTRAINT "DayLog_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "FoodEntry" (
    "id" TEXT NOT NULL,
    "dayLogDate" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" TEXT,
    "assumptions" TEXT,
    "savedFoodId" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "calories" INTEGER NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "timesLogged" INTEGER NOT NULL DEFAULT 0,
    "lastLoggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedFood_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- CreateIndex
CREATE INDEX "Exercise_muscleGroup_idx" ON "Exercise"("muscleGroup");

-- CreateIndex
CREATE INDEX "ExerciseGroupItem_exerciseGroupId_order_idx" ON "ExerciseGroupItem"("exerciseGroupId", "order");

-- CreateIndex
CREATE INDEX "ExerciseGroupItem_exerciseId_idx" ON "ExerciseGroupItem"("exerciseId");

-- CreateIndex
CREATE INDEX "CycleSlot_cycleId_position_idx" ON "CycleSlot"("cycleId", "position");

-- CreateIndex
CREATE INDEX "CycleSlot_exerciseGroupId_idx" ON "CycleSlot"("exerciseGroupId");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "Session_endedAt_idx" ON "Session"("endedAt");

-- CreateIndex
CREATE INDEX "Session_exerciseGroupId_idx" ON "Session"("exerciseGroupId");

-- CreateIndex
CREATE INDEX "Session_cycleId_idx" ON "Session"("cycleId");

-- CreateIndex
CREATE INDEX "Session_cycleSlotId_idx" ON "Session"("cycleSlotId");

-- CreateIndex
CREATE INDEX "SetLog_exerciseId_loggedAt_idx" ON "SetLog"("exerciseId", "loggedAt");

-- CreateIndex
CREATE INDEX "SetLog_sessionId_idx" ON "SetLog"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SetLog_sessionId_exerciseId_setNumber_key" ON "SetLog"("sessionId", "exerciseId", "setNumber");

-- CreateIndex
CREATE INDEX "FoodEntry_dayLogDate_idx" ON "FoodEntry"("dayLogDate");

-- CreateIndex
CREATE INDEX "FoodEntry_savedFoodId_idx" ON "FoodEntry"("savedFoodId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedFood_name_key" ON "SavedFood"("name");

-- CreateIndex
CREATE INDEX "SavedFood_timesLogged_idx" ON "SavedFood"("timesLogged");

-- AddForeignKey
ALTER TABLE "ExerciseGroupItem" ADD CONSTRAINT "ExerciseGroupItem_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "ExerciseGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseGroupItem" ADD CONSTRAINT "ExerciseGroupItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleSlot" ADD CONSTRAINT "CycleSlot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleSlot" ADD CONSTRAINT "CycleSlot_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "ExerciseGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_exerciseGroupId_fkey" FOREIGN KEY ("exerciseGroupId") REFERENCES "ExerciseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_cycleSlotId_fkey" FOREIGN KEY ("cycleSlotId") REFERENCES "CycleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_dayLogDate_fkey" FOREIGN KEY ("dayLogDate") REFERENCES "DayLog"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_savedFoodId_fkey" FOREIGN KEY ("savedFoodId") REFERENCES "SavedFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;
