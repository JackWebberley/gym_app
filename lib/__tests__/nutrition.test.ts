import { describe, expect, it } from "vitest";
import {
  buildSystemBlocks,
  normaliseFoodName,
  resolveFromLibrary,
  roundCalories,
  type LibraryEntry,
} from "../nutrition";

function entry(name: string, aliases: string[] = []): LibraryEntry {
  return { id: name, name, aliases, calories: 240, proteinG: 32, carbsG: 14, fatG: 6 };
}

describe("normaliseFoodName", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normaliseFoodName("  Protein Shake (1 scoop) ")).toBe("protein shake 1 scoop");
  });

  it("keeps numbers, which carry the portion", () => {
    expect(normaliseFoodName("2 Weetabix")).toBe("2 weetabix");
  });

  it("is empty for a blank input", () => {
    expect(normaliseFoodName("   ")).toBe("");
  });
});

describe("resolveFromLibrary", () => {
  const library = [
    entry("Protein shake (1 scoop, 300ml semi-skimmed)", ["protein shake", "shake"]),
    entry("Banana (medium, ~118g)"),
  ];

  it("matches the canonical name regardless of formatting", () => {
    const hit = resolveFromLibrary("protein shake (1 SCOOP, 300ml semi-skimmed)", library);
    expect(hit?.name).toBe("Protein shake (1 scoop, 300ml semi-skimmed)");
  });

  it("matches a recorded alias", () => {
    expect(resolveFromLibrary("Protein Shake", library)?.name).toContain("Protein shake");
  });

  it("returns null for anything novel, so the model gets asked", () => {
    expect(resolveFromLibrary("chicken jalfrezi and rice", library)).toBeNull();
  });

  it("does not match on a partial description", () => {
    // "protein shake and a banana" is two foods; resolving it to one saved food
    // would silently drop the banana.
    expect(resolveFromLibrary("protein shake and a banana", library)).toBeNull();
  });

  it("returns null for a blank description", () => {
    expect(resolveFromLibrary("  ", library)).toBeNull();
  });

  it("returns null against an empty library", () => {
    expect(resolveFromLibrary("protein shake", [])).toBeNull();
  });
});

describe("roundCalories", () => {
  it("rounds to the nearest 5", () => {
    expect(roundCalories(133)).toBe(135);
    expect(roundCalories(131)).toBe(130);
    expect(roundCalories(240)).toBe(240);
  });
});

describe("buildSystemBlocks", () => {
  const food = { name: "Protein shake", calories: 240, proteinG: 32, carbsG: 14, fatG: 6 };

  it("never emits an empty text block for an empty library", () => {
    // Regression: an empty second block is rejected with
    // "system: text content blocks must be non-empty" — and an empty library is
    // exactly the state of a fresh install, so this was the first request a new
    // user could ever make.
    const blocks = buildSystemBlocks([]);
    expect(blocks).toHaveLength(1);
    expect(blocks.every((b) => b.text.length > 0)).toBe(true);
  });

  it("appends the library when there is one", () => {
    const blocks = buildSystemBlocks([food]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].text).toContain("Protein shake");
    expect(blocks[1].text).toContain("240 kcal");
  });

  it("caches the stable prefix, not the varying library", () => {
    const blocks = buildSystemBlocks([food]);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it("keeps the instructions identical whether or not a library is sent", () => {
    expect(buildSystemBlocks([]) [0].text).toBe(buildSystemBlocks([food])[0].text);
  });

  it("emits no empty blocks for any library size", () => {
    for (const library of [[], [food], [food, { ...food, name: "Banana" }]]) {
      expect(buildSystemBlocks(library).every((b) => b.text.trim().length > 0)).toBe(true);
    }
  });
});
