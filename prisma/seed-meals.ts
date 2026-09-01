import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { INGREDIENTS } from "./seed-ingredients.ts";

/// Seeds the ingredient/pack library and a starter recipe set (spec §8.9).
///
/// Re-running is safe and non-destructive. Ingredients are matched by name and
/// only their nutrition is refreshed — pack sizes and prices you have corrected
/// by hand are never overwritten, because your correction is better data than
/// this file's guess. Recipes are only created when absent.

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DIRECT_URL (or DATABASE_URL) before seeding.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type Line = {
  /** Ingredient name, exactly as seeded. */
  n: string;
  /** Grams for one base portion. */
  g: number;
  /** Scalable range, if the amount is one a person would actually adjust. */
  scale?: [number, number];
  note?: string;
};

type RecipeSeed = {
  name: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  prepMinutes: number;
  batchFriendly?: boolean;
  leftoversFreeze?: boolean;
  keepsDays?: number;
  method: string;
  lines: Line[];
};

/// Deliberately overlapping: chicken, onions, rice, tinned tomatoes and spinach
/// recur across several dishes so that even this small starter set gives the
/// optimiser something real to find. A library of ten unrelated recipes cannot
/// demonstrate ingredient economy, because there is no economy to find.
const RECIPES: RecipeSeed[] = [
  {
    name: "Chicken, rice and roasted veg",
    mealType: "dinner",
    prepMinutes: 35,
    batchFriendly: true,
    keepsDays: 3,
    method:
      "1. Heat oven to 200C.\n2. Toss peppers, courgette and red onion in oil, roast 25 min.\n3. Season chicken with paprika, add to tray for the last 18 min.\n4. Cook rice. Serve together with a squeeze of lemon.",
    lines: [
      { n: "Chicken breast", g: 180, scale: [120, 250] },
      { n: "Basmati rice", g: 75, scale: [50, 120], note: "dry weight" },
      { n: "Red pepper", g: 80 },
      { n: "Courgette", g: 100 },
      { n: "Red onion", g: 55 },
      { n: "Olive oil", g: 10 },
      { n: "Smoked paprika", g: 2 },
      { n: "Lemon", g: 15 },
    ],
  },
  {
    name: "Beef chilli",
    mealType: "dinner",
    prepMinutes: 40,
    batchFriendly: true,
    leftoversFreeze: true,
    keepsDays: 4,
    method:
      "1. Brown the mince, set aside.\n2. Soften onion, garlic and pepper.\n3. Return mince, add tomatoes, puree, kidney beans, cumin and chilli flakes.\n4. Simmer 25 min. Serve on rice.",
    lines: [
      { n: "Beef mince (5% fat)", g: 125, scale: [90, 180] },
      { n: "Kidney beans", g: 80, scale: [50, 120] },
      { n: "Chopped tomatoes", g: 200 },
      { n: "Basmati rice", g: 70, scale: [45, 110], note: "dry weight" },
      { n: "Onion", g: 55 },
      { n: "Red pepper", g: 60 },
      { n: "Garlic", g: 5 },
      { n: "Tomato puree", g: 12 },
      { n: "Cumin", g: 2 },
      { n: "Chilli flakes", g: 1 },
      { n: "Olive oil", g: 8 },
    ],
  },
  {
    name: "Salmon with new potatoes and greens",
    mealType: "dinner",
    prepMinutes: 30,
    keepsDays: 2,
    method:
      "1. Boil potatoes 18 min.\n2. Roast salmon 14 min at 200C with lemon.\n3. Steam broccoli and green beans.\n4. Dress with olive oil and black pepper.",
    lines: [
      { n: "Salmon fillet", g: 130, scale: [100, 180] },
      { n: "Potatoes", g: 250, scale: [150, 400] },
      { n: "Broccoli", g: 100 },
      { n: "Green beans", g: 70 },
      { n: "Lemon", g: 20 },
      { n: "Olive oil", g: 8 },
    ],
  },
  {
    name: "Chicken traybake with sweet potato",
    mealType: "dinner",
    prepMinutes: 40,
    batchFriendly: true,
    keepsDays: 3,
    method:
      "1. Heat oven to 200C.\n2. Cube sweet potato and red onion, toss with oil and harissa, roast 20 min.\n3. Add chicken thighs, roast 20 min more.\n4. Stir through spinach to wilt.",
    lines: [
      { n: "Chicken thigh (boneless)", g: 160, scale: [110, 230] },
      { n: "Sweet potato", g: 200, scale: [130, 320] },
      { n: "Red onion", g: 60 },
      { n: "Spinach", g: 50 },
      { n: "Harissa paste", g: 15 },
      { n: "Olive oil", g: 10 },
    ],
  },
  {
    name: "Chickpea and spinach curry",
    mealType: "dinner",
    prepMinutes: 30,
    batchFriendly: true,
    leftoversFreeze: true,
    keepsDays: 4,
    method:
      "1. Soften onion, garlic and ginger.\n2. Add curry powder, cook 1 min.\n3. Add chickpeas, tomatoes and coconut milk, simmer 20 min.\n4. Wilt in spinach. Serve with rice.",
    lines: [
      { n: "Chickpeas", g: 150, scale: [100, 220] },
      { n: "Coconut milk", g: 80, scale: [50, 120] },
      { n: "Chopped tomatoes", g: 150 },
      { n: "Basmati rice", g: 70, scale: [45, 110], note: "dry weight" },
      { n: "Spinach", g: 60 },
      { n: "Onion", g: 55 },
      { n: "Garlic", g: 6 },
      { n: "Ginger", g: 5 },
      { n: "Curry powder", g: 4 },
      { n: "Olive oil", g: 8 },
    ],
  },
  {
    name: "Pasta with tuna, tomato and chilli",
    mealType: "dinner",
    prepMinutes: 20,
    keepsDays: 2,
    method:
      "1. Cook pasta.\n2. Soften garlic and chilli flakes in oil.\n3. Add passata and tuna, warm through.\n4. Toss with pasta and parsley.",
    lines: [
      { n: "Pasta (penne)", g: 90, scale: [60, 140], note: "dry weight" },
      { n: "Tinned tuna", g: 80, scale: [55, 112] },
      { n: "Passata", g: 150 },
      { n: "Garlic", g: 6 },
      { n: "Chilli flakes", g: 1 },
      { n: "Fresh parsley", g: 5 },
      { n: "Olive oil", g: 10 },
    ],
  },
  {
    name: "Turkey meatballs in tomato sauce",
    mealType: "dinner",
    prepMinutes: 35,
    batchFriendly: true,
    leftoversFreeze: true,
    keepsDays: 3,
    method:
      "1. Mix mince with oregano and seasoning, roll into balls, brown.\n2. Soften onion and garlic, add passata, simmer 20 min.\n3. Return meatballs, finish 10 min.\n4. Serve with spaghetti.",
    lines: [
      { n: "Turkey mince (5% fat)", g: 130, scale: [95, 190] },
      { n: "Spaghetti", g: 85, scale: [55, 130], note: "dry weight" },
      { n: "Passata", g: 180 },
      { n: "Onion", g: 55 },
      { n: "Garlic", g: 6 },
      { n: "Dried oregano", g: 2 },
      { n: "Olive oil", g: 10 },
    ],
  },
  {
    name: "Halloumi and roasted veg couscous",
    mealType: "dinner",
    prepMinutes: 30,
    keepsDays: 3,
    method:
      "1. Roast pepper, courgette and red onion 25 min at 200C.\n2. Soak couscous in stock 6 min.\n3. Fry halloumi 2 min a side.\n4. Combine with lemon and parsley.",
    lines: [
      { n: "Halloumi", g: 90, scale: [60, 140] },
      { n: "Couscous", g: 70, scale: [45, 110], note: "dry weight" },
      { n: "Red pepper", g: 80 },
      { n: "Courgette", g: 100 },
      { n: "Red onion", g: 55 },
      { n: "Lemon", g: 15 },
      { n: "Fresh parsley", g: 5 },
      { n: "Olive oil", g: 10 },
      { n: "Stock cubes", g: 5 },
    ],
  },

  // ── Lunches ───────────────────────────────────────────────────────────────
  {
    name: "Chicken and salad wrap",
    mealType: "lunch",
    prepMinutes: 10,
    keepsDays: 1,
    method: "1. Warm the wrap.\n2. Fill with chicken, salad, cucumber and a little mayo.\n3. Roll tightly.",
    lines: [
      { n: "Chicken breast", g: 110, scale: [70, 170] },
      { n: "Wraps (wholemeal)", g: 62 },
      { n: "Salad leaves", g: 30 },
      { n: "Cucumber", g: 50 },
      { n: "Cherry tomatoes", g: 50 },
      { n: "Mayonnaise (light)", g: 12 },
    ],
  },
  {
    name: "Tuna and sweetcorn jacket potato",
    mealType: "lunch",
    prepMinutes: 15,
    keepsDays: 1,
    method: "1. Bake or microwave the potato until soft.\n2. Mix tuna, sweetcorn and mayo.\n3. Split and fill.",
    lines: [
      { n: "Potatoes", g: 280, scale: [180, 400] },
      { n: "Tinned tuna", g: 80, scale: [55, 112] },
      { n: "Sweetcorn", g: 60 },
      { n: "Mayonnaise (light)", g: 15 },
      { n: "Black pepper", g: 1 },
    ],
  },
  {
    name: "Lentil and vegetable soup",
    mealType: "lunch",
    prepMinutes: 35,
    batchFriendly: true,
    leftoversFreeze: true,
    keepsDays: 4,
    method:
      "1. Soften onion, carrot and leek.\n2. Add lentils, tomatoes and stock.\n3. Simmer 25 min.\n4. Season and blend half for body.",
    lines: [
      { n: "Red lentils", g: 70, scale: [45, 110], note: "dry weight" },
      { n: "Carrots", g: 80 },
      { n: "Leek", g: 70 },
      { n: "Onion", g: 55 },
      { n: "Chopped tomatoes", g: 100 },
      { n: "Stock cubes", g: 10 },
      { n: "Cumin", g: 2 },
      { n: "Olive oil", g: 8 },
      { n: "Wholemeal bread", g: 40, scale: [0, 80] },
    ],
  },
  {
    name: "Greek-style chicken salad",
    mealType: "lunch",
    prepMinutes: 15,
    keepsDays: 2,
    method: "1. Slice chicken, cucumber, tomatoes and red onion.\n2. Crumble over feta.\n3. Dress with oil, balsamic and oregano.",
    lines: [
      { n: "Chicken breast", g: 120, scale: [80, 180] },
      { n: "Feta", g: 40, scale: [25, 70] },
      { n: "Cucumber", g: 80 },
      { n: "Cherry tomatoes", g: 90 },
      { n: "Red onion", g: 30 },
      { n: "Salad leaves", g: 40 },
      { n: "Olive oil", g: 10 },
      { n: "Balsamic vinegar", g: 8 },
      { n: "Dried oregano", g: 1 },
    ],
  },
  {
    name: "Halloumi and chickpea pitta",
    mealType: "lunch",
    prepMinutes: 12,
    keepsDays: 1,
    method: "1. Fry halloumi.\n2. Warm chickpeas with harissa.\n3. Stuff the pitta with salad, chickpeas and halloumi.",
    lines: [
      { n: "Halloumi", g: 70, scale: [45, 110] },
      { n: "Chickpeas", g: 100, scale: [60, 160] },
      { n: "Pitta bread", g: 60 },
      { n: "Salad leaves", g: 30 },
      { n: "Harissa paste", g: 10 },
    ],
  },

  // ── Breakfasts ────────────────────────────────────────────────────────────
  {
    name: "Overnight oats with berries",
    mealType: "breakfast",
    prepMinutes: 5,
    batchFriendly: true,
    keepsDays: 3,
    method: "1. Mix oats, milk and yoghurt.\n2. Leave overnight.\n3. Top with berries in the morning.",
    lines: [
      { n: "Rolled oats", g: 60, scale: [40, 100] },
      { n: "Semi-skimmed milk", g: 150, scale: [100, 220] },
      { n: "Greek yoghurt (0% fat)", g: 80, scale: [50, 140] },
      { n: "Frozen berries", g: 70 },
      { n: "Honey", g: 8 },
    ],
  },
  {
    name: "Scrambled eggs on toast",
    mealType: "breakfast",
    prepMinutes: 10,
    keepsDays: 1,
    method: "1. Toast the bread.\n2. Scramble eggs gently with a knob of butter.\n3. Season well.",
    lines: [
      { n: "Eggs", g: 116, scale: [58, 174] },
      { n: "Wholemeal bread", g: 80, scale: [40, 120] },
      { n: "Butter", g: 6 },
      { n: "Black pepper", g: 1 },
    ],
  },
  {
    name: "Protein porridge",
    mealType: "breakfast",
    prepMinutes: 8,
    keepsDays: 1,
    method: "1. Cook oats in milk.\n2. Stir protein powder in off the heat.\n3. Top with banana and peanut butter.",
    lines: [
      { n: "Rolled oats", g: 60, scale: [40, 100] },
      { n: "Semi-skimmed milk", g: 250, scale: [150, 350] },
      { n: "Whey protein powder", g: 25, scale: [15, 40] },
      { n: "Banana", g: 100 },
      { n: "Peanut butter", g: 12 },
    ],
  },
  {
    name: "Greek yoghurt, banana and almonds",
    mealType: "breakfast",
    prepMinutes: 3,
    keepsDays: 1,
    method: "1. Spoon yoghurt into a bowl.\n2. Slice over banana, scatter almonds, drizzle honey.",
    lines: [
      { n: "Greek yoghurt (0% fat)", g: 200, scale: [140, 320] },
      { n: "Banana", g: 118 },
      { n: "Almonds", g: 20, scale: [10, 40] },
      { n: "Honey", g: 10 },
    ],
  },
  {
    name: "Mushroom and spinach omelette",
    mealType: "breakfast",
    prepMinutes: 12,
    keepsDays: 1,
    method: "1. Fry mushrooms until browned.\n2. Wilt spinach.\n3. Pour over beaten eggs, finish with cheddar.",
    lines: [
      { n: "Eggs", g: 116, scale: [58, 174] },
      { n: "Mushrooms", g: 80 },
      { n: "Spinach", g: 40 },
      { n: "Cheddar", g: 20, scale: [10, 40] },
      { n: "Olive oil", g: 8 },
    ],
  },
];

async function main() {
  // ── Ingredients and packs ────────────────────────────────────────────────
  let created = 0;
  let refreshed = 0;

  for (const seed of INGREDIENTS) {
    const existing = await db.ingredient.findUnique({
      where: { name: seed.name },
      include: { packs: true },
    });

    const [kcal, protein, carbs, fat] = seed.per100g;
    const nutrition = {
      aisle: seed.aisle,
      shelfLifeDays: seed.shelfLifeDays,
      freezable: seed.freezable ?? false,
      isStaple: seed.isStaple ?? false,
      unitGrams: seed.unitGrams ?? null,
      kcalPer100g: kcal,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
    };

    if (!existing) {
      await db.ingredient.create({
        data: {
          name: seed.name,
          ...nutrition,
          packs: {
            create: seed.packs.map((p) => ({
              label: p.label,
              grams: p.grams,
              priceGbp: p.priceGbp ?? null,
              isDivisible: p.isDivisible ?? false,
            })),
          },
        },
      });
      created++;
      continue;
    }

    // Nutrition is reference data and safe to refresh. Packs and prices are not:
    // a price you corrected after a real shop is better than this file's guess.
    await db.ingredient.update({
      where: { id: existing.id },
      data: { ...nutrition, needsReview: false },
    });

    for (const pack of seed.packs) {
      if (existing.packs.some((p) => p.label === pack.label)) continue;
      await db.packSize.create({
        data: {
          ingredientId: existing.id,
          label: pack.label,
          grams: pack.grams,
          priceGbp: pack.priceGbp ?? null,
          isDivisible: pack.isDivisible ?? false,
        },
      });
    }
    refreshed++;
  }

  console.log(`Ingredients: ${created} created, ${refreshed} refreshed.`);

  // ── Recipes ──────────────────────────────────────────────────────────────
  const ingredients = await db.ingredient.findMany({ select: { id: true, name: true } });
  const idByName = new Map(ingredients.map((i) => [i.name, i.id]));

  let recipesCreated = 0;
  for (const seed of RECIPES) {
    if (await db.recipe.findUnique({ where: { name: seed.name } })) continue;

    const missing = seed.lines.filter((l) => !idByName.has(l.n));
    if (missing.length > 0) {
      console.warn(`Skipping "${seed.name}": unknown ingredients ${missing.map((m) => m.n).join(", ")}`);
      continue;
    }

    await db.recipe.create({
      data: {
        name: seed.name,
        mealType: seed.mealType,
        prepMinutes: seed.prepMinutes,
        method: seed.method,
        batchFriendly: seed.batchFriendly ?? false,
        leftoversFreeze: seed.leftoversFreeze ?? false,
        keepsDays: seed.keepsDays ?? 3,
        source: "seed",
        items: {
          create: seed.lines.map((line, order) => ({
            ingredientId: idByName.get(line.n)!,
            order,
            grams: line.g,
            isScalable: Boolean(line.scale),
            minGrams: line.scale?.[0] ?? null,
            maxGrams: line.scale?.[1] ?? null,
            note: line.note ?? null,
          })),
        },
      },
    });
    recipesCreated++;
  }

  console.log(`Recipes: ${recipesCreated} created, ${RECIPES.length - recipesCreated} already present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
