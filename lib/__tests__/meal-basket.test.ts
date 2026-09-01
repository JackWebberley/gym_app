import { describe, expect, it } from "vitest";
import { buildBasket, wasteWeight } from "../meal/basket";
import type { IngredientSpec } from "../meal/types";

function ingredient(partial: Partial<IngredientSpec> & { id: string }): IngredientSpec {
  return {
    name: partial.id,
    aisle: "produce",
    isStaple: false,
    shelfLifeDays: 30,
    freezable: false,
    unitGrams: null,
    kcalPer100g: 50,
    proteinPer100g: 1,
    carbsPer100g: 8,
    fatPer100g: 0.2,
    packs: [],
    ...partial,
  };
}

const ONION = ingredient({
  id: "onion",
  name: "Onion",
  shelfLifeDays: 30,
  unitGrams: 110,
  packs: [{ id: "onion-3", label: "pack of 3", grams: 330, priceGbp: 0.99, isDivisible: false }],
});

const BASIL = ingredient({
  id: "basil",
  name: "Fresh basil",
  // Fresh herbs are the case the shelf-life weighting exists for.
  shelfLifeDays: 3,
  packs: [{ id: "basil-30", label: "30g pack", grams: 30, priceGbp: 1.5, isDivisible: false }],
});

const POTATO = ingredient({
  id: "potato",
  name: "Potatoes",
  shelfLifeDays: 30,
  unitGrams: 180,
  packs: [{ id: "spud-bag", label: "2.5kg bag", grams: 2500, priceGbp: 2.5, isDivisible: false }],
});

const PEAS = ingredient({
  id: "peas",
  name: "Frozen peas",
  freezable: true,
  shelfLifeDays: 200,
  packs: [{ id: "peas-900", label: "900g bag", grams: 900, priceGbp: 1.4, isDivisible: false }],
});

const OIL = ingredient({
  id: "oil",
  name: "Olive oil",
  isStaple: true,
  shelfLifeDays: 365,
  packs: [{ id: "oil-500", label: "500ml", grams: 500, priceGbp: 4, isDivisible: false }],
});

const ALL = [ONION, BASIL, POTATO, PEAS, OIL];

describe("wasteWeight", () => {
  it("charges a staple nothing", () => {
    expect(wasteWeight(OIL)).toBe(0);
  });

  it("charges a little for something short-lived that has to be frozen to survive", () => {
    // Chicken keeps three days in the fridge. Freezing rescues most of the value
    // but costs freezer space and a thawing decision later.
    const chicken = ingredient({ id: "chicken", shelfLifeDays: 3, freezable: true });
    expect(wasteWeight(chicken)).toBe(0.15);
  });

  it("charges a third for something that survives to next week", () => {
    expect(wasteWeight(POTATO)).toBe(0.3);
  });

  it("charges the full value for something that spoils first", () => {
    expect(wasteWeight(BASIL)).toBe(1);
  });

  it("barely charges store-cupboard stock, which is inventory rather than waste", () => {
    // A 500g jar of mayonnaise opened for 60g of use is not a £0.58 loss; the jar
    // gets finished. Charging it as waste makes the optimiser avoid condiments.
    const mayo = ingredient({ id: "mayo", aisle: "condiment", shelfLifeDays: 120 });
    const tinned = ingredient({ id: "beans", aisle: "tinned", shelfLifeDays: 730 });
    expect(wasteWeight(mayo)).toBe(0.05);
    expect(wasteWeight(tinned)).toBe(0.05);
  });

  it("treats a bag of frozen peas as stock, not as waste", () => {
    // Already frozen and good for months: the discriminator is whether a thing
    // survives on its own, not which appliance it lives in.
    expect(wasteWeight(PEAS)).toBe(0.05);
  });

  it("ranks the tiers the way the spec argues they should rank", () => {
    const chicken = ingredient({ id: "chicken", shelfLifeDays: 3, freezable: true });
    expect(wasteWeight(OIL)).toBeLessThan(wasteWeight(PEAS));
    expect(wasteWeight(PEAS)).toBeLessThan(wasteWeight(chicken));
    expect(wasteWeight(chicken)).toBeLessThan(wasteWeight(POTATO));
    expect(wasteWeight(POTATO)).toBeLessThan(wasteWeight(BASIL));
  });

  it("is about perishability, not pack size", () => {
    // The spec's central nuance (§8.4): a 2.5kg potato surplus must cost less
    // than a 30g basil surplus, or the optimiser fights the wrong problem.
    const potatoSurplus = 2000 * (2.5 / 2500) * wasteWeight(POTATO);
    const basilSurplus = 25 * (1.5 / 30) * wasteWeight(BASIL);
    expect(potatoSurplus).toBeLessThan(basilSurplus);
  });
});

describe("buildBasket", () => {
  it("charges one pack of onions for one onion, and nothing more for the second recipe", () => {
    // The onion problem, and the reason the optimiser costs baskets rather than
    // recipes: the second recipe's onions are free.
    const one = buildBasket(new Map([["onion", 110]]), ALL, []);
    const two = buildBasket(new Map([["onion", 330]]), ALL, []);

    expect(one.totalCostGbp).toBe(0.99);
    expect(two.totalCostGbp).toBe(0.99);
    expect(one.totalWasteGbp).toBeGreaterThan(0);
    expect(two.totalWasteGbp).toBe(0);
  });

  it("keeps the potato bag cheap and the basil pack expensive", () => {
    const potato = buildBasket(new Map([["potato", 500]]), ALL, []);
    const basil = buildBasket(new Map([["basil", 5]]), ALL, []);
    expect(potato.totalWasteGbp).toBeLessThan(basil.totalWasteGbp);
  });

  it("never costs or wastes a staple", () => {
    const basket = buildBasket(new Map([["oil", 40]]), ALL, []);
    expect(basket.totalCostGbp).toBe(0);
    expect(basket.totalWasteGbp).toBe(0);
    expect(basket.lines[0].isStaple).toBe(true);
  });

  it("spends the pantry before the shop", () => {
    const basket = buildBasket(
      new Map([["onion", 330]]),
      ALL,
      [{ ingredientId: "onion", grams: 220, expiresOn: "2026-09-10" }],
    );
    const line = basket.lines.find((l) => l.ingredientId === "onion")!;
    expect(line.gramsFromPantry).toBe(220);
    expect(line.gramsToBuy).toBe(110);
    expect(basket.pantrySavingGbp).toBeGreaterThan(0);
  });

  it("charges for pantry stock left to rot inside the horizon", () => {
    const ignored = buildBasket(new Map([["basil", 0]]), ALL, [
      { ingredientId: "basil", grams: 30, expiresOn: "2026-09-03" },
    ], { horizonDayKey: "2026-09-08" });

    const used = buildBasket(new Map([["basil", 30]]), ALL, [
      { ingredientId: "basil", grams: 30, expiresOn: "2026-09-03" },
    ], { horizonDayKey: "2026-09-08" });

    expect(ignored.pantryRotGbp).toBeGreaterThan(0);
    expect(used.pantryRotGbp).toBe(0);
  });

  it("flags an ingredient it has no pack data for rather than guessing a price", () => {
    const unknown = ingredient({ id: "yuzu", name: "Yuzu", packs: [] });
    const basket = buildBasket(new Map([["yuzu", 50]]), [unknown], []);
    expect(basket.unknownIngredientIds).toEqual(["yuzu"]);
    expect(basket.lines[0].needsPackData).toBe(true);
    expect(basket.lines[0].priceGbp).toBeNull();
  });

  it("groups the shop by aisle", () => {
    const dairy = ingredient({ id: "feta", name: "Feta", aisle: "dairy" });
    const basket = buildBasket(
      new Map([
        ["onion", 110],
        ["feta", 40],
      ]),
      [...ALL, dairy],
      [],
    );
    expect(basket.lines.map((l) => l.aisle)).toEqual(["dairy", "produce"]);
  });
});
