import { describe, expect, it } from "vitest";
import { groupPool, type PooledServing } from "../meal/pool";

function serving(partial: Partial<PooledServing> & { id: string }): PooledServing {
  return {
    recipeName: "Some dish",
    mealType: "dinner",
    calories: 600,
    proteinG: 45,
    carbsG: 50,
    fatG: 20,
    isCooked: false,
    daysLeft: null,
    prepMinutes: 30,
    cookId: `cook-${partial.id}`,
    ...partial,
  };
}

describe("groupPool", () => {
  it("returns nothing for an empty pool", () => {
    expect(groupPool([])).toEqual([]);
  });

  it("folds identical servings into one row with a count", () => {
    const sections = groupPool([
      serving({ id: "a", recipeName: "Greek yoghurt", mealType: "breakfast" }),
      serving({ id: "b", recipeName: "Greek yoghurt", mealType: "breakfast" }),
      serving({ id: "c", recipeName: "Greek yoghurt", mealType: "breakfast" }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].count).toBe(3);
    expect(sections[0].count).toBe(3);
  });

  it("keeps cooked and uncooked servings of the same dish apart", () => {
    // One is food in the fridge, the other is a job. Merging them into "×2"
    // would hide the only distinction that matters.
    const sections = groupPool([
      serving({ id: "a", recipeName: "Chilli", isCooked: true, daysLeft: 2 }),
      serving({ id: "b", recipeName: "Chilli", isCooked: false }),
    ]);
    expect(sections[0].groups).toHaveLength(2);
    expect(sections[0].groups.map((g) => g.isCooked)).toEqual([true, false]);
  });

  it("splits by meal type, in the order of the day", () => {
    const sections = groupPool([
      serving({ id: "a", mealType: "dinner", recipeName: "Chilli" }),
      serving({ id: "b", mealType: "breakfast", recipeName: "Oats" }),
      serving({ id: "c", mealType: "lunch", recipeName: "Soup" }),
    ]);
    expect(sections.map((s) => s.mealType)).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("omits meal types with nothing in them", () => {
    const sections = groupPool([serving({ id: "a", mealType: "lunch" })]);
    expect(sections.map((s) => s.mealType)).toEqual(["lunch"]);
  });

  it("puts cooked food first — it exists, it is going off, and it needs no work", () => {
    const sections = groupPool([
      serving({ id: "a", recipeName: "Needs cooking", isCooked: false }),
      serving({ id: "b", recipeName: "Ready now", isCooked: true, daysLeft: 3 }),
    ]);
    expect(sections[0].groups[0].recipeName).toBe("Ready now");
  });

  it("orders by urgency, and acts on the most urgent serving in a group", () => {
    const sections = groupPool([
      serving({ id: "later", recipeName: "Chilli", isCooked: true, daysLeft: 4 }),
      serving({ id: "today", recipeName: "Chilli", isCooked: true, daysLeft: 0 }),
      serving({ id: "tomorrow", recipeName: "Chilli", isCooked: true, daysLeft: 1 }),
    ]);
    const group = sections[0].groups[0];
    expect(group.count).toBe(3);
    // Eating from the group should take the one about to go off, not any of them.
    expect(group.next.id).toBe("today");
    expect(group.daysLeft).toBe(0);
  });

  it("sorts servings with no expiry last rather than treating them as urgent", () => {
    const sections = groupPool([
      serving({ id: "unknown", recipeName: "Chilli", isCooked: true, daysLeft: null }),
      serving({ id: "soon", recipeName: "Chilli", isCooked: true, daysLeft: 2 }),
    ]);
    expect(sections[0].groups[0].next.id).toBe("soon");
  });

  it("counts how much of a section is already cooked", () => {
    const sections = groupPool([
      serving({ id: "a", recipeName: "Chilli", isCooked: true, daysLeft: 1 }),
      serving({ id: "b", recipeName: "Chilli", isCooked: true, daysLeft: 1 }),
      serving({ id: "c", recipeName: "Pasta", isCooked: false }),
    ]);
    expect(sections[0].count).toBe(3);
    expect(sections[0].cookedCount).toBe(2);
  });

  it("gives every group a key that is stable and distinct", () => {
    const sections = groupPool([
      serving({ id: "a", recipeName: "Chilli", isCooked: true }),
      serving({ id: "b", recipeName: "Chilli", isCooked: false }),
      serving({ id: "c", recipeName: "Pasta", isCooked: false }),
    ]);
    const keys = sections.flatMap((s) => s.groups.map((g) => g.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
