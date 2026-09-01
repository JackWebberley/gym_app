import "dotenv/config";
import { getPlanningContext } from "./lib/meal-queries.ts";
import { solve } from "./lib/meal/optimiser.ts";
import { describeQuantity, formatGrams } from "./lib/meal/packs.ts";

const ctx = await getPlanningContext();
console.log(
  `Library: ${ctx.recipes.length} recipes, ${ctx.ingredients.length} ingredients, ${ctx.pantry.length} pantry items`,
);
console.log(
  `Envelopes — my dinner ${Math.round(ctx.envelopes.me.dinner.targetKcal)} kcal, hers ${Math.round(ctx.envelopes.partner.dinner.targetKcal)} kcal`,
);

const started = Date.now();
const solution = solve({
  brief: {
    weekStart: "2026-09-07",
    occasions: [
      { mealType: "breakfast", count: 5 },
      { mealType: "lunch", count: 5 },
      { mealType: "dinner", count: 4 },
    ],
    minDistinct: { breakfast: 2, lunch: 2, dinner: 3 },
    cookConfidence: "flexible",
    maxPrepMinutes: null,
    avoidIngredientIds: [],
    cooksForTwo: ctx.cooksForTwo,
  },
  candidates: ctx.recipes,
  ingredients: ctx.ingredients,
  pantry: ctx.pantry,
  envelopes: ctx.envelopes,
  seed: 12345,
  horizonDayKey: "2026-09-14",
});
const elapsed = Date.now() - started;

console.log(`\nSolved in ${elapsed}ms\n`);
console.log("THE MENU");
for (const cook of solution.cooks) {
  const mine = cook.portions.filter((p) => p.eater === "me");
  const hers = cook.portions.filter((p) => p.eater === "partner");
  console.log(
    `  ${cook.recipeName.padEnd(38)} ${cook.occasions} × for two   me ${mine[0]?.macros.calories}kcal/${mine[0]?.macros.proteinG}p  her ${hers[0]?.macros.calories}kcal  (scale ${mine[0]?.scaleFactor} / ${hers[0]?.scaleFactor})`,
  );
}
if (solution.gaps.length) console.log("  GAPS:", solution.gaps);

console.log("\nTHE SHOP");
let aisle = "";
for (const line of solution.basket.lines) {
  if (line.aisle !== aisle) {
    aisle = line.aisle;
    console.log(`  ${aisle.toUpperCase()}`);
  }
  if (line.isStaple) {
    console.log(`    (staple) ${line.name} ${formatGrams(line.gramsNeeded)}`);
    continue;
  }
  const surplus =
    line.surplusGrams > 0.5 ? `  ⚠ ${formatGrams(line.surplusGrams)} spare (waste £${line.wasteCostGbp.toFixed(2)})` : "";
  console.log(
    `    ${line.name.padEnd(30)} ${(line.pack?.label ?? "?").padEnd(16)} need ${describeQuantity(line.gramsNeeded, null).padEnd(8)} £${(line.priceGbp ?? 0).toFixed(2)}${surplus}`,
  );
}

console.log("\nREADOUT");
console.log(`  Shop            £${solution.basket.totalCostGbp.toFixed(2)}`);
console.log(
  `  Projected waste £${solution.basket.totalWasteGbp.toFixed(2)} (${((solution.basket.totalWasteGbp / Math.max(solution.basket.totalCostGbp, 0.01)) * 100).toFixed(1)}%)`,
);
console.log(`  Unknown packs   ${solution.basket.unknownIngredientIds.length}`);
console.log("\nSCORE BREAKDOWN");
for (const [k, v] of Object.entries(solution.breakdown)) {
  console.log(`  ${k.padEnd(20)} ${typeof v === "number" ? v.toFixed(2) : v}`);
}

process.exit(0);
