-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "cooksForTwo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "partnerCalories" INTEGER NOT NULL DEFAULT 1700,
ADD COLUMN     "partnerProteinG" INTEGER NOT NULL DEFAULT 110,
ADD COLUMN     "splitBreakfast" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
ADD COLUMN     "splitDinner" DOUBLE PRECISION NOT NULL DEFAULT 0.28,
ADD COLUMN     "splitLunch" DOUBLE PRECISION NOT NULL DEFAULT 0.26,
ADD COLUMN     "splitSnack" DOUBLE PRECISION NOT NULL DEFAULT 0.26;

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aisle" TEXT NOT NULL,
    "isStaple" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeDays" INTEGER NOT NULL,
    "freezable" BOOLEAN NOT NULL DEFAULT false,
    "unitGrams" DOUBLE PRECISION,
    "kcalPer100g" DOUBLE PRECISION NOT NULL,
    "proteinPer100g" DOUBLE PRECISION NOT NULL,
    "carbsPer100g" DOUBLE PRECISION NOT NULL,
    "fatPer100g" DOUBLE PRECISION NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackSize" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "priceGbp" DOUBLE PRECISION,
    "isDivisible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PackSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "prepMinutes" INTEGER NOT NULL DEFAULT 30,
    "method" TEXT NOT NULL DEFAULT '',
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "timesCooked" INTEGER NOT NULL DEFAULT 0,
    "batchFriendly" BOOLEAN NOT NULL DEFAULT false,
    "leftoversFreeze" BOOLEAN NOT NULL DEFAULT false,
    "keepsDays" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCookedAt" TIMESTAMP(3),

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "grams" DOUBLE PRECISION NOT NULL,
    "isScalable" BOOLEAN NOT NULL DEFAULT false,
    "minGrams" DOUBLE PRECISION,
    "maxGrams" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "expiresOn" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "briefJson" TEXT NOT NULL DEFAULT '{}',
    "estimatedCostGbp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectedWasteGbp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "shoppedAt" TIMESTAMP(3),

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCook" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "cookedAt" TIMESTAMP(3),

    CONSTRAINT "MenuCook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portion" (
    "id" TEXT NOT NULL,
    "menuCookId" TEXT NOT NULL,
    "eater" TEXT NOT NULL,
    "scaleFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "calories" INTEGER NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "expiresOn" TEXT,
    "eatenOn" TEXT,
    "foodEntryId" TEXT,

    CONSTRAINT "Portion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingLine" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "packSizeId" TEXT,
    "packCount" INTEGER NOT NULL DEFAULT 1,
    "gramsNeeded" DOUBLE PRECISION NOT NULL,
    "gramsFromPantry" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gramsBought" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "surplusGrams" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceGbp" DOUBLE PRECISION,
    "wasteCostGbp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isTicked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShoppingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_aisle_idx" ON "Ingredient"("aisle");

-- CreateIndex
CREATE INDEX "Ingredient_needsReview_idx" ON "Ingredient"("needsReview");

-- CreateIndex
CREATE INDEX "PackSize_ingredientId_idx" ON "PackSize"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_name_key" ON "Recipe"("name");

-- CreateIndex
CREATE INDEX "Recipe_mealType_idx" ON "Recipe"("mealType");

-- CreateIndex
CREATE INDEX "Recipe_isArchived_idx" ON "Recipe"("isArchived");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_order_idx" ON "RecipeIngredient"("recipeId", "order");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "PantryItem_ingredientId_idx" ON "PantryItem"("ingredientId");

-- CreateIndex
CREATE INDEX "PantryItem_expiresOn_idx" ON "PantryItem"("expiresOn");

-- CreateIndex
CREATE INDEX "Menu_weekStart_idx" ON "Menu"("weekStart");

-- CreateIndex
CREATE INDEX "Menu_status_idx" ON "Menu"("status");

-- CreateIndex
CREATE INDEX "MenuCook_menuId_order_idx" ON "MenuCook"("menuId", "order");

-- CreateIndex
CREATE INDEX "MenuCook_recipeId_idx" ON "MenuCook"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Portion_foodEntryId_key" ON "Portion"("foodEntryId");

-- CreateIndex
CREATE INDEX "Portion_menuCookId_idx" ON "Portion"("menuCookId");

-- CreateIndex
CREATE INDEX "Portion_status_idx" ON "Portion"("status");

-- CreateIndex
CREATE INDEX "ShoppingLine_menuId_idx" ON "ShoppingLine"("menuId");

-- CreateIndex
CREATE INDEX "ShoppingLine_ingredientId_idx" ON "ShoppingLine"("ingredientId");

-- CreateIndex
CREATE INDEX "ShoppingLine_packSizeId_idx" ON "ShoppingLine"("packSizeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingLine_menuId_ingredientId_key" ON "ShoppingLine"("menuId", "ingredientId");

-- AddForeignKey
ALTER TABLE "PackSize" ADD CONSTRAINT "PackSize_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCook" ADD CONSTRAINT "MenuCook_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCook" ADD CONSTRAINT "MenuCook_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portion" ADD CONSTRAINT "Portion_menuCookId_fkey" FOREIGN KEY ("menuCookId") REFERENCES "MenuCook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingLine" ADD CONSTRAINT "ShoppingLine_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingLine" ADD CONSTRAINT "ShoppingLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingLine" ADD CONSTRAINT "ShoppingLine_packSizeId_fkey" FOREIGN KEY ("packSizeId") REFERENCES "PackSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same lockdown as 20260901130000: RLS enabled with no policies, so every role
-- but the table owner is denied. The default-privileges rule from that migration
-- already covers the grants on these new tables; RLS is not covered by it and
-- has to be stated per table.
ALTER TABLE "Ingredient"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackSize"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Recipe"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecipeIngredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PantryItem"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Menu"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuCook"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portion"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShoppingLine"     ENABLE ROW LEVEL SECURITY;
