import { describe, expect, it } from "vitest";
import { cheapestPacks, describeQuantity, formatGrams } from "../meal/packs";
import type { PackSpec } from "../meal/types";

function pack(partial: Partial<PackSpec> & { id: string; grams: number }): PackSpec {
  return {
    label: partial.id,
    priceGbp: null,
    isDivisible: false,
    ...partial,
  };
}

describe("cheapestPacks", () => {
  it("buys nothing when nothing is needed", () => {
    const choice = cheapestPacks([pack({ id: "a", grams: 500, priceGbp: 2 })], 0);
    expect(choice?.count).toBe(0);
    expect(choice?.gramsBought).toBe(0);
  });

  it("returns null when no pack data exists at all", () => {
    expect(cheapestPacks([], 300)).toBeNull();
  });

  it("buys exactly what is needed from a divisible pack", () => {
    const loose = pack({ id: "loose", grams: 1000, priceGbp: 1.2, isDivisible: true });
    const choice = cheapestPacks([loose], 330);
    expect(choice?.gramsBought).toBe(330);
    expect(choice?.surplusGrams).toBe(0);
    expect(choice?.priceGbp).toBeCloseTo(0.4, 2);
  });

  it("prefers a divisible pack over an indivisible one that would leave surplus", () => {
    const choice = cheapestPacks(
      [
        pack({ id: "loose", grams: 1000, priceGbp: 2, isDivisible: true }),
        pack({ id: "bag", grams: 2500, priceGbp: 2.2 }),
      ],
      400,
    );
    expect(choice?.packId).toBe("loose");
    expect(choice?.surplusGrams).toBe(0);
  });

  it("multiplies a single pack when one is not enough", () => {
    const choice = cheapestPacks([pack({ id: "p", grams: 650, priceGbp: 5 })], 1200);
    expect(choice?.count).toBe(2);
    expect(choice?.gramsBought).toBe(1300);
    expect(choice?.surplusGrams).toBe(100);
    expect(choice?.priceGbp).toBe(10);
  });

  it("mixes pack sizes when the mix is cheaper than repeating one", () => {
    // 900g needed. Two 650s cost £10; three 400s cost £10.50; a 650 + a 400 costs
    // £8.50. A person would buy the mix, and so should this.
    const choice = cheapestPacks(
      [
        pack({ id: "big", grams: 650, priceGbp: 5 }),
        pack({ id: "small", grams: 400, priceGbp: 3.5 }),
      ],
      900,
    );
    expect(choice?.priceGbp).toBe(8.5);
    expect(choice?.gramsBought).toBe(1050);
    expect(choice?.label).toBe("big + small");
  });

  it("breaks a price tie on the least surplus", () => {
    // 3 × 300g and 650g + 300g both cost £7.50, but one covers 900g exactly.
    const choice = cheapestPacks(
      [
        pack({ id: "big", grams: 650, priceGbp: 5 }),
        pack({ id: "small", grams: 300, priceGbp: 2.5 }),
      ],
      900,
    );
    expect(choice?.priceGbp).toBe(7.5);
    expect(choice?.surplusGrams).toBe(0);
  });

  it("never lets an unpriced option displace a priced one", () => {
    const choice = cheapestPacks(
      [
        pack({ id: "priced", grams: 500, priceGbp: 3 }),
        pack({ id: "unpriced", grams: 400, priceGbp: null }),
      ],
      400,
    );
    expect(choice?.priceGbp).toBe(3);
  });

  it("falls back to least surplus when nothing is priced", () => {
    const choice = cheapestPacks(
      [pack({ id: "loose-fit", grams: 250 }), pack({ id: "oversized", grams: 2000 })],
      200,
    );
    expect(choice?.gramsBought).toBe(250);
  });
});

describe("formatGrams", () => {
  it("switches to kg past a kilo", () => {
    expect(formatGrams(450)).toBe("450g");
    expect(formatGrams(1000)).toBe("1kg");
    expect(formatGrams(1100)).toBe("1.1kg");
  });
});

describe("describeQuantity", () => {
  it("counts units when the ingredient has a unit weight", () => {
    expect(describeQuantity(1080, 180)).toBe("6 (~1.1kg)");
  });

  it("falls back to weight when it does not", () => {
    expect(describeQuantity(650, null)).toBe("650g");
  });
});
