import { describe, expect, it } from "vitest";
import { hintsFromAttempts, mergeHints, sortHints } from "./feed-hints";

describe("feed hints", () => {
  it("merges without duplicating and keeps fire over warm", () => {
    const merged = mergeHints([{ pokemon: "Mew", result: "warm" }], [{ pokemon: "Mew", result: "fire" }, { pokemon: "Eevee", result: "warm" }]);
    expect(merged).toEqual([{ pokemon: "Mew", result: "fire" }, { pokemon: "Eevee", result: "warm" }]);
  });

  it("returns the same list when nothing changes", () => {
    const previous = [{ pokemon: "Mew", result: "fire" as const }];
    expect(mergeHints(previous, [{ pokemon: "Mew", result: "warm" }])).toBe(previous);
    expect(mergeHints(previous, [])).toBe(previous);
  });

  it("ignores cold attempts", () => {
    const attempts = [
      { id: 1, nickname: "A", pokemon: "Mew", result: "cold" as const, isWinner: false },
      { id: 2, nickname: "A", pokemon: "Eevee", result: "warm" as const, isWinner: false },
    ];
    expect(hintsFromAttempts(attempts)).toEqual([{ pokemon: "Eevee", result: "warm" }]);
  });

  it("sorts fire first, then alphabetical", () => {
    const sorted = sortHints([
      { pokemon: "Zubat", result: "warm" },
      { pokemon: "Ñu", result: "fire" },
      { pokemon: "Abra", result: "warm" },
    ]);
    expect(sorted.map((h) => h.pokemon)).toEqual(["Ñu", "Abra", "Zubat"]);
  });
});
