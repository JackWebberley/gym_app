/// The ingredient and pack-size library (spec §8.9).
///
/// This table is the bottleneck for the whole optimiser: it can only reason about
/// packs it knows exist. No free UK grocery API is worth building on, so this is
/// ~120 ingredients of the kind actually cooked in this house, with typical UK
/// supermarket pack sizes and rough mid-range prices.
///
/// **Prices drift and that is fine.** The optimiser needs relative pack economics
/// — is the 650g pack better value than two 300s, is a surplus of this worth
/// caring about — and those stay stable long after the absolute prices are stale.
/// Correct anything that looks wrong from the Ingredients screen; a re-seed never
/// overwrites a price or pack you have edited by hand.

export type PackSeed = {
  label: string;
  grams: number;
  priceGbp?: number;
  isDivisible?: boolean;
};

export type IngredientSeed = {
  name: string;
  aisle:
    | "produce"
    | "meat"
    | "fish"
    | "dairy"
    | "bakery"
    | "dry"
    | "tinned"
    | "frozen"
    | "condiment";
  shelfLifeDays: number;
  freezable?: boolean;
  isStaple?: boolean;
  unitGrams?: number;
  /** kcal, protein, carbs, fat — per 100g. */
  per100g: [number, number, number, number];
  packs: PackSeed[];
};

export const INGREDIENTS: IngredientSeed[] = [
  // ── Meat ──────────────────────────────────────────────────────────────────
  {
    name: "Chicken breast",
    aisle: "meat",
    shelfLifeDays: 3,
    freezable: true,
    unitGrams: 165,
    per100g: [106, 24, 0, 1.2],
    packs: [
      { label: "300g pack", grams: 300, priceGbp: 3.3 },
      { label: "650g pack", grams: 650, priceGbp: 6.2 },
      { label: "1kg pack", grams: 1000, priceGbp: 8.5 },
    ],
  },
  {
    name: "Chicken thigh (boneless)",
    aisle: "meat",
    shelfLifeDays: 3,
    freezable: true,
    unitGrams: 90,
    per100g: [148, 20, 0, 7.5],
    packs: [
      { label: "500g pack", grams: 500, priceGbp: 3.6 },
      { label: "1kg pack", grams: 1000, priceGbp: 6.4 },
    ],
  },
  {
    name: "Beef mince (5% fat)",
    aisle: "meat",
    shelfLifeDays: 3,
    freezable: true,
    per100g: [136, 21, 0, 5],
    packs: [
      { label: "500g pack", grams: 500, priceGbp: 4.5 },
      { label: "750g pack", grams: 750, priceGbp: 6.3 },
    ],
  },
  {
    name: "Turkey mince (5% fat)",
    aisle: "meat",
    shelfLifeDays: 3,
    freezable: true,
    per100g: [120, 22, 0, 3.5],
    packs: [{ label: "500g pack", grams: 500, priceGbp: 3.9 }],
  },
  {
    name: "Pork loin steak",
    aisle: "meat",
    shelfLifeDays: 3,
    freezable: true,
    unitGrams: 140,
    per100g: [140, 22, 0, 5.8],
    packs: [{ label: "4 pack", grams: 560, priceGbp: 4.5 }],
  },
  {
    name: "Bacon medallions",
    aisle: "meat",
    shelfLifeDays: 7,
    freezable: true,
    unitGrams: 20,
    per100g: [138, 23, 0.5, 5],
    packs: [{ label: "200g pack", grams: 200, priceGbp: 2.5 }],
  },
  {
    name: "Chorizo",
    aisle: "meat",
    shelfLifeDays: 21,
    freezable: true,
    per100g: [340, 22, 2, 27],
    packs: [{ label: "160g pack", grams: 160, priceGbp: 2.2 }],
  },
  {
    name: "Sausages",
    aisle: "meat",
    shelfLifeDays: 5,
    freezable: true,
    unitGrams: 57,
    per100g: [270, 14, 8, 20],
    packs: [{ label: "pack of 6", grams: 340, priceGbp: 3 }],
  },

  // ── Fish ──────────────────────────────────────────────────────────────────
  {
    name: "Salmon fillet",
    aisle: "fish",
    shelfLifeDays: 2,
    freezable: true,
    unitGrams: 130,
    per100g: [208, 20, 0, 13],
    packs: [
      { label: "2 fillets", grams: 260, priceGbp: 4.5 },
      { label: "4 fillets", grams: 520, priceGbp: 8 },
    ],
  },
  {
    name: "Cod fillet",
    aisle: "fish",
    shelfLifeDays: 2,
    freezable: true,
    unitGrams: 130,
    per100g: [82, 18, 0, 0.7],
    packs: [{ label: "2 fillets", grams: 260, priceGbp: 4.2 }],
  },
  {
    name: "Tinned tuna",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [109, 25, 0, 1],
    packs: [
      { label: "145g tin", grams: 112, priceGbp: 1.1 },
      { label: "4 × 145g", grams: 448, priceGbp: 3.8 },
    ],
  },
  {
    name: "Smoked salmon",
    aisle: "fish",
    shelfLifeDays: 7,
    freezable: true,
    per100g: [180, 25, 0, 9],
    packs: [{ label: "100g pack", grams: 100, priceGbp: 3 }],
  },
  {
    name: "King prawns",
    aisle: "frozen",
    shelfLifeDays: 180,
    freezable: true,
    per100g: [71, 17, 0, 0.6],
    packs: [{ label: "300g bag", grams: 300, priceGbp: 4 }],
  },

  // ── Dairy and eggs ────────────────────────────────────────────────────────
  {
    name: "Eggs",
    aisle: "dairy",
    shelfLifeDays: 21,
    unitGrams: 58,
    per100g: [143, 13, 0.7, 9.5],
    packs: [
      { label: "box of 6", grams: 348, priceGbp: 1.6 },
      { label: "box of 12", grams: 696, priceGbp: 2.9 },
    ],
  },
  {
    name: "Semi-skimmed milk",
    aisle: "dairy",
    shelfLifeDays: 7,
    per100g: [50, 3.6, 4.8, 1.8],
    packs: [
      { label: "1 pint", grams: 568, priceGbp: 0.75 },
      { label: "2 pints", grams: 1136, priceGbp: 1.3 },
      { label: "4 pints", grams: 2272, priceGbp: 1.75 },
    ],
  },
  {
    name: "Greek yoghurt (0% fat)",
    aisle: "dairy",
    shelfLifeDays: 14,
    per100g: [57, 10, 4, 0.2],
    packs: [
      { label: "500g pot", grams: 500, priceGbp: 1.75 },
      { label: "1kg tub", grams: 1000, priceGbp: 2.75 },
    ],
  },
  {
    name: "Cheddar",
    aisle: "dairy",
    shelfLifeDays: 21,
    freezable: true,
    per100g: [416, 25, 0.1, 35],
    packs: [
      { label: "200g block", grams: 200, priceGbp: 2.4 },
      { label: "400g block", grams: 400, priceGbp: 4 },
    ],
  },
  {
    name: "Feta",
    aisle: "dairy",
    shelfLifeDays: 14,
    per100g: [264, 14, 1.5, 22],
    packs: [{ label: "200g block", grams: 200, priceGbp: 2.2 }],
  },
  {
    name: "Halloumi",
    aisle: "dairy",
    shelfLifeDays: 21,
    freezable: true,
    per100g: [321, 22, 2, 25],
    packs: [{ label: "225g block", grams: 225, priceGbp: 2.75 }],
  },
  {
    name: "Mozzarella",
    aisle: "dairy",
    shelfLifeDays: 10,
    per100g: [280, 19, 2, 22],
    packs: [{ label: "125g ball", grams: 125, priceGbp: 1 }],
  },
  {
    name: "Parmesan",
    aisle: "dairy",
    shelfLifeDays: 60,
    per100g: [402, 36, 0.9, 29],
    packs: [{ label: "100g piece", grams: 100, priceGbp: 2.6 }],
  },
  {
    name: "Butter",
    aisle: "dairy",
    shelfLifeDays: 45,
    freezable: true,
    isStaple: true,
    per100g: [744, 0.6, 0.6, 82],
    packs: [{ label: "250g block", grams: 250, priceGbp: 2.2 }],
  },
  {
    name: "Creme fraiche (half fat)",
    aisle: "dairy",
    shelfLifeDays: 14,
    per100g: [162, 3, 4, 15],
    packs: [{ label: "300g pot", grams: 300, priceGbp: 1.4 }],
  },
  {
    name: "Cottage cheese",
    aisle: "dairy",
    shelfLifeDays: 10,
    per100g: [98, 12, 3, 4],
    packs: [{ label: "300g pot", grams: 300, priceGbp: 1.3 }],
  },
  {
    name: "Tofu (firm)",
    aisle: "dairy",
    shelfLifeDays: 14,
    per100g: [120, 13, 2, 7],
    packs: [{ label: "280g block", grams: 280, priceGbp: 2.2 }],
  },

  // ── Produce ───────────────────────────────────────────────────────────────
  {
    name: "Onion",
    aisle: "produce",
    shelfLifeDays: 30,
    unitGrams: 110,
    per100g: [40, 1.1, 9, 0.1],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 1.1, isDivisible: true },
      { label: "pack of 3", grams: 330, priceGbp: 0.99 },
      { label: "1kg bag", grams: 1000, priceGbp: 1.05 },
    ],
  },
  {
    name: "Red onion",
    aisle: "produce",
    shelfLifeDays: 30,
    unitGrams: 110,
    per100g: [42, 1.1, 9.5, 0.1],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 1.4, isDivisible: true },
      { label: "pack of 3", grams: 330, priceGbp: 1.1 },
    ],
  },
  {
    name: "Garlic",
    aisle: "produce",
    shelfLifeDays: 60,
    isStaple: true,
    unitGrams: 5,
    per100g: [149, 6.4, 33, 0.5],
    packs: [{ label: "3 bulbs", grams: 150, priceGbp: 0.85 }],
  },
  {
    name: "Potatoes",
    aisle: "produce",
    shelfLifeDays: 30,
    unitGrams: 180,
    per100g: [77, 2, 17, 0.1],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 1.2, isDivisible: true },
      { label: "2.5kg bag", grams: 2500, priceGbp: 2.2 },
    ],
  },
  {
    name: "Sweet potato",
    aisle: "produce",
    shelfLifeDays: 21,
    unitGrams: 200,
    per100g: [86, 1.6, 20, 0.1],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 1.9, isDivisible: true },
      { label: "1kg bag", grams: 1000, priceGbp: 1.6 },
    ],
  },
  {
    name: "Carrots",
    aisle: "produce",
    shelfLifeDays: 21,
    unitGrams: 80,
    per100g: [41, 0.9, 9.6, 0.2],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 0.9, isDivisible: true },
      { label: "1kg bag", grams: 1000, priceGbp: 0.75 },
    ],
  },
  {
    name: "Broccoli",
    aisle: "produce",
    shelfLifeDays: 7,
    freezable: true,
    unitGrams: 350,
    per100g: [34, 2.8, 7, 0.4],
    packs: [{ label: "1 head", grams: 350, priceGbp: 0.75 }],
  },
  {
    name: "Courgette",
    aisle: "produce",
    shelfLifeDays: 7,
    unitGrams: 200,
    per100g: [17, 1.2, 3.1, 0.3],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 2, isDivisible: true },
      { label: "pack of 2", grams: 400, priceGbp: 1 },
    ],
  },
  {
    name: "Red pepper",
    aisle: "produce",
    shelfLifeDays: 10,
    unitGrams: 160,
    per100g: [31, 1, 6, 0.3],
    packs: [
      { label: "single", grams: 160, priceGbp: 0.65, isDivisible: true },
      { label: "pack of 3", grams: 480, priceGbp: 1.5 },
    ],
  },
  {
    name: "Mushrooms",
    aisle: "produce",
    shelfLifeDays: 6,
    per100g: [22, 3.1, 3.3, 0.3],
    packs: [{ label: "250g pack", grams: 250, priceGbp: 1 }],
  },
  {
    name: "Cherry tomatoes",
    aisle: "produce",
    shelfLifeDays: 8,
    per100g: [18, 0.9, 3.9, 0.2],
    packs: [{ label: "330g punnet", grams: 330, priceGbp: 1.2 }],
  },
  {
    name: "Spinach",
    aisle: "produce",
    shelfLifeDays: 5,
    freezable: true,
    per100g: [23, 2.9, 3.6, 0.4],
    packs: [
      { label: "260g bag", grams: 260, priceGbp: 1.6 },
      { label: "500g bag", grams: 500, priceGbp: 2.5 },
    ],
  },
  {
    name: "Salad leaves",
    aisle: "produce",
    shelfLifeDays: 4,
    per100g: [17, 1.4, 2, 0.3],
    packs: [{ label: "100g bag", grams: 100, priceGbp: 1 }],
  },
  {
    name: "Cucumber",
    aisle: "produce",
    shelfLifeDays: 8,
    unitGrams: 300,
    per100g: [15, 0.7, 3, 0.1],
    packs: [{ label: "single", grams: 300, priceGbp: 0.8 }],
  },
  {
    name: "Avocado",
    aisle: "produce",
    shelfLifeDays: 5,
    unitGrams: 140,
    per100g: [160, 2, 9, 15],
    packs: [
      { label: "single", grams: 140, priceGbp: 0.9, isDivisible: true },
      { label: "pack of 2", grams: 280, priceGbp: 1.5 },
    ],
  },
  {
    name: "Lemon",
    aisle: "produce",
    shelfLifeDays: 14,
    unitGrams: 90,
    per100g: [29, 1.1, 9, 0.3],
    packs: [
      { label: "single", grams: 90, priceGbp: 0.35, isDivisible: true },
      { label: "pack of 4", grams: 360, priceGbp: 0.9 },
    ],
  },
  {
    name: "Lime",
    aisle: "produce",
    shelfLifeDays: 14,
    unitGrams: 70,
    per100g: [30, 0.7, 11, 0.2],
    packs: [{ label: "pack of 4", grams: 280, priceGbp: 0.9 }],
  },
  {
    name: "Banana",
    aisle: "produce",
    shelfLifeDays: 6,
    unitGrams: 118,
    per100g: [89, 1.1, 23, 0.3],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 1, isDivisible: true },
      { label: "pack of 5", grams: 590, priceGbp: 0.9 },
    ],
  },
  {
    name: "Blueberries",
    aisle: "produce",
    shelfLifeDays: 7,
    freezable: true,
    per100g: [57, 0.7, 14, 0.3],
    packs: [{ label: "150g punnet", grams: 150, priceGbp: 2 }],
  },
  {
    name: "Apple",
    aisle: "produce",
    shelfLifeDays: 20,
    unitGrams: 150,
    per100g: [52, 0.3, 14, 0.2],
    packs: [
      { label: "loose", grams: 1000, priceGbp: 2, isDivisible: true },
      { label: "pack of 6", grams: 900, priceGbp: 1.7 },
    ],
  },
  {
    name: "Spring onion",
    aisle: "produce",
    shelfLifeDays: 7,
    unitGrams: 15,
    per100g: [32, 1.8, 7, 0.2],
    packs: [{ label: "bunch", grams: 100, priceGbp: 0.6 }],
  },
  {
    name: "Fresh basil",
    aisle: "produce",
    shelfLifeDays: 3,
    per100g: [23, 3.2, 2.7, 0.6],
    packs: [{ label: "30g pack", grams: 30, priceGbp: 1.1 }],
  },
  {
    name: "Fresh coriander",
    aisle: "produce",
    shelfLifeDays: 3,
    per100g: [23, 2.1, 3.7, 0.5],
    packs: [{ label: "30g pack", grams: 30, priceGbp: 1.1 }],
  },
  {
    name: "Fresh parsley",
    aisle: "produce",
    shelfLifeDays: 4,
    per100g: [36, 3, 6, 0.8],
    packs: [{ label: "30g pack", grams: 30, priceGbp: 1.1 }],
  },
  {
    name: "Ginger",
    aisle: "produce",
    shelfLifeDays: 21,
    isStaple: true,
    per100g: [80, 1.8, 18, 0.8],
    packs: [{ label: "loose", grams: 200, priceGbp: 0.5, isDivisible: true }],
  },
  {
    name: "Chilli",
    aisle: "produce",
    shelfLifeDays: 10,
    freezable: true,
    unitGrams: 15,
    per100g: [40, 1.9, 9, 0.4],
    packs: [{ label: "pack", grams: 60, priceGbp: 0.7 }],
  },
  {
    name: "Green beans",
    aisle: "produce",
    shelfLifeDays: 7,
    freezable: true,
    per100g: [31, 1.8, 7, 0.1],
    packs: [{ label: "220g pack", grams: 220, priceGbp: 1.2 }],
  },
  {
    name: "Cauliflower",
    aisle: "produce",
    shelfLifeDays: 8,
    unitGrams: 600,
    per100g: [25, 1.9, 5, 0.3],
    packs: [{ label: "1 head", grams: 600, priceGbp: 1.1 }],
  },
  {
    name: "Cabbage (white)",
    aisle: "produce",
    shelfLifeDays: 21,
    unitGrams: 900,
    per100g: [25, 1.3, 6, 0.1],
    packs: [{ label: "1 head", grams: 900, priceGbp: 0.9 }],
  },
  {
    name: "Leek",
    aisle: "produce",
    shelfLifeDays: 12,
    unitGrams: 150,
    per100g: [61, 1.5, 14, 0.3],
    packs: [{ label: "pack of 3", grams: 450, priceGbp: 1.3 }],
  },
  {
    name: "Butternut squash",
    aisle: "produce",
    shelfLifeDays: 30,
    freezable: true,
    unitGrams: 900,
    per100g: [45, 1, 12, 0.1],
    packs: [{ label: "single", grams: 900, priceGbp: 1.5 }],
  },
  {
    name: "Aubergine",
    aisle: "produce",
    shelfLifeDays: 7,
    unitGrams: 250,
    per100g: [25, 1, 6, 0.2],
    packs: [{ label: "single", grams: 250, priceGbp: 0.85 }],
  },

  // ── Dry goods ─────────────────────────────────────────────────────────────
  {
    name: "Basmati rice",
    aisle: "dry",
    shelfLifeDays: 540,
    per100g: [356, 8.5, 78, 1],
    packs: [
      { label: "500g", grams: 500, priceGbp: 1.3 },
      { label: "1kg", grams: 1000, priceGbp: 2.1 },
      { label: "4kg", grams: 4000, priceGbp: 6.5 },
    ],
  },
  {
    name: "Brown rice",
    aisle: "dry",
    shelfLifeDays: 540,
    per100g: [349, 7.9, 72, 2.4],
    packs: [{ label: "1kg", grams: 1000, priceGbp: 2 }],
  },
  {
    name: "Pasta (penne)",
    aisle: "dry",
    shelfLifeDays: 720,
    per100g: [352, 12, 71, 1.5],
    packs: [
      { label: "500g", grams: 500, priceGbp: 0.85 },
      { label: "1kg", grams: 1000, priceGbp: 1.5 },
    ],
  },
  {
    name: "Spaghetti",
    aisle: "dry",
    shelfLifeDays: 720,
    per100g: [352, 12, 71, 1.5],
    packs: [{ label: "500g", grams: 500, priceGbp: 0.85 }],
  },
  {
    name: "Couscous",
    aisle: "dry",
    shelfLifeDays: 540,
    per100g: [358, 12, 72, 0.6],
    packs: [{ label: "500g", grams: 500, priceGbp: 1.3 }],
  },
  {
    name: "Rolled oats",
    aisle: "dry",
    shelfLifeDays: 365,
    per100g: [379, 13, 60, 8],
    packs: [
      { label: "1kg", grams: 1000, priceGbp: 1.3 },
      { label: "3kg", grams: 3000, priceGbp: 3.2 },
    ],
  },
  {
    name: "Red lentils",
    aisle: "dry",
    shelfLifeDays: 720,
    per100g: [352, 25, 60, 1.1],
    packs: [{ label: "500g", grams: 500, priceGbp: 1.4 }],
  },
  {
    name: "Quinoa",
    aisle: "dry",
    shelfLifeDays: 540,
    per100g: [368, 14, 64, 6],
    packs: [{ label: "500g", grams: 500, priceGbp: 2.6 }],
  },
  {
    name: "Wholemeal flour",
    aisle: "dry",
    shelfLifeDays: 270,
    isStaple: true,
    per100g: [340, 13, 64, 2.5],
    packs: [{ label: "1.5kg", grams: 1500, priceGbp: 1.3 }],
  },
  {
    name: "Plain flour",
    aisle: "dry",
    shelfLifeDays: 365,
    isStaple: true,
    per100g: [341, 10, 71, 1.3],
    packs: [{ label: "1.5kg", grams: 1500, priceGbp: 0.85 }],
  },
  {
    name: "Whey protein powder",
    aisle: "dry",
    shelfLifeDays: 540,
    per100g: [380, 78, 8, 4],
    packs: [{ label: "1kg tub", grams: 1000, priceGbp: 22 }],
  },
  {
    name: "Peanut butter",
    aisle: "dry",
    shelfLifeDays: 180,
    per100g: [598, 25, 12, 50],
    packs: [{ label: "340g jar", grams: 340, priceGbp: 2.6 }],
  },
  {
    name: "Almonds",
    aisle: "dry",
    shelfLifeDays: 270,
    per100g: [579, 21, 22, 50],
    packs: [{ label: "200g bag", grams: 200, priceGbp: 2.5 }],
  },
  {
    name: "Cashews",
    aisle: "dry",
    shelfLifeDays: 270,
    per100g: [553, 18, 30, 44],
    packs: [{ label: "200g bag", grams: 200, priceGbp: 2.8 }],
  },
  {
    name: "Honey",
    aisle: "dry",
    shelfLifeDays: 720,
    isStaple: true,
    per100g: [304, 0.3, 82, 0],
    packs: [{ label: "340g jar", grams: 340, priceGbp: 2.3 }],
  },

  // ── Tinned ────────────────────────────────────────────────────────────────
  {
    name: "Chopped tomatoes",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [24, 1.2, 4, 0.2],
    packs: [
      { label: "400g tin", grams: 400, priceGbp: 0.55 },
      { label: "4 × 400g", grams: 1600, priceGbp: 1.9 },
    ],
  },
  {
    name: "Chickpeas",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [120, 7.2, 16, 2.1],
    packs: [
      { label: "400g tin", grams: 240, priceGbp: 0.6 },
      { label: "4 × 400g", grams: 960, priceGbp: 2.1 },
    ],
  },
  {
    name: "Black beans",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [114, 7.5, 15, 0.6],
    packs: [{ label: "400g tin", grams: 240, priceGbp: 0.7 }],
  },
  {
    name: "Kidney beans",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [100, 6.9, 13, 0.5],
    packs: [{ label: "400g tin", grams: 240, priceGbp: 0.6 }],
  },
  {
    name: "Coconut milk",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [169, 1.6, 3, 17],
    packs: [{ label: "400ml tin", grams: 400, priceGbp: 1.1 }],
  },
  {
    name: "Passata",
    aisle: "tinned",
    shelfLifeDays: 540,
    per100g: [32, 1.5, 5.5, 0.2],
    packs: [{ label: "500g carton", grams: 500, priceGbp: 0.75 }],
  },
  {
    name: "Sweetcorn",
    aisle: "tinned",
    shelfLifeDays: 730,
    per100g: [86, 3, 19, 1.2],
    packs: [{ label: "325g tin", grams: 285, priceGbp: 0.7 }],
  },

  // ── Frozen ────────────────────────────────────────────────────────────────
  {
    name: "Frozen peas",
    aisle: "frozen",
    shelfLifeDays: 300,
    freezable: true,
    per100g: [81, 5.4, 14, 0.4],
    packs: [
      { label: "900g bag", grams: 900, priceGbp: 1.4 },
      { label: "1.5kg bag", grams: 1500, priceGbp: 2 },
    ],
  },
  {
    name: "Frozen mixed vegetables",
    aisle: "frozen",
    shelfLifeDays: 300,
    freezable: true,
    per100g: [56, 3, 9, 0.5],
    packs: [{ label: "1kg bag", grams: 1000, priceGbp: 1.5 }],
  },
  {
    name: "Frozen spinach",
    aisle: "frozen",
    shelfLifeDays: 300,
    freezable: true,
    per100g: [26, 3, 1.5, 0.5],
    packs: [{ label: "1kg bag", grams: 1000, priceGbp: 1.8 }],
  },
  {
    name: "Frozen berries",
    aisle: "frozen",
    shelfLifeDays: 300,
    freezable: true,
    per100g: [45, 0.9, 8, 0.3],
    packs: [{ label: "500g bag", grams: 500, priceGbp: 2.5 }],
  },

  // ── Bakery ────────────────────────────────────────────────────────────────
  {
    name: "Wholemeal bread",
    aisle: "bakery",
    shelfLifeDays: 5,
    freezable: true,
    unitGrams: 40,
    per100g: [247, 10, 41, 3],
    packs: [{ label: "800g loaf", grams: 800, priceGbp: 1.4 }],
  },
  {
    name: "Wraps (wholemeal)",
    aisle: "bakery",
    shelfLifeDays: 14,
    freezable: true,
    unitGrams: 62,
    per100g: [297, 9, 48, 7],
    packs: [{ label: "pack of 6", grams: 372, priceGbp: 1.3 }],
  },
  {
    name: "Bagels",
    aisle: "bakery",
    shelfLifeDays: 7,
    freezable: true,
    unitGrams: 85,
    per100g: [267, 10, 50, 1.5],
    packs: [{ label: "pack of 5", grams: 425, priceGbp: 1.4 }],
  },
  {
    name: "Pitta bread",
    aisle: "bakery",
    shelfLifeDays: 7,
    freezable: true,
    unitGrams: 60,
    per100g: [275, 9, 55, 1.2],
    packs: [{ label: "pack of 6", grams: 360, priceGbp: 0.9 }],
  },

  // ── Condiments and staples ────────────────────────────────────────────────
  {
    name: "Olive oil",
    aisle: "condiment",
    shelfLifeDays: 540,
    isStaple: true,
    per100g: [884, 0, 0, 100],
    packs: [{ label: "500ml", grams: 500, priceGbp: 4 }],
  },
  {
    name: "Salt",
    aisle: "condiment",
    shelfLifeDays: 3650,
    isStaple: true,
    per100g: [0, 0, 0, 0],
    packs: [{ label: "750g", grams: 750, priceGbp: 0.65 }],
  },
  {
    name: "Black pepper",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [251, 10, 64, 3.3],
    packs: [{ label: "50g", grams: 50, priceGbp: 1.2 }],
  },
  {
    name: "Soy sauce",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [53, 8, 4.9, 0.1],
    packs: [{ label: "150ml", grams: 150, priceGbp: 1.6 }],
  },
  {
    name: "Tomato puree",
    aisle: "condiment",
    shelfLifeDays: 365,
    isStaple: true,
    per100g: [82, 4.3, 16, 0.5],
    packs: [{ label: "200g tube", grams: 200, priceGbp: 0.8 }],
  },
  {
    name: "Stock cubes",
    aisle: "condiment",
    shelfLifeDays: 540,
    isStaple: true,
    unitGrams: 10,
    per100g: [230, 12, 22, 11],
    packs: [{ label: "pack of 12", grams: 120, priceGbp: 1.3 }],
  },
  {
    name: "Cumin",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [375, 18, 44, 22],
    packs: [{ label: "45g jar", grams: 45, priceGbp: 1.1 }],
  },
  {
    name: "Smoked paprika",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [282, 14, 54, 13],
    packs: [{ label: "45g jar", grams: 45, priceGbp: 1.2 }],
  },
  {
    name: "Curry powder",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [325, 14, 56, 14],
    packs: [{ label: "85g jar", grams: 85, priceGbp: 1.3 }],
  },
  {
    name: "Dried oregano",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [265, 9, 69, 4.3],
    packs: [{ label: "20g jar", grams: 20, priceGbp: 1 }],
  },
  {
    name: "Chilli flakes",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [318, 12, 57, 17],
    packs: [{ label: "35g jar", grams: 35, priceGbp: 1.1 }],
  },
  {
    name: "Balsamic vinegar",
    aisle: "condiment",
    shelfLifeDays: 730,
    isStaple: true,
    per100g: [88, 0.5, 17, 0],
    packs: [{ label: "250ml", grams: 250, priceGbp: 1.8 }],
  },
  {
    name: "Mayonnaise (light)",
    aisle: "condiment",
    shelfLifeDays: 120,
    per100g: [280, 1, 8, 27],
    packs: [{ label: "500g jar", grams: 500, priceGbp: 2.2 }],
  },
  {
    name: "Sriracha",
    aisle: "condiment",
    shelfLifeDays: 540,
    isStaple: true,
    per100g: [93, 2, 19, 1],
    packs: [{ label: "250ml", grams: 250, priceGbp: 2 }],
  },
  {
    name: "Harissa paste",
    aisle: "condiment",
    shelfLifeDays: 180,
    per100g: [150, 3, 12, 10],
    packs: [{ label: "90g tube", grams: 90, priceGbp: 1.5 }],
  },
  {
    name: "Pesto",
    aisle: "condiment",
    shelfLifeDays: 120,
    per100g: [430, 5, 6, 43],
    packs: [{ label: "190g jar", grams: 190, priceGbp: 1.9 }],
  },
  {
    name: "Wholegrain mustard",
    aisle: "condiment",
    shelfLifeDays: 365,
    isStaple: true,
    per100g: [140, 8, 6, 10],
    packs: [{ label: "180g jar", grams: 180, priceGbp: 1.1 }],
  },
];
