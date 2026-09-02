/// Plain domain types for the planner. Deliberately free of Prisma: everything
/// under lib/meal is pure, so the optimiser can be tested on hand-written
/// fixtures rather than against a database (spec §11).

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/// Only "me" ever reaches a DayLog. "partner" exists so the shop is sized for two
/// and the pool knows when food is gone.
export type Eater = "me" | "partner";

export const AISLES = [
  "produce",
  "meat",
  "fish",
  "dairy",
  "bakery",
  "dry",
  "tinned",
  "frozen",
  "condiment",
] as const;

export type Aisle = (typeof AISLES)[number];

export type Macros = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const ZERO_MACROS: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export type PackSpec = {
  id: string;
  label: string;
  grams: number;
  priceGbp: number | null;
  /// Loose produce: buy exactly what is needed, so surplus is always zero.
  isDivisible: boolean;
};

export type IngredientSpec = {
  id: string;
  name: string;
  aisle: string;
  isStaple: boolean;
  shelfLifeDays: number;
  freezable: boolean;
  unitGrams: number | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  packs: PackSpec[];
};

export type RecipeLineSpec = {
  ingredientId: string;
  /// Grams for one base portion, at a scale factor of 1.
  grams: number;
  isScalable: boolean;
  minGrams: number | null;
  maxGrams: number | null;
};

export type RecipeSpec = {
  id: string;
  name: string;
  mealType: MealType;
  prepMinutes: number;
  isFavourite: boolean;
  batchFriendly: boolean;
  leftoversFreeze: boolean;
  keepsDays: number;
  lines: RecipeLineSpec[];
};

export type PantryStock = {
  ingredientId: string;
  grams: number;
  /// "YYYY-MM-DD"
  expiresOn: string;
};

/// What a meal of this type, for this person, is supposed to land on. Recipes are
/// fitted to these rather than to a particular day, because a portion in the pool
/// can be eaten on any day.
export type Envelope = {
  mealType: MealType;
  eater: Eater;
  targetKcal: number;
  minKcal: number;
  maxKcal: number;
  minProteinG: number;
};

export type EnvelopeTable = Record<Eater, Record<MealType, Envelope>>;

/// How much faith to put in the week's cooking actually happening. Drives the
/// slippage term: the less certain the week, the harder the optimiser leans on
/// recipes that survive a change of plan.
export type CookConfidence = "flexible" | "likely" | "certain";

export const SLIP_PROBABILITY: Record<CookConfidence, number> = {
  flexible: 0.35,
  likely: 0.15,
  certain: 0.03,
};

export type Occasion = {
  mealType: MealType;
  /// How many meals of this type the week needs covering.
  count: number;
};

export type Brief = {
  weekStart: string;
  occasions: Occasion[];
  /// Minimum distinct recipes per meal type. Fewer is cheaper and less wasteful
  /// (spec §8.6); this is the user saying how much sameness they will tolerate.
  minDistinct: Partial<Record<MealType, number>>;
  cookConfidence: CookConfidence;
  maxPrepMinutes: number | null;
  avoidIngredientIds: string[];
  cooksForTwo: boolean;
};

export const DEFAULT_BRIEF: Omit<Brief, "weekStart"> = {
  occasions: [
    { mealType: "breakfast", count: 5 },
    { mealType: "lunch", count: 5 },
    { mealType: "dinner", count: 4 },
  ],
  minDistinct: { breakfast: 3, lunch: 4, dinner: 4 },
  cookConfidence: "flexible",
  maxPrepMinutes: null,
  avoidIngredientIds: [],
  cooksForTwo: true,
};
