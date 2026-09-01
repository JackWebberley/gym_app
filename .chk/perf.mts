import "dotenv/config";
import { getPlanningContext } from "../lib/meal-queries.ts";
import { solve } from "../lib/meal/optimiser.ts";

const ctx = await getPlanningContext();
console.log(`candidates: ${ctx.recipes.length}, ingredients: ${ctx.ingredients.length}\n`);

for (const [label, occ] of [
  ["small (4 dinners)", [{ mealType: "dinner" as const, count: 4 }]],
  ["typical (5/5/5)", [
    { mealType: "breakfast" as const, count: 5 },
    { mealType: "lunch" as const, count: 5 },
    { mealType: "dinner" as const, count: 5 },
  ]],
  ["big (7/7/7)", [
    { mealType: "breakfast" as const, count: 7 },
    { mealType: "lunch" as const, count: 7 },
    { mealType: "dinner" as const, count: 7 },
  ]],
] as const) {
  const t = Date.now();
  solve({
    brief: {
      weekStart: "2026-09-07",
      occasions: occ as never,
      minDistinct: { breakfast: 3, lunch: 3, dinner: 4 },
      cookConfidence: "flexible",
      maxPrepMinutes: null,
      avoidIngredientIds: [],
      cooksForTwo: true,
    },
    candidates: ctx.recipes,
    ingredients: ctx.ingredients,
    pantry: ctx.pantry,
    envelopes: ctx.envelopes,
    seed: 99,
    horizonDayKey: "2026-09-14",
  });
  console.log(`  ${label.padEnd(20)} ${Date.now() - t}ms`);
}
process.exit(0);
